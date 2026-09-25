////// This function will take the list of teams in /data/teams.csv and will search for their ground and coordinates.
//// These results will be returned in an Object in the form { team, ground, latitude, longitude, outcome (SUCCESS/FAIL/IN PROGRESS), message (either where coords were found or where the search failed) }
//// They will also be added raw to wiki-query-results.json. The success routes will be trimmed to contain just team/ground/lat/lng to wiki-query-success.json, and the failed will go raw to wiki-query-failed.json

const HEADERS = {
  'User-Agent': 'FACupGroundsScript/1.0 (fooster@sky.com)',
  'Accept-Encoding': 'gzip'
};

// Simple function to slow down requests
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Formats the coords and then verifys they exist
function parseCoords (coordsHtml) {
    const parsed = coordsHtml.toString().split("; ");
    const lat = parseFloat(parsed[0]?.trim());
    const lng = parseFloat(parsed[1]?.trim());

    if (isNaN(lat) || isNaN(lng)) return null;
    return {lat, lng };
};

// Verifys found coords fall within the UK
function coordsUkPlausible (coords) {
    return coords.lat > 49 && coords.lat < 61 && coords.lng > -8.5 && coords.lng < 2.2;
};

// Finds the  wiki title for the team/ground if there is one. This is what is then used to search for the Wikipedia page HTML
async function fetchTitle (name) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=1&format=json`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
        console.log(`fetchTitle FAILED for "${name}: HTTP ${res.status} ${res.statusText}`);
        if (res.status === 429) await sleep(10000);
        return null;
    }

    const data = await res.json();
    const result = data.query.search[0];

    if (!result) return null;
    return result.title;
};


// Gets the HTML for the matching wiki title of a team/ground
async function fetchHtml (title) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
        console.log(`fetchHtml FAILED for "${title}: HTTP ${res.status} ${res.statusText}`);
        if (res.status === 429) await sleep(10000);
        return null;
    }

    const data = await res.text();

    if (!data) return null;
    return data;
};

// Fetch the lat and lng of the ground from wikipedia using the ground name
async function fetchCoords(groundName, teamHtml, teamName) {
    let coordsCheck = "No";

    const cheerio = require('cheerio');

    // First search the team page for the coordinates
    const $team = cheerio.load(teamHtml);
    const teamPageCoords = $team('.geo').html();

    if (teamPageCoords) {
        const parsedCoords = parseCoords(teamPageCoords);
        if (!parsedCoords) {
            coordsCheck = "teamPage, failed formatting check";
        } else {
            const ukVerifiedCoords = coordsUkPlausible(parsedCoords);
            if (ukVerifiedCoords) return { latitude: parsedCoords.lat, longitude: parsedCoords.lng, outcome: "SUCCESS", message: "fetchCoords: Coords found on team Wiki page" };
            coordsCheck = coordsCheck + "; teamPage, failed UK check";
        }
    }

    // If that fails then try searching the grounds page (if it exists)    
    // Check if a page actually exists for the ground
    const groundTitle = await fetchTitle(groundName);
    if (!groundTitle || groundTitle === teamName) return { latitude: null, longitude: null, outcome: "FAIL", message: "fetchCoords: Coords not on team Wiki page and no ground page exists. Were Coords ever checked? " + coordsCheck};

    // Check if the page is actually just an ambigious Wiki page and deal with that if so
    let groundHtml = await fetchHtml(groundTitle);
    if (!groundHtml) return { latitude: null, longitude: null, outcome: "FAIL", message: "fetchCoords: Coords not on team Wiki page and no ground page exists for ground title: " + groundTitle + ". Were Coords ever checked? " + coordsCheck};
    
    let $ground = cheerio.load(groundHtml);

    const isDisambigPage = groundHtml.includes('mw:PageProp/disambiguation');
    if (isDisambigPage) {
        groundHtml = await fetchHtml(groundTitle + '_(stadium)'); 
        if (!groundHtml) return { latitude: null, longitude: null, outcome: "FAIL", message: "fetchCoords: Coords not on team Wiki page and ground title led to ambigious Wiki page for ground title: " + groundTitle + ". " + groundTitle+"_(stadium) was attempted but failed. Were Coords ever checked? " + coordsCheck};

        $ground = cheerio.load(groundHtml);
    }

    // Once the page has been found, check for coords
    const groundPageCoords = $ground('.geo').html();

    // Success route if coords are found on the ground page   
    if (groundPageCoords) {
        const parsedCoords = parseCoords(groundPageCoords);
        if (!parsedCoords) {
            coordsCheck = coordsCheck + "; groundPage, failed formatting check";
        } else {
            const ukVerifiedCoords = coordsUkPlausible(parsedCoords);
            if (ukVerifiedCoords) return { latitude: parsedCoords.lat, longitude: parsedCoords.lng, outcome: "SUCCESS", message: "fetchCoords: Coords found on ground Wiki page" };
            coordsCheck = coordsCheck + "; groundPage, failed UK check";
        }    }

    // Failure route, no coords on either the team or ground page
    return { latitude: null, longitude: null, outcome: "FAIL", message: "fetchCoords: Coords not on team Wiki page nor ground Wiki page. Were Coords ever checked? " + coordsCheck };
}

