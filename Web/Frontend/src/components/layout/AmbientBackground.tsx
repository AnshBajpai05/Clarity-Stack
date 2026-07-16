import { useLocation } from "react-router-dom";
import { DottedSurface } from "@/components/ui/dotted-surface";

// Pages with their own bespoke background treatment already (hero particles,
// spotlight, background-lines) — skip the ambient layer there to avoid
// stacking two different effects.
const EXCLUDED_PATHS = new Set(["/", "/login", "/register"]);

// Mounted once at the router root (not per-layout) so it reaches every page
// regardless of which shell that page uses — MainLayout, a bespoke sidebar
// (srs/editor dashboards), or none at all.
export function AmbientBackground() {
  const location = useLocation();
  if (EXCLUDED_PATHS.has(location.pathname)) return null;

  return (
    <>
      <div className="fixed inset-0 z-0 pointer-events-none opacity-60" aria-hidden="true">
        <DottedSurface />
      </div>
      <div className="grain-overlay" aria-hidden="true" />
    </>
  );
}

export default AmbientBackground;
