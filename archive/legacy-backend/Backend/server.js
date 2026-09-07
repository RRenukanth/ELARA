// IMPORT MODULES
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// INITIALIZE APP
const app = express();

// PORT NUMBER
const PORT = process.env.PORT || 5000;


// MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cors());

// ROUTE IMPORTS
const registerRoutes = require("./routes/register");
const loginRoutes = require("./routes/login");
const predictionRoutes = require("./routes/prediction");

// ROUTE HANDLING
app.use("/api/register",registerRoutes);
app.use("/api/login",loginRoutes);
app.use("/api/prediction",predictionRoutes);

// HOME ROUTE
app.get("/",(req,res)=>{
    res.send("Heart Disease Prediction System API Running Successfully.");
});


// SERVER STARTED
app.listen(PORT,()=>{
    console.log(`Server running successfully on Port ${PORT}`);
});