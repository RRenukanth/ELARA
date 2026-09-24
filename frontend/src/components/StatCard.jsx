const TONES = ["blue", "cyan", "mint", "amber", "crimson"];

export default function StatCard({ label, value, tone }) {
  const resolvedTone = tone || TONES[Math.abs(hash(label)) % TONES.length];
  return (
    <div className={`card card-tint-${resolvedTone} flex flex-col gap-1`}>
      <h3 className="text-sm font-medium text-neon-300">{label}</h3>
      <p className="text-2xl font-bold text-neon-50">{value}</p>
    </div>
  );
}

// Deterministic per-label tone so the same stat always gets the same color
// across renders, without every caller having to pass one explicitly.
function hash(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}
