import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "./AuthLayout.jsx";
import Alert from "../../components/Alert.jsx";

// Backend password-reset flow is not yet implemented (no endpoint exists).
// This page intentionally shows an honest "not available yet" message
// rather than a fake success flow with no real email/OTP dispatch behind it.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setMessage(
      "Password reset is not available yet. Please contact an administrator to regain access to your account."
    );
  }

  return (
    <AuthLayout title="Forgot Password" subtitle="Enter your registered email address.">
      <Alert type="info" message={message} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label">Email Address</label>
          <input
            type="email"
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your registered email"
            required
          />
        </div>

        <button type="submit" className="btn-primary">
          Send Reset Instructions
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neon-700">
        <Link to="/login" className="font-semibold text-neon-600 hover:text-neon-800">
          Back to Login
        </Link>
      </p>
    </AuthLayout>
  );
}
