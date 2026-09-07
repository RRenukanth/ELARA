import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import LoadingScreen from "./LoadingScreen.jsx";

// Frontend route protection is a UX convenience only -- every real
// authorization decision is enforced server-side (see security-and-privacy.md).
export default function ProtectedRoute({ role, children }) {
  const { session, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  if (!session) return <Navigate to="/login" replace />;

  if (role && session.role !== role) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
