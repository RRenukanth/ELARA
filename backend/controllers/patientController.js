const patientModel = require("../models/patientModel");
const healthDataModel = require("../models/healthDataModel");
const { HttpError } = require("../middleware/errorHandler");

// Patient identity always comes from req.user (JWT), never a client-supplied id.
function getOwnProfile(req, res) {
  const patient = patientModel.findById(req.user.id);
  if (!patient) {
    throw new HttpError(404, "Patient not found.");
  }
  return res.status(200).json({ patient: patientModel.toPublicProfile(patient) });
}

function getOwnHealthHistory(req, res) {
  const rows = healthDataModel.listForPatient(req.user.id);
  return res.status(200).json({ healthData: rows });
}

module.exports = { getOwnProfile, getOwnHealthHistory };
