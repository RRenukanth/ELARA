// Visualizes HRFLM's GLOBAL feature-importance ranking as horizontal bars.
// Unlike FeatureContributionChart (LIME, per-prediction, signed
// increases/decreases risk), HRFLM importances are unsigned magnitudes --
// "how much this feature drives the model's decisions overall", not
// "did this feature push THIS prediction up or down". All bars use one
// consistent color to avoid implying a direction that isn't there.
export default function FeatureImportanceChart({ importances }) {
  if (!importances || importances.length === 0) {
    return <p className="text-sm text-neon-500">No global feature importance data available.</p>;
  }

  const maxImportance = Math.max(...importances.map((f) => f.hybridImportance), 0.0001);

  return (
    <div className="flex flex-col gap-2.5">
      {importances.map((f) => {
        const widthPercent = Math.max(4, (f.hybridImportance / maxImportance) * 100);

        return (
          <div key={f.feature} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-neon-800">{f.label}</span>
              <span className="font-semibold text-neon-700">{f.hybridImportance.toFixed(4)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-neon-50">
              <div className="h-full rounded-full bg-neon-500" style={{ width: `${widthPercent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
