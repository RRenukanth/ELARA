// Required by product.md / security-and-privacy.md: predictions must never
// be presented as a definitive diagnosis. Render this alongside every
// prediction result.
export default function MedicalDisclaimer() {
  return (
    <p className="rounded-xl border border-neon-200 bg-neon-50 px-4 py-3 text-xs leading-relaxed text-neon-700">
      This is a model-based risk assessment, not a medical diagnosis. Please consult a qualified
      healthcare professional for medical decisions.
    </p>
  );
}
