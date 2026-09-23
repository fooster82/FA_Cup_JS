//// Used to create an array of team names from a CSV
let teamsList = []
let teamsCsv = "teams.csv"

async function getTeams(file) {
    const res = await fetch(file).then(res => res.text()); 
    teamsList = res.trim().split(/\r?\n/);
    return teamsList;     
}

getTeams(teamsCsv);    



//// Button to add all teams from an array to the DB
const button = document.getElementById('add_teams_button');

async function addTeams(teamsList) {
    teamsList.forEach(async team => {
        const res = await fetch("http://localhost:3000/api/teams", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "name": team })      
        })
        const data = await res.json();

        console.log("Team added: "+ data.name);
    });
}

button.addEventListener("click", function() {
    addTeams(teamsList);
}); 



//// API testing ground
async function apiTest(teamName) {
    const res = await fetch(`https://v3.football.api-sports.io/venues?id=${teamName}`, {
        headers: {
            "x-apisports-key": "6e514eed0d9fb66fe52d4eaaeda5f297"
        }
    })
    const data = await res.json();
    const stadium_name = data.res[0].name
    console.log(stadium_name)
    const testP = document.createElement("p");
    testP.innerText = stadium_name;
    document.body.appendChild(testP)
}