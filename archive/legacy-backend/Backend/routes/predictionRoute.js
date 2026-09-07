// IMPORT MODULES
const express = require("express");
const router = express.Router();

// IMPORT CONTROLLER
const {makePrediction} = require("../controllers/predictionController");

// PREDICTION ROUTE
// URL: localhost:5000/api/prediction
router.post("/", makePrediction);

// GET PREDICTION HISTORY
// URL: localhost:5000/api/prediction/history
router.get("/history", (req,res)=>{res.send("Prediction History API.");});


// GET LATEST PREDICTION
// URL: localhost:5000/api/prediction/latest
router.get("/latest", (req,res)=>{res.send("Latest Prediction API.");});

// EXPORT ROUTER
module.exports = router;