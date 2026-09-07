// Local explanation service (LIME) -- presentation layer.
//
// Per explainability.md: LIME must operate against the exact same model and
// preprocessing as the deployed prediction (no separately-trained
// explanation model). The actual LIME algorithm (perturbation sampling +
// locally weighted linear regression) lives in limeExplainerService.js and
// is called here with modelService.scoreFeatures bound to whichever
// algorithm produced the real prediction being explained -- so the
// explanation is always generated against the real model, never a demo
// stand-in, unless the whole app is running in demo mode (in which case
// scoreFeatures itself transparently falls back to the demo heuristic, and
// the explanation is flagged isDemoExplanation: true).
//
// This module's job is turning limeExplainerService's numeric contribution
// scores into patient-friendly and doctor-facing text, and picking which
// factors are worth surfacing (largest-magnitude contributors).

const limeExplainerService = require("./limeExplainerService");

/**
 * @param {Record<string, number>} features - the 10 canonical features
 *   submitted for the prediction being explained.
 * @param {(features: Record<string, number>) => Promise<number>} scoreFn -
 *   the exact scoring function used for the real prediction (typically
 *   `(f) => modelService.scoreFeatures(f, algorithm)`).
 * @param {boolean} demoMode
 * @returns {Promise<{factors: {factor: string, label: string, contribution: number}[], isDemoExplanation: boolean}>}
 */
async function explain(features, scoreFn, demoMode) {
  const allFactors = await limeExplainerService.explain(features, scoreFn);

  // Surface the top contributors. A small contribution (near-zero
  // coefficient) means that feature had little effect on the LOCAL
  // approximation around this specific patient's values -- not
  // necessarily unimportant globally, just not a driver of THIS prediction.
  const MIN_MEANINGFUL_CONTRIBUTION = 0.01;
  const topFactors = allFactors.filter((f) => Math.abs(f.contribution) >= MIN_MEANINGFUL_CONTRIBUTION).slice(0, 5);

  return {
    factors: topFactors.length > 0 ? topFactors : allFactors.slice(0, 1),
    isDemoExplanation: demoMode,
  };
}

/** Patient-friendly explanation string built from LIME contribution scores. */
function toPatientExplanation(explanation) {
  const prefix = explanation.isDemoExplanation
    ? "Demo mode (no trained model loaded yet). "
    : "";

  const increasing = explanation.factors.filter((f) => f.contribution > 0).map((f) => f.label);
  const decreasing = explanation.factors.filter((f) => f.contribution < 0).map((f) => f.label);

  if (increasing.length === 0 && decreasing.length === 0) {
    // Every factor had a ~zero local contribution -- e.g. the Q-Learning
    // model's discretized state was never seen during training, so the
    // local neighborhood around this input carries no signal (see
    // adapters/qtableAdapter.js "unknown state" fallback). Say so plainly
    // rather than rendering an empty/broken sentence.
    return `${prefix}No clear contributing factors were identified for this result.`;
  }

  const parts = [];
  if (increasing.length > 0) {
    parts.push(`increased the estimated risk: ${increasing.join(", ")}`);
  }
  if (decreasing.length > 0) {
    parts.push(`decreased the estimated risk: ${decreasing.join(", ")}`);
  }

  return `${prefix}These measurements ${parts.join("; and measurements that ")}.`;
}

/** Doctor/technical explanation string, including numeric contribution scores. */
function toDoctorExplanation(explanation) {
  const prefix = explanation.isDemoExplanation
    ? "[DEMO MODE - heuristic, not a trained model] "
    : "";

  const parts = explanation.factors.map(
    (f) => `${f.factor}: ${f.contribution > 0 ? "+" : ""}${f.contribution.toFixed(4)}`
  );

  return `${prefix}LIME local contribution scores (positive = increases predicted risk): ${
    parts.join(", ") || "none identified"
  }.`;
}

module.exports = { explain, toPatientExplanation, toDoctorExplanation };