// Fetch the name of the ground from wikipedia using the team name
async function fetchGround(teamName) {
    const teamTitle = await fetchTitle(teamName);
    if (!teamTitle) return { teamHtml: null, ground: null, outcome: "FAIL", message: 'fetchGround: no Wiki Title found' };

    const teamHtml = await fetchHtml(teamTitle); 
    if (!teamHtml) return { teamHtml: null, ground: null, outcome: "FAIL", message: 'fetchGround: no Wiki page found for Wiki Title: ' + teamTitle };

    const cheerio = require('cheerio');

    const $ = cheerio.load(teamHtml);

    const groundText = $('.infobox')
        .find('th.infobox-label')
        .filter((i, el) => ["Ground", "Stadium", "ground", "stadium"].includes($(el).text().trim()))
        .next('td.infobox-data')
        .text()
        .split(',')[0]
        .trim();
    
    const ground = groundText ? groundText : null;

    return ground ? { teamHtml, ground, outcome: "IN PROGRESS", message: 'teamHtml and ground have been found, moving on to Coords' } : { teamHtml, ground: null, outcome: "FAIL", message: 'fetchGround: no ground found on team Wiki page for Wiki Title: ' + teamTitle };
};

// The actual running of the queries
async function run(team) {
    try {
        await sleep(2000);
        const groundResult = await fetchGround(team);
        if (!groundResult.ground) return { team, ground: groundResult.ground, latitude: null, longitude: null, outcome: groundResult.outcome, message: groundResult.message };

        const coordsResult = await fetchCoords(groundResult.ground, groundResult.teamHtml, team);
        
        return { team, ground: groundResult.ground, latitude: coordsResult.latitude, longitude: coordsResult.longitude, outcome: coordsResult.outcome, message: coordsResult.message };
    } catch (err) {
        return { team, ground: null, latitude: null, longitude: null, outcome: "FAIL", message: "run: Error caught - " + err.message};
    }
};


// Main function, running all the above
async function main() {
    const fs = require('fs');
    const path = require('path');

    const outputDir = path.join(__dirname, '..', 'data');

    console.time('Total run time');
    const pLimit = require('p-limit');

    const limit = pLimit(3); // 3 concurrent requests

    const teamsToLookup = fs.readFileSync(path.join(outputDir, 'teams.csv'), 'utf8');
    const teamNames = teamsToLookup.trim().split(/\r?\n/);

    // const teamNames = ["Arsenal FC", "Charlton Athletic", "Aston Villa", "Redhill FC", "Atherstone Town CFC", "Ashton United FC"]
    // const teamNames = ["Atherstone Town FC"];

    const totalNumTeams = teamNames.length;
    let completedCount = 0;
    let successCount = 0;
    let failCount = 0;

    const results = await Promise.all(
        teamNames.map(name => 
            limit(async () => {
                const result = await run(name);
                completedCount++;
                if (result.outcome === "SUCCESS") successCount++;
                else failCount++;
                console.log(`[${completedCount}/${totalNumTeams}] ${name}: ${result.outcome}`);
                return result;
            })
        )
    );

    const trimmedResults = results.map(team => {
        return {
            team: team.team,
            ground: team.ground,
            latitude: team.latitude,
            longitude: team.longitude
        }
    });

    let successResults = [];
    let failedResults = [];

    results.map(team => {
        if (team.outcome === "SUCCESS") successResults.push(team);
        else if (team.outcome === "FAIL") failedResults.push(team);
        else console.log(team+" has not been added to either success or failed file!");
    });

    fs.writeFileSync(path.join(outputDir, 'wiki-query-results.json'), JSON.stringify(results, null, 2)); // file containing the raw results
    fs.writeFileSync(path.join(outputDir, 'wiki-query-trimmed.json'), JSON.stringify(trimmedResults, null, 2)); // file containing the name/ground/lat/lng only
    fs.writeFileSync(path.join(outputDir, 'wiki-query-success.json'), JSON.stringify(successResults, null, 2)); // file containing all teams that were successfully fully fetched
    fs.writeFileSync(path.join(outputDir, 'wiki-query-failed.json'), JSON.stringify(failedResults, null, 2)); // file containing all teams that were not successfully fully fetched

    console.log(`\n✅ Total success count: ${successCount}`);
    console.log(`❌ Total failure count: ${failCount}`);
    console.log(`⚽ Total teams checked: ${completedCount}\n`);
    console.timeEnd('Total run time');
    
    return results;
};

main();



// TODO
// - Run it!
// - Add tests