// IMPORT MODULES
const express = require("express");
const router = express.Router();

// IMPORT CONTROLLER
const {loginPatient} = require("../controllers/loginController");

// LOGIN ROUTE
// URL:
// localhost:5000/api/login
router.post("/", loginPatient);

// EXPORT ROUTER
module.exports = router;









