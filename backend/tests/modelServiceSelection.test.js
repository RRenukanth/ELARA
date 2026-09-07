const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// modelService.js discovers models from models/rl/ ONCE at module load
// time (top-level scan), so to test multi-algorithm discovery in isolation
// we can't just point it at a temp dir via an env var (no such option
// exists, deliberately -- see modelService.js comments: exactly one
// models/rl/ directory, resolved relative to this file, is the contract).
// Instead, this test creates REAL fixture folders under the actual
// models/rl/ directory, then cleans them up afterward, and reloads the
// module fresh via jest-style cache-busting (delete require.cache entry)
// so it re-scans with the fixtures present.

const MODELS_RL_DIR = path.resolve(__dirname, "..", "..", "models", "rl");
const FIXTURE_PPO_DIR = path.join(MODELS_RL_DIR, "test-fixture-ppo-selection");
const FIXTURE_QLEARNING_DIR = path.join(MODELS_RL_DIR, "test-fixture-qlearning-selection");

const FIXTURE_ONNX_PATH = path.join(__dirname, "fixtures", "tiny_model.onnx");

function freshModelService() {
  delete require.cache[require.resolve("../services/modelService")];
  delete require.cache[require.resolve("../services/adapters/onnxAdapter")];
  delete require.cache[require.resolve("../services/adapters/qtableAdapter")];
  return require("../services/modelService");
}

// Real, user-provided trained models may already exist under models/rl/
// (e.g. ppo-fold4-2026-08-13/) with the SAME algorithm keys ("ppo",
// "q-learning") this test's fixtures use. Since modelService.js keeps only
// the first-found folder per algorithm, real models would shadow the test
// fixtures and make this test depend on what happens to be on disk. Move
// any real model folders aside for the duration of this test and restore
// them afterward, so discovery is tested in isolation.
let movedAsideDirs = [];

function moveRealModelsAside() {
  if (!fs.existsSync(MODELS_RL_DIR)) return;
  const entries = fs.readdirSync(MODELS_RL_DIR, { withFileTypes: true });
  const asideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "elara-models-aside-"));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("test-fixture-")) continue;
    // Renaming WITHIN models/rl/ is not enough -- discoverModels() scans
    // every directory regardless of its name and reads whatever
    // metadata.json it finds inside, so a folder must be moved OUTSIDE
    // models/rl/ entirely to be hidden from discovery.
    const originalPath = path.join(MODELS_RL_DIR, entry.name);
    const asidePath = path.join(asideRoot, entry.name);
    fs.renameSync(originalPath, asidePath);
    movedAsideDirs.push({ originalPath, asidePath });
  }
}

function restoreRealModels() {
  for (const { originalPath, asidePath } of movedAsideDirs) {
    fs.renameSync(asidePath, originalPath);
  }
  movedAsideDirs = [];
}

let tmpDbDir;

