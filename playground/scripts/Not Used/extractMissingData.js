//Takes the trimmed file and extracts all incomplete entries (null grounds or coords)

function extractMissingData(trimmedFileName) {
    const fs = require('fs');

    if (!fs.existsSync(`../data/${trimmedFileName}.json`)) {
        console.log(`FAILURE: File not found: ../data/${trimmedFileName}.json`);
        return;
    };

    const trimmedFile = fs.readFileSync(`../data/${trimmedFileName}.json`, 'utf8');
    const trimmedData = JSON.parse(trimmedFile); 

    const missingData = trimmedData.filter(({ latitude, longitude }) => {
        return latitude === null || longitude === null
    });

    const missingDataNames = [];
    missingData.map((team) => {
        try {
            missingDataNames.push(team.name+"\n");
        } catch {
            console.log("Failed to to add the following team to the CSV: " + team);
        };
    });

    fs.writeFileSync('../data/missing-data.json', JSON.stringify(missingData, null, 2));
    fs.writeFileSync('../data/teams.csv', missingDataNames.join(""));

    console.log("SUCCESS: Missing data has been extracted succesfully");
};

extractMissingData("wiki-query-trimmed");