require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const adminRoutes = require("./routes/adminRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const iotRoutes = require("./routes/iotRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

const corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : {}));

app.get("/", (req, res) => {
  res.send("ELARA Heart Disease Prediction System API is running.");
});

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/iot", iotRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Only bind a port when this file is run directly (e.g. `node server.js`).
// When required by the test suite, callers start their own listener on an
// ephemeral port so multiple test files can run without port conflicts.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ELARA backend listening on port ${PORT}`);
  });
}

module.exports = app;
