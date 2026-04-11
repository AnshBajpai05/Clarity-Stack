import { Shield, FlaskConical } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useApiStatus } from "@/hooks/useApiStatus";

const navItems = [
  { label: "Dashboard", path: "/" },
  { label: "Batch", path: "/batch" },
  { label: "How It Works", path: "/about" },
];

const Header = () => {
  const { pathname } = useLocation();
  const { online, demoMode, setDemoMode } = useApiStatus();

  return (
    <header className="glass-card sticky top-0 z-50 border-b border-border/30">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <span className="text-lg font-bold text-foreground">ThreatLens</span>
            <p className="text-[10px] leading-none text-muted-foreground">AI-Powered Phishing Detection</p>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === item.path
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {/* API status */}
          <div className="ml-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-safe animate-pulse" : "bg-danger"}`} />
            {online ? "API Online" : "API Offline"}
          </div>

          {/* Demo mode toggle */}
          {!online && (
            <button
              onClick={() => setDemoMode(!demoMode)}
              className={`ml-2 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                demoMode
                  ? "bg-warning/15 text-warning border border-warning/30"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <FlaskConical className="h-3 w-3" />
              Demo Mode
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
