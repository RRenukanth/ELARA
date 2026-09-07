export default function StatCard({ label, value }) {
  return (
    <div className="card flex flex-col gap-1">
      <h3 className="text-sm font-medium text-neon-600">{label}</h3>
      <p className="text-2xl font-bold text-neon-950">{value}</p>
    </div>
  );
}
