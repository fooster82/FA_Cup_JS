const HEADERS = {
  'User-Agent': 'FACupGroundsScript/1.0 (fooster@sky.com)'
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
}

// Fetch the lat and long of the ground from wikipedia using the ground name
async function fetchCoords(groundName, teamHtml, teamName) {
    const cheerio = require('cheerio');

    // First search the team page for the coordinates
    const $team = cheerio.load(teamHtml);
    const teamPageCoords = $team('.geo').html();

    if (teamPageCoords) {
        const coords = teamPageCoords.toString().split("; ");
        return [coords[0], coords[1]];
    }

    // If that fails then try searching the grounds page (if it exists)    
    // Check if a page actually exists for the ground
    const groundTitle = await fetchTitle(groundName);

    if (groundTitle === teamName) {
        console.log('No ground page') // add more here building an error message for the output
        return [null, null];
    };

    // Check if the page is actually just an ambigious Wiki page and deal with that if so
    let groundHtml = await fetchHtml(groundTitle); 
    let $ground = cheerio.load(groundHtml);

    const isDisambigPage = groundHtml.includes('mw:PageProp/disambiguation');
    if (isDisambigPage) {
        try {
            groundHtml = await fetchHtml(groundTitle + '_(stadium)'); 
            $ground = cheerio.load(groundHtml);
        } catch (err) {
            console.log('No ground page from disambig wiki page');
            return [null, null];
        }
    }

    // Once the page has been found, check for coords
    const groundPageCoords = $ground('.geo').html();

    // Success route if coords are found on the ground page   
    if (groundPageCoords) {
        const coords = groundPageCoords.toString().split("; ");
        return [coords[0], coords[1]]
    }

    // Failure route, no coords on either the team or ground page
    return [null, null]; // add more here building an error message for the output
}

// Fetch the name of the ground from wikipedia using the team name
async function fetchGround(teamName) {
    const teamTitle = await fetchTitle(teamName);
    // if (!teamTitle) return { team, ground: null, latitude: null, longitude: null, error: 'TITLE: no Wikipedia page found' };

    const teamHtml = await fetchHtml(teamTitle); 

    const cheerio = require('cheerio');

    const $ = cheerio.load(teamHtml);

    const ground = $('.infobox')
        .find('th.infobox-label')
        .filter((i, el) => ["Ground", "Stadium", "ground", "stadium"].includes($(el).text().trim()))
        .next('td.infobox-data')
        .text();

    return { ground, teamHtml };
}


// The actual running of the queries
async function run(team) {
    const { ground, teamHtml } = await fetchGround(team);

    const coords = await fetchCoords(ground, teamHtml, team)
    
    const teamValues = { team, ground, "latitude": coords[0], "longitude": coords[1] }

    return teamValues;
};


// Main function, running all the above
async function main() {
    console.time('Total run time:');
    const pLimit = require('p-limit');

    const limit = pLimit(5); // 5 concurrent requests

    const teamNames = ["Arsenal FC", "Charlton Athletic", "Aston Villa", "Redhill FC", "Bottesford Town F.C.", "Ashton United FC"]
    // const teamNames = ["Charlton Athletic"];

    const results = await Promise.all(
        teamNames.map(name => limit(() => run(name)))
    );

    console.timeEnd('Total run time:');
    console.log('\n');
    console.log(results)
};

main();







// TODO
// - Add error handling to fetch title - if none found then set error reason to TITLE + error tesxt maybe?
// - Add error handling to fetch html - if none found then set error reason to HTML + error tesxt maybe?
// - Add error handling to teams and Coords (multi part, covered below. Not exhasutive)
// -- Add error handling to ground fetching - if none found then set error reason to GROUND + error tesxt maybe?
// -- Add error handling to latitude/longitude fetching - if none found then set error reason to COORDS + error tesxt maybe? / maybe split these two up?
// - Results need an error section added - error 'title' and reason maybe? (default will be needed, either N/A or null or just Success)
// - Results need a section adding as to where the coord detail was found
// - Add reasonable coord check, is it in the UK - can be a function - if failed then set error reason to COORDS + generic error text we write
// - Add ground name check that removes e.g. ', Southend'
// - Add counter so progress can be seen (with a SUCCESS or FAILURE plus team name maybe?)
// - Could include the trimming / missing functions in here (just pull them in) to spit out a few files (wiki-query-results / wiki-query-trimmed / wiki-query-missing)
// - Add tests
