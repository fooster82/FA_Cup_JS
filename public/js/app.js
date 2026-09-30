import './scripts.js';

// Builds the array of teams
function appendTeams(teams) {
    for (let i=0 ; i<teams.length; i++) {
        const teamP = document.createElement("p");
        teamP.innerText = teams[i];
        teamP.id = `teamP${i}`;
        document.body.appendChild(teamP);

        if (i % 2 === 0) {
            document.getElementById(`teamP${i}`).style.color = 'red';
        } else {
            document.getElementById(`teamP${i}`).style.color = 'blue';
        }
    }    
}

// Gets all the teams from the DB
async function getAllTeams(allTeams) {
    const res = await fetch("http://localhost:3000/api/teams", {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
    })
    const data = await res.json();
    data.forEach(team => {
        allTeams.push(team.name)
    });
    appendTeams(allTeams);
}

async function main() {
    let allTeams = [];
    getAllTeams(allTeams);
}

main();