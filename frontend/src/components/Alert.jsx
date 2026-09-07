export default function Alert({ type = "info", message }) {
  if (!message) return null;

  const styles = {
    info: "bg-neon-100 text-neon-800 border-neon-300",
    error: "bg-red-50 text-red-700 border-red-300",
    success: "bg-emerald-50 text-emerald-700 border-emerald-300",
  };

  return (
    <div role="alert" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${styles[type] || styles.info}`}>
      {message}
    </div>
  );
}
