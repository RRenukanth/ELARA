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
  hospitalName: "",
  hospitalAddress: "",
  specialization: "",
  registrationNumber: "",
  yearsExperience: "",
};

export default function RegisterDoctorPage() {
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
      await api.registerDoctor({
        username: form.username.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        hospitalName: form.hospitalName.trim(),
        hospitalAddress: form.hospitalAddress.trim() || undefined,
        specialization: form.specialization.trim(),
        registrationNumber: form.registrationNumber.trim(),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
      });
      setSuccess("Request submitted. Your account will be reviewed by an administrator.");
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Doctor Registration" subtitle="Administrator verification required">
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

        <div>
          <label className="label">Hospital Name</label>
          <input className="input-field" value={form.hospitalName} onChange={update("hospitalName")} required />
        </div>

        <div>
          <label className="label">Hospital Address</label>
          <input className="input-field" value={form.hospitalAddress} onChange={update("hospitalAddress")} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Specialization</label>
            <input
              className="input-field"
              value={form.specialization}
              onChange={update("specialization")}
              required
            />
          </div>
          <div>
            <label className="label">Years of Experience</label>
            <input
              type="number"
              className="input-field"
              value={form.yearsExperience}
              onChange={update("yearsExperience")}
            />
          </div>
        </div>

        <div>
          <label className="label">Medical Registration Number</label>
          <input
            className="input-field"
            value={form.registrationNumber}
            onChange={update("registrationNumber")}
            required
          />
        </div>

        <p className="rounded-xl border border-neon-200 bg-neon-50 px-4 py-3 text-xs text-neon-700">
          Your account will remain inactive until it is approved by an administrator.
        </p>

        <button type="submit" className="btn-primary mt-2" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit Request"}
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
