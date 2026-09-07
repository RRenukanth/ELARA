// IMPORT MODULES
const express = require("express");
const router = express.Router();

// IMPORT CONTROLLER
const {registerPatient} = require("../controllers/registerController");

// REGISTER ROUTE
// URL:
//
// localhost:5000/api/register
//

router.post("/", registerPatient);

// EXPORT ROUTER
module.exports = router;