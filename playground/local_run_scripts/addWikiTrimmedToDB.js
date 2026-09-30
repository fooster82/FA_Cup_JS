const fs = require('fs');
const path = require('path');

async function run(teams) {
    for (const { name, ground, latitude, longitude } of teams) {
        const res = await fetch("http://localhost:3000/api/teams", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, ground, latitude, longitude })      
        });
        
        if(!res.ok) throw new Error(`Failed on ${name}: HTTP ${res.status} ${await res.text()}`)

        console.log("Team added: " + name);
    }
}

async function main() {
    const outputDir = path.join(__dirname, '..', 'data');
    const teams = fs.readFileSync(path.join(outputDir, 'wiki-query-trimmed.json'), 'utf8');   
    const teamsJson = JSON.parse(teams);

    await run(teamsJson);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});