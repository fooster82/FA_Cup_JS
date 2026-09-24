////// This function will take the list of teams in /data/teams.csv and will search for their ground and coordinates.
//// These results will be returned in an Object in the form { team, ground, latitude, longitude, outcome (SUCCESS/FAIL/IN PROGRESS), message (either where coords were found or where the search failed) }
//// They will also be added raw to wiki-query-results.json. The success routes will be trimmed to contain just team/ground/lat/lng to wiki-query-success.json, and the failed will go raw to wiki-query-failed.json

const HEADERS = {
  'User-Agent': 'FACupGroundsScript/1.0 (fooster@sky.com)'
};

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
    if (!res.ok) return null;
    
    const data = await res.json();
    const result = data.query.search[0];

    if (!result) return null;
    return result.title;
};


// Gets the HTML for the matching wiki title of a team/ground
async function fetchHtml (title) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;

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
    const groundResult = await fetchGround(team);
    if (!groundResult.ground) return { team, ground: groundResult.ground, latitude: null, longitude: null, outcome: groundResult.outcome, message: groundResult.message };

    const coordsResult = await fetchCoords(groundResult.ground, groundResult.teamHtml, team);
    
    return { team, ground: groundResult.ground, latitude: coordsResult.latitude, longitude: coordsResult.longitude, outcome: coordsResult.outcome, message: coordsResult.message };
};


// Main function, running all the above
async function main() {
    const fs = require('fs');
    const path = require('path');

    console.time('Total run time:');
    const pLimit = require('p-limit');

    const limit = pLimit(5); // 5 concurrent requests

    // const teamsToLookup = fs.readFileSync('../data/teams.csv', 'utf8');
    // teamNames = teamsToLookup.trim().split(/\r?\n/);

    const teamNames = ["Arsenal FC", "Charlton Athletic", "Aston Villa", "Redhill FC", "Atherstone Town CFC", "Ashton United FC"]
    // const teamNames = ["Charlton Athletisdfasdfsfsdafgaghaserfesfsdfc"];

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

    const outputDir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(outputDir, { recursive: true }); // creates the folder if it doesn't already exist; no-op if it does
 
    fs.writeFileSync(path.join(outputDir, 'wiki-query-results.json'), JSON.stringify(results, null, 2));

    console.log(`\n✅ Total success count: ${successCount}`);
    console.log(`❌ Total failure count: ${failCount}`);
    console.log(`⚽ Total teams checked: ${completedCount}\n`);
    console.timeEnd('Total run time:');
    
    return results;
};

main();



// TODO
// - Include the trimming / missing data functions in here to spit out a few files (wiki-query-results / wiki-query-trimmed / wiki-query-missing)
// - Atherstone Town CFC has returned the title of its 2024-35 league for its ground name, investigate this
// - Add tests