// HRFLM (Hybrid Random Forest + Linear Model) global explanation service.
//
// HRFLM provides GLOBAL explainability -- overall model behavior across the
// whole reference population, not a single prediction (that is LIME's job,
// see limeService.js / limeExplainerService.js). HRFLM's intended audience
// is developers/researchers/authorized model analysts -- in this
// application, restricted to the admin role only (enforced in adminRoutes.js via the
// existing authenticate + authorize("admin") middleware, not by this file).
//
// This service does NOT run any Python/scikit-learn code at request time.
// research/explainability/HRFLM.ipynb trains the RF + Linear Model hybrid
// surrogate offline and exports a plain JSON report
// (models/hrflm/<version>/hrflm_report.json) plus optional evaluation
// metrics (hrflm_eval_metrics.json, produced by hrflm_eval.ipynb) -- this
// service only reads those files. No ML runtime is required on the
// Node.js side (unlike modelService.js's ONNX/Q-table adapters), since the
// global explanation is just data (a feature-importance ranking + metrics),
// not something that needs to be re-run per request.

const fs = require("fs");
const path = require("path");

const MODELS_HRFLM_DIR = path.resolve(__dirname, "..", "..", "models", "hrflm");

/**
 * Find every models/hrflm/<version>/ folder containing a valid
 * metadata.json and its declared report file.
 */
function discoverHrflmVersions() {
  if (!fs.existsSync(MODELS_HRFLM_DIR)) return [];

  const entries = fs.readdirSync(MODELS_HRFLM_DIR, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const versionDir = path.join(MODELS_HRFLM_DIR, entry.name);
    const metadataPath = path.join(versionDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) continue;

    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    } catch {
      continue; // malformed metadata.json - skip
    }

    const reportFileName = metadata.runtime_compatibility?.report_file;
    if (!reportFileName) continue;

    const reportPath = path.join(versionDir, reportFileName);
    if (!fs.existsSync(reportPath)) continue;

    found.push({ versionDir, metadata, reportPath, folderName: entry.name });
  }

  // Newest version first (folder names include a date, e.g. hrflm-2026-08-14).
  found.sort((a, b) => b.folderName.localeCompare(a.folderName));
  return found;
}

const discovered = discoverHrflmVersions();
const activeVersion = discovered[0] || null;
const IS_AVAILABLE = activeVersion !== null;

/**
 * @returns {boolean} whether any exported HRFLM artifact is available.
 */
function isAvailable() {
  return IS_AVAILABLE;
}

/**
 * Load and return the full global explanation for the admin view: the
 * feature-importance report, the explainability-quality metrics (if
 * present), and metadata about which model version HRFLM explains.
 *
 * @returns {{
 *   available: boolean,
 *   hrflmVersion: string,
 *   explainsModelVersion: string,
 *   generatedAt: string,
 *   globalFeatureImportance: Array<{feature: string, label: string, hybridImportance: number, randomForestImportance: number, linearModelImportance: number}>,
 *   surrogateFitQuality: object|null,
 *   explainabilityMetrics: {fidelity: number, accuracyGain: number, agreement: number, stability: number, sparsity: number, deletionAuc: number|undefined, insertionAuc: number|undefined, rewardImprovement: number}|null
 * }}
 */
function getGlobalExplanation() {
  if (!IS_AVAILABLE) {
    return {
      available: false,
      message:
        "No HRFLM global explanation artifact found. Run research/explainability/HRFLM.ipynb " +
          "and place the exported models/hrflm/<version>/ folder, then restart the backend.",
    };
  }

  const report = JSON.parse(fs.readFileSync(activeVersion.reportPath, "utf8"));

  const globalFeatureImportance = (report.global_feature_importance || []).map((entry) => ({
    feature: entry.feature,
    label: entry.label,
    hybridImportance: entry.hybrid_importance,
    randomForestImportance: entry.random_forest_importance,
    linearModelImportance: entry.linear_model_importance,
  }));

  let explainabilityMetrics = null;
  const metricsPath = path.join(activeVersion.versionDir, "hrflm_eval_metrics.json");
  if (fs.existsSync(metricsPath)) {
    const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
    explainabilityMetrics = {
      fidelity: metrics.Fidelity,
      accuracyGain: metrics["Accuracy Gain"],
      agreement: metrics.Agreement,
      stability: metrics.Stability,
      sparsity: metrics.Sparsity,
      // Older hrflm_eval_metrics.json exports (before deletion/insertion
      // faithfulness testing was added) won't have these keys -- left
      // undefined rather than defaulted, so the frontend can tell the
      // difference between "not computed for this export" and "zero".
      deletionAuc: metrics["Deletion AUC"],
      insertionAuc: metrics["Insertion AUC"],
      rewardImprovement: metrics["Reward Improvement"],
    };
  }

  return {
    available: true,
    hrflmVersion: report.hrflm_version,
    explainsModelVersion: report.explains_model_version,
    generatedAt: report.generated_at,
    referenceRowCount: report.reference_row_count,
    globalFeatureImportance,
    surrogateFitQuality: report.surrogate_fit_quality || null,
    explainabilityMetrics,
  };
}

module.exports = { isAvailable, getGlobalExplanation };
