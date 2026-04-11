import { Check, X } from "lucide-react";
import type { ScanResult } from "@/lib/api";

const items: { key: keyof ScanResult["headers"]; label: string }[] = [
  { key: "csp", label: "Content Security Policy" },
  { key: "xssProtection", label: "XSS Protection" },
  { key: "frameProtection", label: "Frame Protection" },
  { key: "hasSsl", label: "Has SSL" },
  { key: "validSsl", label: "Valid SSL" },
];

const SecurityHeaders = ({ headers }: { headers: ScanResult["headers"] }) => (
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

export default SecurityHeaders;
