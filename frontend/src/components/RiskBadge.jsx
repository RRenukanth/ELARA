const STYLES = {
  "LOW RISK": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "MEDIUM RISK": "bg-amber-100 text-amber-700 border-amber-300",
  "HIGH RISK": "bg-red-100 text-red-700 border-red-300",
};

export default function RiskBadge({ riskLevel }) {
  const style = STYLES[riskLevel] || "bg-neon-100 text-neon-700 border-neon-300";
  return (
    <span className={`inline-block rounded-full border px-4 py-1.5 text-sm font-semibold ${style}`}>
      {riskLevel}
    </span>
  );
}
