import { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import RiskBadge from "../../components/RiskBadge.jsx";
import FeatureContributionChart from "../../components/FeatureContributionChart.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/patient", label: "Overview" },
  { to: "/patient/history", label: "Prediction History" },
  { to: "/patient/find-doctor", label: "Find a Doctor" },
  { to: "/patient/doctors", label: "My Doctors" },
];

export default function PatientHistoryPage() {
  const [predictions, setPredictions] = useState([]);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api
      .getPredictionHistory()
      .then((r) => setPredictions(r.predictions))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <DashboardLayout title="Prediction History" subtitle="Your past risk assessments" navItems={NAV_ITEMS}>
      <Alert type="error" message={error} />

      {predictions.length === 0 ? (
        <p className="text-sm text-neon-500">No prediction history yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {predictions.map((p) => {
            const isExpanded = expandedId === p.predictionId;
            return (
              <div key={p.predictionId} className="card">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : p.predictionId)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-xs text-neon-500">{new Date(p.createdAt).toLocaleString()}</p>
                    <p className="mt-1 text-sm text-neon-200">
                      Confidence: {Math.round(p.confidenceScore * 100)}%
                      {p.algorithm && <span className="ml-2 text-xs uppercase tracking-wide text-neon-500">({p.algorithm})</span>}
                      {p.demoMode && <span className="ml-2 text-xs text-amber-600">(demo mode)</span>}
                    </p>
                  </div>
                  <RiskBadge riskLevel={p.riskLevel} />
                </button>

                {isExpanded && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="mb-3 text-sm text-neon-200">{p.explanation}</p>
                    {p.llmExplanation && (
                      <div className="mb-3 rounded-lg bg-neon-950 p-3">
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-neon-500">In more detail</p>
                        <p className="text-sm text-neon-200">{p.llmExplanation}</p>
                      </div>
                    )}
                    <h3 className="mb-2 text-sm font-bold text-neon-50">What Influenced This Result</h3>
                    <FeatureContributionChart factors={p.contributingFactors} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
