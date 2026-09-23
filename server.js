require('dotenv').config();

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const db = Database('data.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ground TEXT,
    latitude INTEGER,
    longitude INTEGER
    )
`);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));


// GET all teams
app.get('/api/teams', (req, res) => {
    const teams = db.prepare('SELECT * FROM teams').all();
    res.json(teams);
});

// GET one team by id
app.get('/api/teams/id/:id', (req, res) => {
    const team = db.prepare('SELECT * FROM teams where id = ?').all(req.params.id);
    
    if (!team) {
        res.status(404).json({ error: "No team found with that id" });
    };

    res.json(team)
})

// GET one team by name
app.get('/api/teams/name/:name', (req, res) => {
    const team = db.prepare('SELECT * FROM teams where name = ?').all(req.params.name);
    
    if (!team) {
        res.status(404).json({ error: "No team found with that name" });
    };

    res.json(team)
})

// POST a new team
app.post('/api/teams', (req, res) => {
    const { name, ground, latitude, longitude } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Manadatory field NAME is not present"})
    };

    const result = db.prepare('INSERT INTO teams (name, ground, latitude, longitude) VALUES (?, ?, ?, ?)').run(name, ground || null, latitude || null, longitude || null);
    res.json({ id: result.lastInsertRowid, name: name, ground: ground, latitude: latitude, longitude: longitude });
});

// PUT a replacement team
app.put('/api/teams/id/:id', (req, res) => {
    const { name, ground, latitude, longitude } = req.body;

    if (!name) {
        res.status(400).json({ error: "Manadatory field NAME is not present"})
    };

    const result = db.prepare('UPDATE teams SET name = ?, ground = ?, latitude = ?, longitude = ? where id = ?').run(name, ground || null, latitude || null, longitude || null, req.params.id)
    res.json({ id: result.lastInsertRowid, name: name, ground: ground, latitude: latitude, longitude: longitude });
});

// PATCH an exisiting team
app.patch('/api/teams/id/:id', (req, res) => {
    const columns = [];
    const values = [];
    
    const id = req.params.id
    const name = req.body.name;
    const ground = req.body.ground;
    const latitude = req.body.latitude;
    const longitude = req.body.longitude;
    const request_values = {
        "name": name, 
        "ground": ground, 
        "latitude": latitude, 
        "longitude": longitude
    };

    Object.entries(request_values).forEach(([key, value]) => {
        if (value) {
            columns.push(`${key}`);
            values.push(value);
        }
    });

    const setStatement = columns.map(col => `${col} = ?`).join(', ');
    const result = db.prepare(`UPDATE teams SET ${setStatement} WHERE id = ?`).run(...values, id);     

    if(result.changes  > 0) {
        return res.json({ message: `Team ID ${id} has been updated` });
    } else {
        return res.status(404).json({ error: `No team found with ID ${id}` });
    }    
});

// DELETE an existing team
app.delete('/api/teams/id/:id', (req, res) => {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM teams WHERE id = ?').run(id);
    if (result.changes === 0) {
        res.status(404).json({ error: `No record found for id '${id}`})
    };

    res.json({ message: `Team ID '${id}' has been deleted`})
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on  http://localhost:${PORT}`));