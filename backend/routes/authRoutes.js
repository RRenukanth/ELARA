const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { registerPatient, registerDoctor, login } = require("../controllers/authController");

// POST /api/auth/register/patient
router.post("/register/patient", asyncHandler(registerPatient));

// POST /api/auth/register/doctor
router.post("/register/doctor", asyncHandler(registerDoctor));

// POST /api/auth/login/patient
router.post("/login/patient", asyncHandler(login("patient")));

// POST /api/auth/login/doctor
router.post("/login/doctor", asyncHandler(login("doctor")));

// POST /api/auth/login/admin
router.post("/login/admin", asyncHandler(login("admin")));

module.exports = router;
