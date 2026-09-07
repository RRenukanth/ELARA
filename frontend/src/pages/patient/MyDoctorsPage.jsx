import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout.jsx";
import Alert from "../../components/Alert.jsx";
import { api } from "../../services/api.js";

const NAV_ITEMS = [
  { to: "/patient", label: "Overview" },
  { to: "/patient/history", label: "Prediction History" },
  { to: "/patient/find-doctor", label: "Find a Doctor" },
  { to: "/patient/doctors", label: "My Doctors" },
];

export default function MyDoctorsPage() {
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMyDoctors().then((r) => setDoctors(r.doctors)).catch((err) => setError(err.message));
  }, []);

  return (
    <DashboardLayout title="My Doctors" subtitle="Doctors you are connected with" navItems={NAV_ITEMS}>
      <Alert type="error" message={error} />

      {doctors.length === 0 ? (
        <div className="card">
          <p className="mb-3 text-sm text-neon-600">You aren't connected with any doctors yet.</p>
          <Link to="/patient/find-doctor" className="btn-primary inline-block">
            Find a Doctor
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doc) => (
            <div key={doc.doctorId} className="card">
              <h3 className="font-bold text-neon-950">
                Dr. {doc.firstName} {doc.lastName}
              </h3>
              <p className="text-sm text-neon-600">{doc.specialization}</p>
              <p className="text-xs text-neon-500">{doc.hospitalName}</p>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
