import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import RiskBadge from "../../components/RiskBadge.jsx";
import FeatureContributionChart from "../../components/FeatureContributionChart.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/doctor", label: "My Patients" },
  { to: "/doctor/requests", label: "Connection Requests" },
];

export default function DoctorPatientDetailPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getAssignedPatientProfile(patientId)
      .then((r) => setPatient(r.patient))
      .catch((err) => setError(err.message));

    api
      .getAssignedPatientPredictions(patientId)
      .then((r) => setPredictions(r.predictions))
      .catch((err) => setError(err.message));
  }, [patientId]);

  return (
    <DashboardLayout
      title={patient ? `${patient.firstName} ${patient.lastName}` : "Patient"}
      subtitle="Prediction history and technical explanation"
      navItems={NAV_ITEMS}
    >
      <Alert type="error" message={error} />

      {predictions.length === 0 ? (
        <p className="text-sm text-neon-500">No predictions recorded for this patient yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {predictions.map((p) => (
            <div key={p.predictionId} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <RiskBadge riskLevel={p.riskLevel} />
                  {p.algorithm && (
                    <span className="rounded-full bg-neon-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neon-700">
                      {p.algorithm}
                    </span>
                  )}
                  {p.demoMode && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      demo mode
                    </span>
                  )}
                </div>
                <p className="text-xs text-neon-500">{new Date(p.createdAt).toLocaleString()}</p>
              </div>

              <p className="mt-3 text-sm text-neon-700">{p.doctorExplanation}</p>

              <div className="mt-4">
                <h3 className="mb-2 text-sm font-bold text-neon-950">LIME Feature Contributions</h3>
                <FeatureContributionChart factors={p.contributingFactors} />
              </div>

              <h3 className="mt-4 mb-2 text-sm font-bold text-neon-950">Submitted Features</h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-neon-600 sm:grid-cols-5">
                {Object.entries(p.features).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-neon-50 px-2 py-1">
                    <span className="font-semibold">{key}</span>: {value}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
