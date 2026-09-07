import { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/admin", label: "Doctor Approvals" },
  { to: "/admin/global-explanation", label: "Global Model Explanation" },
];

export default function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function loadPending() {
    api
      .getPendingDoctors()
      .then((r) => setDoctors(r.doctors))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleApprove(doctorId) {
    setError("");
    setMessage("");
    try {
      await api.approveDoctor(doctorId);
      setMessage("Doctor approved.");
      loadPending();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReject(doctorId) {
    setError("");
    setMessage("");
    try {
      await api.rejectDoctor(doctorId);
      setMessage("Doctor rejected.");
      loadPending();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <DashboardLayout title="Doctor Approvals" subtitle="Review pending doctor registrations" navItems={NAV_ITEMS}>
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {doctors.length === 0 ? (
        <p className="text-sm text-neon-500">No pending doctor requests.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {doctors.map((doc) => (
            <div key={doc.doctorId} className="card flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-neon-950">
                  {doc.firstName} {doc.lastName}
                </h3>
                <p className="text-sm text-neon-600">{doc.email}</p>
                <p className="text-sm text-neon-600">
                  {doc.hospitalName} - {doc.specialization}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => handleApprove(doc.doctorId)}>
                  Approve
                </button>
                <button className="btn-secondary" onClick={() => handleReject(doc.doctorId)}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
