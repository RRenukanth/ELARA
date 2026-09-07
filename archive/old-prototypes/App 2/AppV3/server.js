const express = require("express");
const path = require("path");

const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

let deviceConnected = true;

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/status", (req, res) => {
    res.json({
        connected: deviceConnected
    });
});

app.post("/saveData", (req, res) => {

    console.log("Received Data:");
    console.log(req.body);

    res.json({
        success: true
    });
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});