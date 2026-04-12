import { ShieldAlert, ShieldCheck, HelpCircle } from "lucide-react";
import type { ScanResult } from "@/lib/api";

const ThreatIntel = ({ data, analysisMode }: { data: ScanResult["threatIntel"], analysisMode?: "OFFLINE" | "RESTRICTED" | "FULL" }) => {
  if (analysisMode === "OFFLINE") {
    return (
      <div className="glass-card p-4 animate-fade-in opacity-70">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            Threat Intelligence
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Not Queried (Offline)</span>
        </h3>
        <p className="text-xs text-muted-foreground italic">Domain is offline, threat database check skipped.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card p-4 animate-fade-in">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Threat Intelligence
        </h3>
        <p className="text-xs text-muted-foreground">Unavailable</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        {!data.isMalicious ? (
          <ShieldCheck className="h-4 w-4 text-safe" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-danger" />
        )}
        Threat Intelligence
      </h3>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className={!data.isMalicious ? "text-safe" : "text-danger"}>
            {data.isMalicious ? "THREAT DETECTED" : "SAFE"}
          </span>
        </div>
        {data.threatTypes.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Threats</span>
            <span className="text-danger">{data.threatTypes.join(", ")}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Confidence</span>
          <span className="text-foreground">{data.confidence.toFixed(0)}%</span>
        </div>
        {data.sources.length > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sources</span>
            <span className="text-foreground">{data.sources.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThreatIntel;
