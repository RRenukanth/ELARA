import Logo from "../../components/Logo.jsx";

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neon-gradient px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <Logo size="lg" className="mb-3" />
          <h1 className="text-2xl font-bold">ELARA</h1>
          <p className="text-sm text-neon-100">Predict - Monitor - Prevent</p>
        </div>

        <div className="card">
          <h2 className="mb-1 text-center text-xl font-bold text-neon-950">{title}</h2>
          {subtitle && <p className="mb-6 text-center text-sm text-neon-600">{subtitle}</p>}
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-neon-100">
          ELARA Heart Disease Prediction System - Version 1.0
        </p>
      </div>
    </div>
  );
}
