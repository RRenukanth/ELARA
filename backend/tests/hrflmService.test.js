const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// hrflmService.js discovers models from models/hrflm/ ONCE at module load
// time, same pattern as modelServiceSelection.test.js for models/rl/. Real
// artifacts (e.g. models/hrflm/hrflm-2026-08-14/) must be moved OUTSIDE
// models/hrflm/ for the duration of these tests so fixture-based discovery
// is tested in isolation, then restored afterward.

const MODELS_HRFLM_DIR = path.resolve(__dirname, "..", "..", "models", "hrflm");
const FIXTURE_DIR = path.join(MODELS_HRFLM_DIR, "test-fixture-hrflm");

function freshHrflmService() {
  delete require.cache[require.resolve("../services/hrflmService")];
  return require("../services/hrflmService");
}

let movedAsideDirs = [];

function moveRealArtifactsAside() {
  if (!fs.existsSync(MODELS_HRFLM_DIR)) return;
  const entries = fs.readdirSync(MODELS_HRFLM_DIR, { withFileTypes: true });
  const asideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "elara-hrflm-aside-"));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("test-fixture-")) continue;
    const originalPath = path.join(MODELS_HRFLM_DIR, entry.name);
    const asidePath = path.join(asideRoot, entry.name);
    fs.renameSync(originalPath, asidePath);
    movedAsideDirs.push({ originalPath, asidePath });
  }
}

function restoreRealArtifacts() {
  for (const { originalPath, asidePath } of movedAsideDirs) {
    fs.renameSync(asidePath, originalPath);
  }
  movedAsideDirs = [];
}

const FIXTURE_REPORT = {
  hrflm_version: "test-fixture-hrflm-v0",
  explains_model_version: "test-fixture-ppo-v0",
  reference_dataset: "test/fixture.csv",
  reference_row_count: 100,
  global_feature_importance: [
    { feature: "cp", label: "Chest pain type", random_forest_importance: 0.5, linear_model_importance: 0.4, hybrid_importance: 0.45 },
    { feature: "age", label: "Age", random_forest_importance: 0.1, linear_model_importance: 0.05, hybrid_importance: 0.075 },
  ],
  surrogate_training_metadata: { surrogate_target: "real_model_predicted_class" },
  surrogate_fit_quality: { hybrid_accuracy_vs_real_model: 0.9 },
  generated_at: "2026-01-01T00:00:00Z",
};

const FIXTURE_METRICS = {
  Fidelity: 0.8,
  "Accuracy Gain": 0.2,
  Agreement: 0.9,
  Stability: 0.95,
  Sparsity: 0.4,
  "Deletion AUC": 0.3,
  "Insertion AUC": 0.75,
  "Reward Improvement": 0.05,
};

before(() => {
  moveRealArtifactsAside();

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_DIR, "hrflm_report.json"), JSON.stringify(FIXTURE_REPORT));
  fs.writeFileSync(path.join(FIXTURE_DIR, "hrflm_eval_metrics.json"), JSON.stringify(FIXTURE_METRICS));
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "metadata.json"),
    JSON.stringify({
      model_version: "test-fixture-hrflm-v0",
      algorithm: "HRFLM",
      audience: "admin-only",
      runtime_compatibility: { export_format: "json", report_file: "hrflm_report.json" },
    })
  );
});

after(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  restoreRealArtifacts();
});

test("isAvailable() is true when a valid artifact folder is present", () => {
  const hrflmService = freshHrflmService();
  assert.equal(hrflmService.isAvailable(), true);
});

test("getGlobalExplanation() returns the feature importance ranking, fit quality, and metrics", () => {
  const hrflmService = freshHrflmService();
  const explanation = hrflmService.getGlobalExplanation();

  assert.equal(explanation.available, true);
  assert.equal(explanation.hrflmVersion, "test-fixture-hrflm-v0");
  assert.equal(explanation.explainsModelVersion, "test-fixture-ppo-v0");
  assert.equal(explanation.referenceRowCount, 100);

  assert.equal(explanation.globalFeatureImportance.length, 2);
  assert.equal(explanation.globalFeatureImportance[0].feature, "cp");
  assert.equal(explanation.globalFeatureImportance[0].hybridImportance, 0.45);

  assert.equal(explanation.surrogateFitQuality.hybrid_accuracy_vs_real_model, 0.9);

  assert.deepEqual(explanation.explainabilityMetrics, {
    fidelity: 0.8,
    accuracyGain: 0.2,
    agreement: 0.9,
    stability: 0.95,
    sparsity: 0.4,
    deletionAuc: 0.3,
    insertionAuc: 0.75,
    rewardImprovement: 0.05,
  });
});

test("getGlobalExplanation() leaves deletionAuc/insertionAuc undefined for an older metrics export without them", () => {
  const legacyMetrics = { ...FIXTURE_METRICS };
  delete legacyMetrics["Deletion AUC"];
  delete legacyMetrics["Insertion AUC"];
  fs.writeFileSync(path.join(FIXTURE_DIR, "hrflm_eval_metrics.json"), JSON.stringify(legacyMetrics));

  const hrflmService = freshHrflmService();
  const explanation = hrflmService.getGlobalExplanation();

  assert.equal(explanation.explainabilityMetrics.deletionAuc, undefined);
  assert.equal(explanation.explainabilityMetrics.insertionAuc, undefined);
  assert.equal(explanation.explainabilityMetrics.fidelity, 0.8);

  // restore full fixture for any subsequent test run in this process
  fs.writeFileSync(path.join(FIXTURE_DIR, "hrflm_eval_metrics.json"), JSON.stringify(FIXTURE_METRICS));
});

test("getGlobalExplanation() omits explainabilityMetrics when no metrics file exists", () => {
  fs.rmSync(path.join(FIXTURE_DIR, "hrflm_eval_metrics.json"));
  const hrflmService = freshHrflmService();
  const explanation = hrflmService.getGlobalExplanation();

  assert.equal(explanation.available, true);
  assert.equal(explanation.explainabilityMetrics, null);

  // restore for any subsequent test run in this process
  fs.writeFileSync(path.join(FIXTURE_DIR, "hrflm_eval_metrics.json"), JSON.stringify(FIXTURE_METRICS));
});

test("reports unavailable when no artifact folder exists at all", () => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });

  const hrflmService = freshHrflmService();
  assert.equal(hrflmService.isAvailable(), false);

  const explanation = hrflmService.getGlobalExplanation();
  assert.equal(explanation.available, false);
  assert.match(explanation.message, /No HRFLM global explanation artifact found/);

  // restore for the `after` hook's cleanup expectations
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIXTURE_DIR, "hrflm_report.json"), JSON.stringify(FIXTURE_REPORT));
  fs.writeFileSync(path.join(FIXTURE_DIR, "hrflm_eval_metrics.json"), JSON.stringify(FIXTURE_METRICS));
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "metadata.json"),
    JSON.stringify({
      model_version: "test-fixture-hrflm-v0",
      algorithm: "HRFLM",
      runtime_compatibility: { export_format: "json", report_file: "hrflm_report.json" },
    })
  );
});
