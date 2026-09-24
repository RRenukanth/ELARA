// Required by product.md / security-and-privacy.md: predictions must never
// be presented as a definitive diagnosis. Render this alongside every
// prediction result.
export default function MedicalDisclaimer() {
  return (
    <p className="rounded-xl border border-white/10 bg-neon-950 px-4 py-3 text-xs leading-relaxed text-neon-200">
      This is a model-based risk assessment, not a medical diagnosis. Please consult a qualified
      healthcare professional for medical decisions.
    </p>
  );
}
