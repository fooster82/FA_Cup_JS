const wtf = require('wtf_wikipedia');

// Small delay helper so we're not hammering the API back-to-back
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const HEADERS = {
  'User-Agent': 'FACupGroundsScript/1.0 (fooster@sky.com)'
};

// Converts degrees/minutes/seconds to decimal degrees, applying sign for S/W directions
function dmsToDecimal(parts, direction) {
  const deg = parseFloat(parts[0]) || 0;
  const min = parseFloat(parts[1]) || 0;
  const sec = parseFloat(parts[2]) || 0;
  let decimal = deg + (min / 60) + (sec / 3600);
  if (direction === 'S' || direction === 'W') decimal *= -1;
  return decimal;
}

// Rough bounding box covering England, Wales, Scotland, Northern Ireland.
// Used to catch cases where a ground-name search matched an unrelated page
// in a different country (generic names like "New Bucks Park" are the risk case).
function isPlausibleUKCoord(lat, lon) {
  return lat > 49 && lat < 61 && lon > -8.5 && lon < 2;
}

// Finds the first {{coord|...}} template in raw wikitext and extracts lat/lon,
// handling both decimal format and degrees/minutes/seconds format.
function parseCoordsFromWikitext(wikitext) {
  const match = wikitext.match(/\{\{[Cc]oord\|([^}]+)\}\}/);
  if (!match) return { lat: null, lon: null, raw: null };

  const raw = match[1];

  // Split on |, drop named parameters (e.g. "display=inline,title") and empty entries
  const parts = raw.split('|').map(p => p.trim()).filter(p => p.length > 0 && !p.includes('='));

  // If ANY direction letter (N/S/E/W) is present, this is DMS format — check this FIRST,
  // since DMS values like "53|28|N|..." would otherwise wrongly pass a naive decimal check
  // (both "53" and "28" parse as valid numbers on their own).
  const hasDirection = parts.some(p => /^[NSEW]$/i.test(p));

  if (hasDirection) {
    const latDirIndex = parts.findIndex(p => /^[NS]$/i.test(p));
    const lonDirIndex = parts.findIndex(p => /^[EW]$/i.test(p));

    if (latDirIndex !== -1 && lonDirIndex !== -1) {
      const latParts = parts.slice(0, latDirIndex);
      const lonParts = parts.slice(latDirIndex + 1, lonDirIndex);
      const lat = dmsToDecimal(latParts, parts[latDirIndex].toUpperCase());
      const lon = dmsToDecimal(lonParts, parts[lonDirIndex].toUpperCase());
      return { lat, lon, raw };
    }
    return { lat: null, lon: null, raw };
  }

  // Decimal format: first two tokens are plain numbers
  if (parts.length >= 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
    return { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]), raw };
  }

  return { lat: null, lon: null, raw };
}

