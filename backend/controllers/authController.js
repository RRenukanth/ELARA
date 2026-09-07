const bcrypt = require("bcrypt");
const patientModel = require("../models/patientModel");
const doctorModel = require("../models/doctorModel");
const adminModel = require("../models/adminModel");
const { signToken } = require("../utils/jwt");
const { HttpError } = require("../middleware/errorHandler");
const {
  isNonEmptyString,
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidAge,
  isValidSex,
  isValidUsername,
} = require("../utils/validators");

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

// =========================================================
// PATIENT REGISTRATION
// =========================================================
async function registerPatient(req, res) {
  const { username, password, firstName, lastName, email, age, sex, phoneNumber, emergencyContact } =
    req.body;

  const errors = [];
  if (!isValidUsername(username)) errors.push("Username must be 3-50 characters (letters, numbers, _ or .).");
  if (!isValidPassword(password)) errors.push("Password must be at least 8 characters.");
  if (!isNonEmptyString(firstName)) errors.push("First name is required.");
  if (!isNonEmptyString(lastName)) errors.push("Last name is required.");
  if (!isValidEmail(email)) errors.push("A valid email address is required.");
  if (!isValidAge(age)) errors.push("Age must be a number between 1 and 120.");
  if (!isValidSex(sex)) errors.push("Sex must be Male, Female, or Other.");
  if (phoneNumber && !isValidPhone(phoneNumber)) errors.push("Phone number is invalid.");
  if (emergencyContact && !isValidPhone(emergencyContact)) errors.push("Emergency contact number is invalid.");

  if (errors.length > 0) {
    throw new HttpError(400, errors.join(" "));
  }

  if (patientModel.findByUsername(username)) {
    throw new HttpError(409, "Username already exists.");
  }
  if (patientModel.findByEmail(email)) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const patient = patientModel.create({
    username,
    passwordHash,
    firstName,
    lastName,
    email,
    age,
    sex,
    phoneNumber,
    emergencyContact,
  });

  return res.status(201).json({
    message: "Registration successful.",
    patient: patientModel.toPublicProfile(patient),
  });
}

// =========================================================
// DOCTOR REGISTRATION (requires admin approval before login works)
// =========================================================
async function registerDoctor(req, res) {
  const {
    username, password, firstName, lastName, email, age, sex, phoneNumber,
    hospitalName, hospitalAddress, specialization, registrationNumber, yearsExperience,
  } = req.body;

  const errors = [];
  if (!isValidUsername(username)) errors.push("Username must be 3-50 characters (letters, numbers, _ or .).");
  if (!isValidPassword(password)) errors.push("Password must be at least 8 characters.");
  if (!isNonEmptyString(firstName)) errors.push("First name is required.");
  if (!isNonEmptyString(lastName)) errors.push("Last name is required.");
  if (!isValidEmail(email)) errors.push("A valid email address is required.");
  if (!isNonEmptyString(hospitalName)) errors.push("Hospital name is required.");
  if (!isNonEmptyString(specialization)) errors.push("Specialization is required.");
  if (!isNonEmptyString(registrationNumber)) errors.push("Medical registration number is required.");

  if (errors.length > 0) {
    throw new HttpError(400, errors.join(" "));
  }

  if (doctorModel.findByUsername(username)) {
    throw new HttpError(409, "Username already exists.");
  }
  if (doctorModel.findByEmail(email)) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const doctor = doctorModel.create({
    username,
    passwordHash,
    firstName,
    lastName,
    email,
    age,
    sex,
    phoneNumber,
    hospitalName,
    hospitalAddress,
    specialization,
    registrationNumber,
    yearsExperience,
  });

  return res.status(201).json({
    message: "Registration request submitted. Your account will be reviewed by an administrator.",
    doctor: doctorModel.toPublicProfile(doctor),
  });
}

// =========================================================
// LOGIN (shared handler, role passed via route)
// =========================================================
function login(role) {
  return async function loginHandler(req, res) {
    const { username, password } = req.body;

    if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
      throw new HttpError(400, "Username and password are required.");
    }

    let account;
    if (role === "patient") account = patientModel.findByUsername(username);
    else if (role === "doctor") account = doctorModel.findByUsername(username);
    else if (role === "admin") account = adminModel.findByUsername(username);

    if (!account) {
      throw new HttpError(401, "Invalid username or password.");
    }

    const passwordMatches = await bcrypt.compare(password, account.password_hash);
    if (!passwordMatches) {
      throw new HttpError(401, "Invalid username or password.");
    }

    if (role === "doctor" && account.approval_status !== "approved") {
      throw new HttpError(403, "Your account is pending administrator approval.");
    }

    if (role === "patient" && account.status !== "Active") {
      throw new HttpError(403, "Your account is inactive. Please contact support.");
    }

    const idField = role === "patient" ? "patient_id" : role === "doctor" ? "doctor_id" : "admin_id";
    const token = signToken({ id: account[idField], role, username: account.username });

    const profile =
      role === "patient"
        ? patientModel.toPublicProfile(account)
        : role === "doctor"
        ? doctorModel.toPublicProfile(account)
        : { adminId: account.admin_id, username: account.username };

    return res.status(200).json({ message: "Login successful.", token, role, profile });
  };
}

module.exports = { registerPatient, registerDoctor, login };
