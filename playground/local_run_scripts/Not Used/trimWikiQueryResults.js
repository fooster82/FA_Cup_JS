//Trims the results of wikiQuery down to contain just the name, ground and coords

function trimWikiData(wikiFileName){
    const fs = require('fs');

    if (!fs.existsSync(`../data/${wikiFileName}.json`)) {
        console.log(`FAILURE: File not found: ../data/${wikiFileName}.json`);
        return;
    };

    const wikiFile = fs.readFileSync(`../data/${wikiFileName}.json`, 'utf8');
    const wikiData = JSON.parse(wikiFile); 

    const trimmedWikiData = wikiData.map(({ name, ground, lat, lon, coordSource, reason, matchedTitle }) => {
        if (name.includes("(")) {
            name = removeBracket(name, name);
        };

        if (ground && ground.includes("(")) {
            ground = removeBracket(ground, name);
        };

        // let FCExists = true;
        // do {
        //     let nameSpaceCount = (name.match(/ /g) || null).length
        //     if (name.includes(" FC")) {
        //         if (nameSpaceCount > 1) {
        //             name = name.slice(0, name.length - 3).trim()
        //         };                
        //     };   
        //     FCExists = (name.includes(" FC") && nameSpaceCount > 1);
        // }
        // while(FCExists);

        if (coordSource && coordSource.includes('rejected — implausible coords from') || ground === null) {
            return {
                name,
                ground: null,
                latitude: null,
                longitude: null
            };
        } else {
            return {
                name,
                ground,
                latitude: lat,
                longitude: lon
            };
        };
    });

    fs.writeFileSync('../data/wiki-query-trimmed.json', JSON.stringify(trimmedWikiData, null, 2));

    console.log("SUCCESS: File has been trimmed succesfully");
}

function removeBracket(string, name) {
    let bracketExists = true;

    do {
        let openBracketPosition = string.search(/\(/);
        let closeBracketPosition = string.search(/\)/);

        if (openBracketPosition === -1 || closeBracketPosition === -1) {
            console.error("No full brackets found for: " + name);
            return;
        } else if (openBracketPosition === 0) {
            string = string.slice(closeBracketPosition + 1, string.length).replace(/^\s+/, "").trim();
        } else {
            string = (string.slice(0, openBracketPosition) + " " + string.slice(closeBracketPosition + 1)).replace(/\s+/g, " ").trim();
        };

        bracketExists = string.includes("(") || string.includes(")");
    }
    while (bracketExists);

    return string;
};

trimWikiData("wiki-query-results");