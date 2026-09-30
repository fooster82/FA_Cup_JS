/////////////////////// Button to add all teams from an array to the DB ///////////////////////
async function addTeams(teamsList) {
    teamsList.forEach(async team => {
        // const res = await fetch("http://localhost:3000/api/teams", {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ name, ground, latitude, longitude })      
        // })
        // const data = await res.json();

        console.log("Team added: "+ team);
    });
};


// Event listener to run the above
const button = document.getElementById('add_teams_button');

button.addEventListener("click", async () => {
    console.log("clicked")
    const teams = []; 
    console.log(teams)

    //addTeams(teams);
}); 

/////////////////////////////////////////////////////////////////////////////


//// API testing ground for grabbing data
// async function apiTest(teamName) {
//     const res = await fetch(`https://v3.football.api-sports.io/venues?id=${teamName}`, {
//         headers: {
//             "x-apisports-key": "keyGoesHere"
//         }
//     })
//     const data = await res.json();
//     const stadium_name = data.res[0].name
//     console.log(stadium_name)
//     const testP = document.createElement("p");
//     testP.innerText = stadium_name;
//     document.body.appendChild(testP)
// }