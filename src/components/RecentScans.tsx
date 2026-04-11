import { getRecentScans, type ScanResult } from "@/lib/api";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const verdictStyle = (v: ScanResult["verdict"]) =>
  v === "SAFE" ? "bg-safe/15 text-safe" : v === "SUSPICIOUS" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger";

const RecentScans = () => {
  const [scans, setScans] = useState<ScanResult[]>([]);

  useEffect(() => {
    setScans(getRecentScans());
    const handler = () => setScans(getRecentScans());
    window.addEventListener("storage", handler);
    window.addEventListener("scan-complete", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("scan-complete", handler);
    };
  }, []);

  if (scans.length === 0) return null;

  return (
    <div className="glass-card p-4 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" /> Recent Scans
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/50">
              <th className="text-left pb-2 font-medium">URL</th>
              <th className="text-center pb-2 font-medium">Verdict</th>
              <th className="text-center pb-2 font-medium">Risk</th>
              <th className="text-right pb-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {scans.slice(0, 10).map((s, i) => (
              <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="py-2 text-foreground truncate max-w-[200px]">{s.url}</td>
                <td className="py-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${verdictStyle(s.verdict)}`}>{s.verdict}</span>
                </td>
                <td className="py-2 text-center text-foreground">{s.riskScore}</td>
                <td className="py-2 text-right text-muted-foreground">{new Date(s.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentScans;
