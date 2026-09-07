import { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/patient", label: "Overview" },
  { to: "/patient/history", label: "Prediction History" },
  { to: "/patient/find-doctor", label: "Find a Doctor" },
  { to: "/patient/doctors", label: "My Doctors" },
];

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  cancelled: "bg-neon-100 text-neon-600",
};

export default function FindDoctorPage() {
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sendingDoctorId, setSendingDoctorId] = useState(null);

  function loadData() {
    api.getAvailableDoctors().then((r) => setAvailableDoctors(r.doctors)).catch((err) => setError(err.message));
    api.getOwnConnectionRequests().then((r) => setRequests(r.requests)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSendRequest(doctorId) {
    setError("");
    setMessage("");
    setSendingDoctorId(doctorId);
    try {
      await api.sendConnectionRequest(doctorId);
      setMessage("Connection request sent. The doctor will need to accept it before they can see your data.");
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingDoctorId(null);
    }
  }

  async function handleCancelRequest(requestId) {
    setError("");
    setMessage("");
    try {
      await api.cancelConnectionRequest(requestId);
      setMessage("Request cancelled.");
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  const pendingDoctorIds = new Set(
    requests.filter((r) => r.status === "pending").map((r) => r.doctor.doctorId)
  );

  return (
    <DashboardLayout title="Find a Doctor" subtitle="Send a connection request to a doctor" navItems={NAV_ITEMS}>
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-neon-950">Available Doctors</h2>
        {availableDoctors.length === 0 ? (
          <p className="text-sm text-neon-500">No doctors are currently available to connect with.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableDoctors.map((doc) => {
              const isPending = pendingDoctorIds.has(doc.doctorId);
              return (
                <div key={doc.doctorId} className="card">
                  <h3 className="font-bold text-neon-950">
                    Dr. {doc.firstName} {doc.lastName}
                  </h3>
                  <p className="text-sm text-neon-600">{doc.specialization}</p>
                  <p className="text-xs text-neon-500">{doc.hospitalName}</p>
                  <button
                    className="btn-primary mt-3 w-full"
                    disabled={isPending || sendingDoctorId === doc.doctorId}
                    onClick={() => handleSendRequest(doc.doctorId)}
                  >
                    {isPending ? "Request Pending" : sendingDoctorId === doc.doctorId ? "Sending..." : "Send Request"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-neon-950">Your Requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-neon-500">You haven't sent any connection requests yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((r) => (
              <div key={r.requestId} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-neon-950">
                    Dr. {r.doctor.firstName} {r.doctor.lastName}
                  </h3>
                  <p className="text-xs text-neon-500">Sent {new Date(r.requestedAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                  {r.status === "pending" && (
                    <button className="btn-secondary" onClick={() => handleCancelRequest(r.requestId)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardLayout>
  );
}
