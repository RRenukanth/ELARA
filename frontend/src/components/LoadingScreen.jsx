import Logo from "./Logo.jsx";

/**
 * Full-screen loading state, used:
 *  - on first app load, while the auth session is being restored (see App.jsx)
 *  - between page navigations, as the Suspense fallback for lazily-loaded
 *    route components (see App.jsx's React.lazy() page imports)
 *
 * Shares the same neon-gradient background as AuthLayout so the loading
 * state feels like part of the same product rather than a generic spinner.
 */
export default function LoadingScreen({ label = "Loading..." }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-neon-gradient">
      <Logo size="lg" className="animate-pulse" />

      <div className="h-2 w-56 overflow-hidden rounded-full bg-white/20">
        <div className="h-full w-1/3 rounded-full bg-white/90 animate-loading-slide" />
      </div>

      <p className="text-sm font-medium text-neon-100">{label}</p>
    </div>
  );
}
