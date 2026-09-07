import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout.jsx";
import Alert from "../../components/Alert.jsx";
import { api } from "../../services/api.js";
import { useAuth } from "../../hooks/useAuth.jsx";

const ROLE_HOME = {
  patient: "/patient",
  doctor: "/doctor",
  admin: "/admin",
};

const LOGIN_FN = {
  patient: api.loginPatient,
  doctor: api.loginDoctor,
  admin: api.loginAdmin,
};

export default function LoginPage() {
  const [role, setRole] = useState("patient");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter your username and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await LOGIN_FN[role]({ username: username.trim(), password });
      login(response.token);
      navigate(ROLE_HOME[role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Welcome Back" subtitle="Login to continue monitoring your heart health.">
      <Alert type="error" message={error} />

      <div className="mb-5 flex rounded-xl bg-neon-50 p-1 text-sm font-medium">
        {["patient", "doctor", "admin"].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`flex-1 rounded-lg py-2 capitalize transition ${
              role === r ? "bg-white text-neon-700 shadow" : "text-neon-500"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="input-field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </div>

        <div className="flex items-center justify-end text-sm">
          <Link to="/forgot-password" className="text-neon-600 hover:text-neon-800">
            Forgot Password?
          </Link>
        </div>

        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-neon-700">
        <p>Don&apos;t have an account?</p>
        <div className="mt-2 flex justify-center gap-4">
          <Link to="/register" className="font-semibold text-neon-600 hover:text-neon-800">
            Sign up as Patient
          </Link>
          <Link to="/register/doctor" className="font-semibold text-neon-600 hover:text-neon-800">
            Register as Doctor
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
