import { ShieldQuestion, ScanSearch, Fingerprint } from "lucide-react";

interface VerificationCardProps {
  reasons: string[];
  reachability?: string;
  onDeepScan: () => void;
  loading?: boolean;
}

const VerificationCard = ({ reasons, reachability, onDeepScan, loading }: VerificationCardProps) => {
  const isUnreachable = reachability === "unreachable";
  return (
  <div className="glass-card p-6 border border-purple-500/30 bg-purple-500/5 animate-fade-in space-y-4 relative overflow-hidden">
    {/* Background glow */}
    <div className="absolute -top-8 -right-8 h-32 w-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
        <ShieldQuestion className="h-5 w-5 text-purple-400" />
      </div>
      <div>
        <p className="text-sm font-bold text-purple-300 uppercase tracking-widest">
          {isUnreachable ? "Domain Unreachable" : "Verification Required"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isUnreachable
            ? "Cannot resolve domain (NXDOMAIN/Timeout) — no data to verify safety"
            : "Automated inspection was blocked — classification deferred"}
        </p>
      </div>
    </div>

    <div className="border-l-2 border-purple-500/30 pl-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Why this happened</p>
      {reasons.filter(r => r.length > 0).map((r, i) => (
        <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
          <span className="text-purple-400 mt-0.5">›</span>
          {r.replace(/\[.*?\]/g, "").trim()}
        </p>
      ))}
    </div>

    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
      <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
        <Fingerprint className="h-3.5 w-3.5 text-purple-400" />
        Recommended Actions
      </p>
      <ul className="space-y-1.5">
        {[
          "Run a Full Deep Browser Scan below",
          "Verify this URL manually in a sandbox",
          "Check domain reputation via external sources",
        ].map((a, i) => (
          <li key={i} className="text-[11px] text-muted-foreground flex items-center gap-2">
            <span className="text-purple-400 font-bold">→</span> {a}
          </li>
        ))}
      </ul>
    </div>

    <button
      onClick={onDeepScan}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-purple-500/40 text-xs font-bold uppercase tracking-widest text-purple-300 hover:bg-purple-500/10 transition-all disabled:opacity-50"
    >
      {loading
        ? <span className="animate-spin h-3.5 w-3.5 border-2 border-purple-400 border-t-transparent rounded-full" />
        : <ScanSearch className="h-3.5 w-3.5" />
      }
      Run Deep Browser Scan
    </button>
  </div>
  );
};

export default VerificationCard;