// Step 1: search for the best-matching page title, since exact title lookups
// miss cases like "Abbey Hulton United FC" vs the real title "Abbey Hulton United F.C."
async function findTitle(teamName) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(teamName)}&srlimit=1&format=json`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;

  const data = await res.json();
  const results = data.query.search;

  if (!results || results.length === 0) return null;
  return results[0].title; // top search result's exact title
}

// Fetches raw wikitext for a given exact page title, following redirects.
// Returns null if the page doesn't exist.
async function fetchWikitext(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles=${encodeURIComponent(title)}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;

  const data = await res.json();
  const pages = data.query.pages;
  const page = Object.values(pages)[0];

  if (page.missing !== undefined) return null;
  return page.revisions[0].slots.main['*'];
}

async function getGround(teamName) {
  try {
    const title = await findTitle(teamName);
    if (!title) return { name: teamName, ground: null, lat: null, lon: null, coordSource: null, reason: 'no search results' };

    const wikitext = await fetchWikitext(title);
    if (!wikitext) return { name: teamName, ground: null, lat: null, lon: null, coordSource: null, reason: 'page not found', matchedTitle: title };

    const doc = wtf(wikitext); // parse the raw wikitext directly — no network call inside wtf this time

    const infobox = doc.infobox();
    if (!infobox) return { name: teamName, ground: null, lat: null, lon: null, coordSource: null, reason: 'no infobox', matchedTitle: title };

    // Wikipedia infoboxes for clubs usually use "ground", sometimes "stadium"
    // infobox.get() returns a wtf_wikipedia object, not a plain string — .text() extracts the readable value
    // Split on comma OR newline — some infoboxes separate ground/town with a line break instead of a comma
    const groundField = infobox.get('ground') || infobox.get('stadium') || null;
    const rawGround = groundField ? groundField.text() : null;
    const ground = rawGround ? rawGround.split(/[,\n]/)[0].trim() : null;

    // Attempt to pull coordinates from the club page's wikitext first
    let { lat, lon } = parseCoordsFromWikitext(wikitext);
    let coordSource = 'club page';

    // Discard club-page coords if they fall outside the UK — same generic-name-collision
    // risk as the ground-page fallback below, just less likely to hit on a club's own page.
    if (lat !== null && !isPlausibleUKCoord(lat, lon)) {
      lat = null;
      lon = null;
      coordSource = null;
    }

    // Fallback: many stadiums have their own separate Wikipedia article with coordinates
    // that aren't duplicated on the club's page. If we have a ground name and no coords yet,
    // search for the ground itself and check its page instead.
    if (lat === null && ground) {
      const groundTitle = await findTitle(ground);
      if (groundTitle) {
        const groundWikitext = await fetchWikitext(groundTitle);
        if (groundWikitext) {
          const groundCoords = parseCoordsFromWikitext(groundWikitext);
          if (groundCoords.lat !== null && isPlausibleUKCoord(groundCoords.lat, groundCoords.lon)) {
            lat = groundCoords.lat;
            lon = groundCoords.lon;
            coordSource = `ground page (${groundTitle})`;
          } else if (groundCoords.lat !== null) {
            coordSource = `rejected — implausible coords from "${groundTitle}"`;
          }
        }
      }
    }

    return {
      name: teamName,
      ground,
      lat,
      lon,
      coordSource,
      reason: ground ? 'ok' : 'infobox has no ground field',
      matchedTitle: title
    };
  } catch (err) {
    console.log(`\n--- RAW ERROR for ${teamName} ---`);
    console.log(err);
    console.log(`--- END ---\n`);
    return { name: teamName, ground: null, lat: null, lon: null, coordSource: null, reason: `error: ${err.message}` };
  }
}

async function run(teamNames) {
  const results = [];

  for (const [i, name] of teamNames.entries()) {
    const result = await getGround(name);
    results.push(result);
    console.log(`${i + 1}/${teamNames.length}: ${name} -> ${result.ground || 'NULL (' + result.reason + ')'} | lat: ${result.lat}, lon: ${result.lon}${result.coordSource ? ' (' + result.coordSource + ')' : ''}`);

    await sleep(400); // slower pace — reduces risk of being rate-limited by Wikipedia
  }

  return results;
}

// --- Usage ---

async function getAllTeams() {
  const res = await fetch("http://localhost:3000/api/teams", {
    method: "GET",
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  return data.map(team => team.name); // return the array directly
}

async function main() {
  const fs = require('fs');
  const path = require('path');
  
  //const teamsToLookup = await getAllTeams(); // wait for the real array before continuing
  
  const teamsToLookup = fs.readFileSync('../data/teams.csv', 'utf8');
  teamsList = teamsToLookup.trim().split(/\r?\n/);

  const results = await run(teamsList);

  const outputDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outputDir, { recursive: true }); // creates the folder if it doesn't already exist; no-op if it does
 

  fs.writeFileSync(path.join(__dirname, 'wiki-query-results.json'), JSON.stringify(results, null, 2));

  const nullCount = results.filter(r => r.ground === null).length;
  console.log(`\nDone. ${results.length - nullCount}/${results.length} found. ${nullCount} still null.`);
}

main();