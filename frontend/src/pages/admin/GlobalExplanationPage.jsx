import { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import StatCard from "../../components/StatCard.jsx";
import FeatureImportanceChart from "../../components/FeatureImportanceChart.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/admin", label: "Doctor Approvals" },
  { to: "/admin/global-explanation", label: "Global Model Explanation" },
];

function formatMetric(value) {
  if (typeof value !== "number") return "--";
  return value.toFixed(4);
}

export default function GlobalExplanationPage() {
  const [explanation, setExplanation] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .getHrflmGlobalExplanation()
      .then(setExplanation)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <DashboardLayout
      title="Global Model Explanation"
      subtitle="HRFLM (Hybrid Random Forest + Linear Model) -- overall model behavior across the patient population"
      navItems={NAV_ITEMS}
    >
      <Alert type="error" message={error} />

      {isLoading ? (
        <p className="text-sm text-neon-500">Loading global explanation...</p>
      ) : !explanation?.available ? (
        <div className="card">
          <p className="text-sm text-neon-600">
            {explanation?.message || "No HRFLM global explanation is currently available."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-neon-950">
                  Explains model version: {explanation.explainsModelVersion}
                </h2>
                <p className="text-sm text-neon-600">
                  HRFLM version {explanation.hrflmVersion} - trained on {explanation.referenceRowCount} reference
                  patients - generated {new Date(explanation.generatedAt).toLocaleString()}
                </p>
              </div>
              {explanation.surrogateFitQuality && (
                <span className="rounded-full bg-neon-100 px-3 py-1 text-xs font-semibold text-neon-700">
                  Surrogate matches model {Math.round(
                    explanation.surrogateFitQuality.hybrid_accuracy_vs_real_model * 100
                  )}% of the time
                </span>
              )}
            </div>
          </div>

          {explanation.explainabilityMetrics && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-neon-950">Explainability Quality Metrics</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard label="Fidelity" value={formatMetric(explanation.explainabilityMetrics.fidelity)} />
                <StatCard label="Accuracy Gain" value={formatMetric(explanation.explainabilityMetrics.accuracyGain)} />
                <StatCard label="Agreement" value={formatMetric(explanation.explainabilityMetrics.agreement)} />
                <StatCard label="Stability" value={formatMetric(explanation.explainabilityMetrics.stability)} />
                <StatCard label="Sparsity" value={formatMetric(explanation.explainabilityMetrics.sparsity)} />
                <StatCard
                  label="Deletion AUC"
                  value={formatMetric(explanation.explainabilityMetrics.deletionAuc)}
                />
                <StatCard
                  label="Insertion AUC"
                  value={formatMetric(explanation.explainabilityMetrics.insertionAuc)}
                />
                <StatCard
                  label="Reward Improvement"
                  value={formatMetric(explanation.explainabilityMetrics.rewardImprovement)}
                />
              </div>
              <p className="mt-3 text-xs text-neon-500">
                Deletion AUC (lower is better) and Insertion AUC (higher is better) test whether the
                feature-importance ranking matches what the real model actually relies on, by
                progressively removing/restoring features from the real model's input and tracking its
                own confidence -- unlike the other metrics, which evaluate the surrogate rather than the
                real model directly.
              </p>
            </section>
          )}

          <section className="card">
            <h2 className="mb-3 text-lg font-bold text-neon-950">Global Feature Importance</h2>
            <p className="mb-4 text-sm text-neon-600">
              How much each feature drives the model's decisions across the entire patient population
              (unlike a per-patient explanation, this does not indicate direction for any single case).
            </p>
            <FeatureImportanceChart importances={explanation.globalFeatureImportance} />
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
