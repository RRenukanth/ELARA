const express = require("express");
const app = express();

app.use(express.text());

let latestMessage = "No message received";

app.post("/message", (req, res) => {
    latestMessage = req.body;

    console.log("Received from ESP32:", latestMessage);

    res.send("OK");
});

app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>ESP32 Messages</title>
        <meta http-equiv="refresh" content="1">
    </head>
    <body>
        <h1>ESP32 Message</h1>
        <h2>${latestMessage}</h2>
    </body>
    </html>
    `);
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});