before(() => {
  moveRealModelsAside();
  // modelService.js requires preprocessingService.js, which reads scaler
  // params from the database -- point at an isolated, migrated+seeded DB
  // so scoreFeatures() doesn't touch the developer's real database.
  tmpDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "elara-modelservice-test-"));
  process.env.DB_PATH = path.relative(
    path.join(__dirname, ".."),
    path.join(tmpDbDir, "test.db")
  );

  const { db, run, transaction } = require("../database/db");
  const migrationsDir = path.join(__dirname, "..", "database", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  transaction(() => {
    for (const [featureName, stats] of Object.entries({
      age: { median: 56, iqr: 12 },
      trestbps: { median: 130, iqr: 22 },
      thalach: { median: 140, iqr: 38.5 },
      oldpeak: { median: 1.0, iqr: 1.9 },
    })) {
      run(
        `INSERT INTO preprocessing_scaler_params (feature_name, median, q1, q3, iqr, fitted_on_row_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [featureName, stats.median, stats.median - stats.iqr / 2, stats.median + stats.iqr / 2, stats.iqr, 539]
      );
    }
  });

  // Fixture 1: a PPO-labeled ONNX model (reusing the shared tiny ONNX fixture).
  fs.mkdirSync(FIXTURE_PPO_DIR, { recursive: true });
  fs.copyFileSync(FIXTURE_ONNX_PATH, path.join(FIXTURE_PPO_DIR, "model.onnx"));
  fs.writeFileSync(
    path.join(FIXTURE_PPO_DIR, "metadata.json"),
    JSON.stringify({
      model_version: "test-fixture-ppo-selection-v0",
      algorithm: "PPO",
      evaluation_metadata: { accuracy: 0.78 },
      runtime_compatibility: { export_format: "onnx", input_name: "input", num_classes: 2 },
    })
  );

  // Fixture 2: a Q-Learning-labeled Q-table JSON model.
  fs.mkdirSync(FIXTURE_QLEARNING_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_QLEARNING_DIR, "model.json"),
    JSON.stringify({
      action_size: 2,
      num_bins: 3,
      q_table: { "[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]": [0.1, 0.9] },
    })
  );
  fs.writeFileSync(
    path.join(FIXTURE_QLEARNING_DIR, "metadata.json"),
    JSON.stringify({
      model_version: "test-fixture-qlearning-selection-v0",
      algorithm: "Q-Learning",
      evaluation_metadata: { accuracy: 0.6 },
      runtime_compatibility: { export_format: "json" },
    })
  );
});

after(() => {
  fs.rmSync(FIXTURE_PPO_DIR, { recursive: true, force: true });
  fs.rmSync(FIXTURE_QLEARNING_DIR, { recursive: true, force: true });
  restoreRealModels();
  try {
    const { db } = require("../database/db");
    db.close();
  } catch {
    // ignore
  }
  fs.rmSync(tmpDbDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const SAMPLE_FEATURES = {
  thalach: 150, restecg: 0, oldpeak: 1.0, slope: 1, age: 55,
  sex: 1, cp: 2, exang: 0, trestbps: 130, fbs: 0,
};

test("listAvailableModels reports every discovered algorithm with correct default flag", () => {
  const modelService = freshModelService();
  assert.equal(modelService.isDemoMode(), false);

  const models = modelService.listAvailableModels();
  const keys = models.map((m) => m.key).sort();
  assert.deepEqual(keys, ["ppo", "q-learning"]);

  const ppo = models.find((m) => m.key === "ppo");
  assert.equal(ppo.isDefault, true); // PPO preferred when available
  assert.equal(ppo.modelVersion, "test-fixture-ppo-selection-v0");

  const ql = models.find((m) => m.key === "q-learning");
  assert.equal(ql.isDefault, false);
  assert.equal(ql.modelVersion, "test-fixture-qlearning-selection-v0");
});

test("predict() defaults to PPO when no algorithm is specified", async () => {
  const modelService = freshModelService();
  const result = await modelService.predict(SAMPLE_FEATURES);
  assert.equal(result.algorithm, "ppo");
  assert.equal(result.demoMode, false);
  assert.equal(result.modelVersion, "test-fixture-ppo-selection-v0");
});

test("predict() honors an explicit algorithm selection", async () => {
  const modelService = freshModelService();
  const result = await modelService.predict(SAMPLE_FEATURES, { algorithm: "q-learning" });
  assert.equal(result.algorithm, "q-learning");
  assert.equal(result.modelVersion, "test-fixture-qlearning-selection-v0");
});

test("predict() rejects an unknown algorithm rather than silently falling back", async () => {
  const modelService = freshModelService();
  await assert.rejects(
    () => modelService.predict(SAMPLE_FEATURES, { algorithm: "not-a-real-algorithm" }),
    /Unknown or unavailable algorithm/
  );
});

test("scoreFeatures() returns a probability-like number for each available algorithm", async () => {
  const modelService = freshModelService();
  for (const key of ["ppo", "q-learning"]) {
    const score = await modelService.scoreFeatures(SAMPLE_FEATURES, key);
    assert.ok(score >= 0 && score <= 1, `score for ${key} should be in [0,1], got ${score}`);
  }
});
