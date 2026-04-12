import { Check, X } from "lucide-react";
import type { ScanResult } from "@/lib/api";

const items: { key: keyof ScanResult["headers"]; label: string }[] = [
  { key: "csp", label: "Content Security Policy" },
  { key: "xssProtection", label: "XSS Protection" },
  { key: "frameProtection", label: "Frame Protection" },
  { key: "hasSsl", label: "Has SSL" },
  { key: "validSsl", label: "Valid SSL" },
];

const SecurityHeaders = ({ headers, hasDetailedData, analysisMode }: { headers: ScanResult["headers"], hasDetailedData?: boolean, analysisMode?: "OFFLINE" | "RESTRICTED" | "FULL" }) => {
  if (analysisMode === "OFFLINE") {
    return (
      <div className="glass-card p-4 animate-fade-in opacity-70">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center justify-between">
          Security Headers
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Unavailable (Offline)</span>
        </h3>
        <p className="text-xs text-muted-foreground italic">No server configuration available to analyze as the domain is unreachable.</p>
      </div>
    );
  }

  if (!hasDetailedData) {
    return (
      <div className="glass-card p-4 animate-fade-in">
        <h3 className="text-sm font-semibold text-foreground mb-3">Security Headers</h3>
        <p className="text-xs text-muted-foreground">Header analysis requires deep scan mode. Only available via the scrape endpoint.</p>
        <div className="grid grid-cols-2 gap-2 mt-3 opacity-40 pointer-events-none">
          {items.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <X className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-3">Security Headers</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            {headers[key] ? (
              <Check className="h-3.5 w-3.5 text-safe flex-shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 text-danger flex-shrink-0" />
            )}
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SecurityHeaders;
