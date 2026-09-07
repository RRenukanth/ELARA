const express = require("express");
const app = express();

app.use(express.static("public"));
app.use(express.json());

let wifiStatus = true;

app.get("/status", (req, res) => {
    res.json({
        connected: wifiStatus
    });
});

app.post("/saveData", (req, res) => {
    console.log("Received:", req.body);

    res.json({
        success: true
    });
});

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});