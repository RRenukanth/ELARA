// Shared test bootstrap: isolates each test file's SQLite database in a
// temp file, applies migrations, then starts the Express app on an
// ephemeral port so tests can make real HTTP requests with the built-in
// `fetch` (Node >=18) instead of adding a new HTTP testing dependency.
//
// IMPORTANT: environment variables must be set before `../../server` (and
// anything it requires, e.g. database/db.js) is first required, since
// database/db.js reads process.env.DB_PATH once at module load time.

const fs = require("fs");
const os = require("os");
const path = require("path");

function setTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "elara-test-"));
  const dbFile = path.join(tmpDir, "test.db");

  process.env.DB_PATH = path.relative(path.join(__dirname, "..", ".."), dbFile);
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.BCRYPT_SALT_ROUNDS = "4"; // low cost factor: faster tests only
  process.env.CORS_ORIGIN = "";
  process.env.PORT = "0";

  return { tmpDir, dbFile };
}

function applyMigrations() {
  const { db } = require("../../database/db");
  const migrationsDir = path.join(__dirname, "..", "..", "database", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
  }
}

/**
 * Seed the RobustScaler parameters that preprocessingService.js requires
 * for ANY prediction (real model or demo heuristic -- both call
 * toTrainedRepresentation()). Without this, tests that exercise the real
 * prediction endpoint fail once real trained models exist under
 * models/rl/ (before that, the app ran in demo mode, which happened to
 * still work without scaler params in earlier versions of this codebase --
 * that is no longer the case since toTrainedRepresentation() always runs).
 *
 * Mirrors backend/database/seedTrainingReferenceData.js's scaler-seeding
 * step, reading the same models/rl/preprocessing_params.json artifact, so
 * tests use the exact same scaler as the real app rather than made-up values.
 */
function seedScalerParams() {
  const artifactPath = path.join(__dirname, "..", "..", "..", "models", "rl", "preprocessing_params.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `${artifactPath} not found. Run research/preprocessing/fit_preprocessing_params.py first.`
    );
  }

  const { run } = require("../../database/db");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  for (const [featureName, stats] of Object.entries(artifact.scaler.columns)) {
    run(
      `INSERT INTO preprocessing_scaler_params (feature_name, median, q1, q3, iqr, fitted_on_row_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [featureName, stats.median, stats.q1, stats.q3, stats.iqr, artifact.row_count]
    );
  }
}

/**
 * Call once per test file, before requiring the app. Sets up an isolated
 * DB, applies migrations, and returns a start()/stop() pair for the server.
 */
function createTestContext() {
  const { tmpDir } = setTestEnv();
  applyMigrations();
  seedScalerParams();

  const app = require("../../server");
  const server = app.listen(0);

  const baseUrl = () => {
    const { port } = server.address();
    return `http://127.0.0.1:${port}`;
  };

  function close() {
    server.close();

    // Close the SQLite connection before removing its temp directory,
    // otherwise the file may still be locked on Windows and rmSync throws
    // EPERM. Swallow cleanup errors -- leftover temp dirs are harmless.
    try {
      const { db } = require("../../database/db");
      db.close();
    } catch {
      // ignore
    }

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // ignore -- OS will clean up the temp dir eventually
    }
  }

  return { app, server, baseUrl, close };
}

module.exports = { createTestContext };
