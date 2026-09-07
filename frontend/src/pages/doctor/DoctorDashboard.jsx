import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import StatCard from "../../components/StatCard.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/doctor", label: "My Patients" },
  { to: "/doctor/requests", label: "Connection Requests" },
];

export default function DoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getAssignedPatients()
      .then((r) => setPatients(r.patients))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <DashboardLayout title="My Patients" subtitle="Patients assigned to you" navItems={NAV_ITEMS}>
      <Alert type="error" message={error} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Assigned Patients" value={patients.length} />
      </div>

      {patients.length === 0 ? (
        <p className="text-sm text-neon-500">No patients have been assigned to you yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((p) => (
            <Link
              key={p.patientId}
              to={`/doctor/patients/${p.patientId}`}
              className="card block transition hover:shadow-neon-glow"
            >
              <h3 className="font-bold text-neon-950">
                {p.firstName} {p.lastName}
              </h3>
              <p className="text-sm text-neon-600">
                {p.age} yrs - {p.sex}
              </p>
              <p className="mt-1 text-xs text-neon-400">Status: {p.status}</p>
            </Link>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
