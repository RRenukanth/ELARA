// Visualizes LIME's per-feature contribution scores as horizontal bars.
// Positive contribution = pushed the prediction toward higher risk (red).
// Negative contribution = pushed the prediction toward lower risk (green).
// Bar length is proportional to |contribution| relative to the largest
// magnitude in this specific explanation, so the chart is readable
// regardless of how large or small the raw coefficients are.
export default function FeatureContributionChart({ factors }) {
  if (!factors || factors.length === 0) {
    return <p className="text-sm text-neon-500">No contributing factors identified for this result.</p>;
  }

  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.contribution)), 0.0001);

  return (
    <div className="flex flex-col gap-2.5">
      {factors.map((f) => {
        const isPositive = f.contribution > 0;
        const widthPercent = Math.max(4, (Math.abs(f.contribution) / maxAbs) * 100);

        return (
          <div key={f.factor} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-neon-800">{f.label}</span>
              <span className={isPositive ? "font-semibold text-red-600" : "font-semibold text-emerald-600"}>
                {isPositive ? "+" : ""}
                {f.contribution.toFixed(4)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-neon-50">
              <div
                className={`h-full rounded-full ${isPositive ? "bg-red-400" : "bg-emerald-400"}`}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        );
      })}

      <div className="mt-1 flex items-center gap-4 text-xs text-neon-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Increases risk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Decreases risk
        </span>
      </div>
    </div>
  );
}
