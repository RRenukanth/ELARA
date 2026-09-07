const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const {
  createPrediction,
  getHistory,
  getLatest,
} = require("../controllers/predictionController");

router.use(authenticate, authorize("patient"));

// POST /api/predictions
router.post("/", asyncHandler(createPrediction));

// GET /api/predictions/history
router.get("/history", asyncHandler(getHistory));

// GET /api/predictions/latest
router.get("/latest", asyncHandler(getLatest));

module.exports = router;
