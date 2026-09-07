import { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import RiskBadge from "../../components/RiskBadge.jsx";
import MedicalDisclaimer from "../../components/MedicalDisclaimer.jsx";
import PredictionForm from "../../components/PredictionForm.jsx";
import FeatureContributionChart from "../../components/FeatureContributionChart.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/patient", label: "Overview" },
  { to: "/patient/history", label: "Prediction History" },
  { to: "/patient/find-doctor", label: "Find a Doctor" },
  { to: "/patient/doctors", label: "My Doctors" },
];

export default function PatientDashboard() {
  const [profile, setProfile] = useState(null);
  const [latest, setLatest] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);

  useEffect(() => {
    api.getOwnPatientProfile().then((r) => setProfile(r.patient)).catch(() => {});
    api
      .getLatestPrediction()
      .then((r) => setLatest(r.prediction))
      .catch(() => setLatest(null));
  }, []);

  async function handlePredict(features) {
    setError("");
    setIsSubmitting(true);
    try {
      const response = await api.createPrediction(features);
      setPredictionResult(response);
      setLatest(response.prediction);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout
      title={`Welcome${profile ? `, ${profile.firstName}` : ""}`}
      subtitle="Heart Disease Prediction System"
      navItems={NAV_ITEMS}
    >
      <Alert type="error" message={error} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold text-neon-950">Enter Your Health Information</h2>
          <p className="mb-4 text-sm text-neon-600">
            Provide the measurements below to receive a risk assessment. Values marked with a device
            can also be filled automatically once an IoT device is connected.
          </p>

          <PredictionForm onSubmit={handlePredict} isSubmitting={isSubmitting} />
        </section>

        <section className="card flex flex-col gap-4">
          <h2 className="text-lg font-bold text-neon-950">Latest Result</h2>
          {latest ? (
            <>
              <RiskBadge riskLevel={latest.riskLevel} />
              <p className="text-sm text-neon-700">
                Confidence: <span className="font-semibold">{Math.round(latest.confidenceScore * 100)}%</span>
              </p>
              <p className="text-sm text-neon-700">{latest.explanation}</p>
              <MedicalDisclaimer />
            </>
          ) : (
            <p className="text-sm text-neon-500">No prediction yet. Submit your health information to get started.</p>
          )}
        </section>
      </div>

      {predictionResult && (
        <section className="card mt-6">
          <h2 className="mb-2 text-lg font-bold text-neon-950">Prediction Result</h2>
          <div className="flex flex-wrap items-center gap-4">
            <RiskBadge riskLevel={predictionResult.prediction.riskLevel} />
            <p className="text-sm text-neon-700">
              Confidence: {Math.round(predictionResult.prediction.confidenceScore * 100)}%
            </p>
          </div>
          <p className="mt-3 text-sm text-neon-700">{predictionResult.prediction.explanation}</p>

          <div className="mt-5">
            <h3 className="mb-3 text-sm font-bold text-neon-950">What Influenced This Result</h3>
            <FeatureContributionChart factors={predictionResult.prediction.contributingFactors} />
          </div>

          <div className="mt-4">
            <MedicalDisclaimer />
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}
