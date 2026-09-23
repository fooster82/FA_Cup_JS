////// GET all teams and then display them
let allTeams = [];

async function getAllTeams() {
    const res = await fetch("http://localhost:3000/api/teams", {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
    })
    data = await res.json();
    data.forEach(team => {
        allTeams.push(team.name)
    });
    appendTeams(allTeams);
}

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

getAllTeams()