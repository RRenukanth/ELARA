import { useEffect, useState } from "react";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/doctor", label: "My Patients" },
  { to: "/doctor/requests", label: "Connection Requests" },
];

export default function ConnectionRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [respondingId, setRespondingId] = useState(null);

  function loadRequests() {
    api
      .getIncomingConnectionRequests()
      .then((r) => setRequests(r.requests))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function handleAccept(requestId) {
    setError("");
    setMessage("");
    setRespondingId(requestId);
    try {
      await api.acceptConnectionRequest(requestId);
      setMessage("Request accepted. The patient has been added to your patient list.");
      loadRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setRespondingId(null);
    }
  }

  async function handleDecline(requestId) {
    setError("");
    setMessage("");
    setRespondingId(requestId);
    try {
      await api.declineConnectionRequest(requestId);
      setMessage("Request declined.");
      loadRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <DashboardLayout
      title="Connection Requests"
      subtitle="Patients requesting to connect with you"
      navItems={NAV_ITEMS}
    >
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {requests.length === 0 ? (
        <p className="text-sm text-neon-500">No pending connection requests.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => (
            <div key={r.requestId} className="card flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-neon-950">
                  {r.patient.firstName} {r.patient.lastName}
                </h3>
                <p className="text-sm text-neon-600">
                  {r.patient.age} yrs - {r.patient.sex}
                </p>
                <p className="text-xs text-neon-500">Requested {new Date(r.requestedAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  disabled={respondingId === r.requestId}
                  onClick={() => handleAccept(r.requestId)}
                >
                  Accept
                </button>
                <button
                  className="btn-secondary"
                  disabled={respondingId === r.requestId}
                  onClick={() => handleDecline(r.requestId)}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
