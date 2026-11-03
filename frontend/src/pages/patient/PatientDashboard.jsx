import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import RiskBadge from "../../components/RiskBadge.jsx";
import MedicalDisclaimer from "../../components/MedicalDisclaimer.jsx";
import PredictionForm from "../../components/PredictionForm.jsx";
import FeatureContributionChart from "../../components/FeatureContributionChart.jsx";
import WearableDeviceCard from "../../components/WearableDeviceCard.jsx";
import EcgDeviceCard from "../../components/EcgDeviceCard.jsx";
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
  const [wearableThalach, setWearableThalach] = useState(null);
  const [ecgData, setEcgData] = useState(null);
  const [thalachReady, setThalachReady] = useState(false);
  const [wearableConnected, setWearableConnected] = useState(false);

  const handleThalachUpdate = useCallback((newThalach) => {
    setWearableThalach(newThalach);
  }, []);

  const handleEcgUpdate = useCallback((newEcg) => {
    setEcgData(newEcg);
  }, []);

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

      {/* Top Wearable Device Interface: Connect Button & Average Heart Rate */}
      <WearableDeviceCard onThalachUpdate={handleThalachUpdate} thalachReady={thalachReady} onThalachReadyChange={setThalachReady} onConnectionChange={setWearableConnected} />

      {/* AD8232 ECG Monitor Interface: Connected Under the Heart Rate Readings */}
      <EcgDeviceCard onEcgUpdate={handleEcgUpdate} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card card-tint-blue lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold text-neon-50">Enter Your Health Information</h2>
          <p className="mb-4 text-sm text-neon-300">
            Provide the measurements below to receive a risk assessment. Maximum Heart Rate (Thalach)
            syncs from your PPG heart rate sensor, and Resting ECG, ST Depression, and ST-Segment Slope
            sync automatically from your AD8232 ECG monitor.
          </p>

          <PredictionForm
            onSubmit={handlePredict}
            isSubmitting={isSubmitting}
            externalThalach={wearableThalach}
            externalEcg={ecgData} thalachReady={thalachReady} onThalachReadyChange={setThalachReady} wearableConnected={wearableConnected}
          />
        </section>

        <section className="card card-tint-cyan flex flex-col gap-4">
          <h2 className="text-lg font-bold text-neon-50">Latest Result</h2>
          {latest ? (
            <>
              <RiskBadge riskLevel={latest.riskLevel} />
              <p className="text-sm text-neon-200">
                Confidence: <span className="font-semibold">{Math.round(latest.confidenceScore * 100)}%</span>
              </p>
              <p className="text-sm text-neon-200">{latest.explanation}</p>
              <MedicalDisclaimer />
            </>
          ) : (
            <p className="text-sm text-neon-500">No prediction yet. Submit your health information to get started.</p>
          )}
        </section>
      </div>

      {predictionResult && (
        <section className="card card-tint-mint mt-6">
          <h2 className="mb-2 text-lg font-bold text-neon-50">Prediction Result</h2>
          <div className="flex flex-wrap items-center gap-4">
            <RiskBadge riskLevel={predictionResult.prediction.riskLevel} />
            <p className="text-sm text-neon-200">
              Confidence: {Math.round(predictionResult.prediction.confidenceScore * 100)}%
            </p>
          </div>
          <p className="mt-3 text-sm text-neon-200">{predictionResult.prediction.explanation}</p>
          {predictionResult.prediction.llmExplanation && (
            <div className="mt-3 rounded-lg bg-neon-950 p-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-neon-500">In more detail</p>
              <p className="text-sm text-neon-200">{predictionResult.prediction.llmExplanation}</p>
            </div>
          )}

          <div className="mt-5">
            <h3 className="mb-3 text-sm font-bold text-neon-50">What Influenced This Result</h3>
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
