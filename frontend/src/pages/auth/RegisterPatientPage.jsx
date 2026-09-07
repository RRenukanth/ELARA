import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout.jsx";
import Alert from "../../components/Alert.jsx";
import { api } from "../../services/api.js";

const initialForm = {
  username: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
  age: "",
  sex: "",
  phoneNumber: "",
  emergencyContact: "",
};

export default function RegisterPatientPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.registerPatient({
        username: form.username.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        age: Number(form.age),
        sex: form.sex,
        phoneNumber: form.phoneNumber.trim() || undefined,
        emergencyContact: form.emergencyContact.trim() || undefined,
      });
      setSuccess("Registration successful. Redirecting to login...");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create Your Account" subtitle="Register as a Patient">
      <Alert type="error" message={error} />
      <Alert type="success" message={success} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">First Name</label>
            <input className="input-field" value={form.firstName} onChange={update("firstName")} required />
          </div>
          <div>
            <label className="label">Last Name</label>
            <input className="input-field" value={form.lastName} onChange={update("lastName")} required />
          </div>
        </div>

        <div>
          <label className="label">Username</label>
          <input className="input-field" value={form.username} onChange={update("username")} required />
        </div>

        <div>
          <label className="label">Email Address</label>
          <input type="email" className="input-field" value={form.email} onChange={update("email")} required />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input-field"
              value={form.password}
              onChange={update("password")}
              required
            />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input
              type="password"
              className="input-field"
              value={form.confirmPassword}
              onChange={update("confirmPassword")}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Age</label>
            <input type="number" className="input-field" value={form.age} onChange={update("age")} required />
          </div>
          <div>
            <label className="label">Sex</label>
            <select className="input-field" value={form.sex} onChange={update("sex")} required>
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Phone Number</label>
            <input className="input-field" value={form.phoneNumber} onChange={update("phoneNumber")} />
          </div>
          <div>
            <label className="label">Emergency Contact</label>
            <input className="input-field" value={form.emergencyContact} onChange={update("emergencyContact")} />
          </div>
        </div>

        <button type="submit" className="btn-primary mt-2" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neon-700">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-neon-600 hover:text-neon-800">
          Login
        </Link>
      </p>
    </AuthLayout>
  );
}
