import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import { useAuth } from "./hooks/useAuth.jsx";

// Lazy-load every page so navigating between routes shows the shared
// LoadingScreen (via the Suspense fallback below) while the page's code
// chunk loads, instead of a blank flash.
const LoginPage = lazy(() => import("./pages/auth/LoginPage.jsx"));
const RegisterPatientPage = lazy(() => import("./pages/auth/RegisterPatientPage.jsx"));
const RegisterDoctorPage = lazy(() => import("./pages/auth/RegisterDoctorPage.jsx"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage.jsx"));
const PatientDashboard = lazy(() => import("./pages/patient/PatientDashboard.jsx"));
const PatientHistoryPage = lazy(() => import("./pages/patient/PatientHistoryPage.jsx"));
const FindDoctorPage = lazy(() => import("./pages/patient/FindDoctorPage.jsx"));
const MyDoctorsPage = lazy(() => import("./pages/patient/MyDoctorsPage.jsx"));
const DoctorDashboard = lazy(() => import("./pages/doctor/DoctorDashboard.jsx"));
const DoctorPatientDetailPage = lazy(() => import("./pages/doctor/DoctorPatientDetailPage.jsx"));
const ConnectionRequestsPage = lazy(() => import("./pages/doctor/ConnectionRequestsPage.jsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const GlobalExplanationPage = lazy(() => import("./pages/admin/GlobalExplanationPage.jsx"));

export default function App() {
  const { isLoading } = useAuth();

  // First-load state: the auth session is still being restored from
  // localStorage (see hooks/useAuth.jsx). Shown once per app start.
  if (isLoading) {
    return <LoadingScreen label="Starting ELARA..." />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPatientPage />} />
        <Route path="/register/doctor" element={<RegisterDoctorPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route
          path="/patient"
          element={
            <ProtectedRoute role="patient">
              <PatientDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/history"
          element={
            <ProtectedRoute role="patient">
              <PatientHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/find-doctor"
          element={
            <ProtectedRoute role="patient">
              <FindDoctorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/doctors"
          element={
            <ProtectedRoute role="patient">
              <MyDoctorsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/doctor"
          element={
            <ProtectedRoute role="doctor">
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/patients/:patientId"
          element={
            <ProtectedRoute role="doctor">
              <DoctorPatientDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/requests"
          element={
            <ProtectedRoute role="doctor">
              <ConnectionRequestsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/global-explanation"
          element={
            <ProtectedRoute role="admin">
              <GlobalExplanationPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
