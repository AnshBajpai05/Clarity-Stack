import { Target, AlertTriangle, ShieldOff, CheckCircle2, Download, FileCode2, Cpu } from "lucide-react";
import type { ScanResult } from "@/lib/api";

const DecisionDriver = ({ result }: { result: ScanResult }) => {
  const signal = result.evidence?.signal_reliability;
  const isWeakGraph = result.graphSignal === "weak";
  const isOffline = result.analysisMode === "OFFLINE";
  const isBlocked = result.analysisMode === "RESTRICTED";
  const ds = result.deepScan;

  const handleExportSiem = async () => {
    try {
      const res = await fetch("/export/siem");
      if (!res.ok) { alert("No scan result to export. Run a scan first."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "threatlens_export.json"; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Export failed."); }
  };

  return (
    <div className="glass-card p-5 animate-fade-in space-y-4">
      <div className="flex items-center gap-2 border-b border-border/50 pb-3">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">Decision Driver</h3>
      </div>
      
      <div className="space-y-4 border-l-2 border-border/50 pl-3 ml-2">
        <div className="flex items-start gap-3 relative">
           <div className="absolute -left-[21px] top-0.5 bg-background rounded-full">
             <CheckCircle2 className="h-4 w-4 text-safe" />
           </div>
           <div>
             <p className="text-sm text-foreground font-medium flex items-center gap-2">
               Structural Heuristics <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] uppercase font-bold tracking-wider">Primary</span>
             </p>
             <p className="text-xs text-muted-foreground mt-0.5">URL patterns and known threat indicators heavily influenced this classification.</p>
           </div>
        </div>
        
        {isWeakGraph && (
          <div className="flex items-start gap-3 relative">
             <div className="absolute -left-[21px] top-0.5 bg-background rounded-full">
               <AlertTriangle className="h-4 w-4 text-warning" />
             </div>
             <div>
               <p className="text-sm text-foreground font-medium flex items-center gap-2">
                 ML Model <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Secondary</span>
               </p>
               <p className="text-xs text-warning mt-0.5">Graph signal weak (single node limits graph depth)</p>
             </div>
          </div>
        )}
      </div>

      {result.unusedSignals && result.unusedSignals.length > 0 && (
         <div className="mt-4 pt-4 border-t border-border/50">
           <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">Not Used In Analysis</p>
           <div className="space-y-1">
             {result.unusedSignals.map((signal, idx) => (
               <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground opacity-80">
                 <ShieldOff className="h-3 w-3" />
                 <span>{signal}</span>
               </div>
             ))}
           </div>
         </div>
      )}

      {result.verdict === "PHISHING" && result.attackTypes && result.attackTypes.length > 0 && (
         <div className="mt-4 pt-4 border-t border-border/50">
           <p className="text-[10px] uppercase font-bold text-danger tracking-wider mb-2">Attack Type Identified</p>
           <div className="flex flex-wrap gap-2">
             {result.attackTypes.map((attack, idx) => (
               <span key={idx} className="px-2 py-1 rounded bg-danger/10 border border-danger/20 text-danger font-medium text-[10px] uppercase tracking-wide">
                 {attack}
               </span>
             ))}
           </div>
         </div>
      )}

      <div className="pt-3 mt-4 border-t border-border/50 bg-muted/20 p-3 rounded-lg space-y-2">
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-3">Decision Flow</p>
        <div className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
          {[
            { label: "Structural Signals", value: "Heuristics + Namespace + Friction" },
            { label: "Logistic Layer", value: "compute_logit(signals) → sigmoid" },
            { label: "Risk Probability", value: result.riskProbability != null ? `${(result.riskProbability * 100).toFixed(1)}%` : "N/A" },
            { label: "Ordinal Mapping", value: result.verdict },
          ].map(({ label, value }, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-primary/50 text-[10px]">{i + 1}.</span>
              <span className="text-[11px] text-muted-foreground w-32 shrink-0">{label}</span>
              <span className="text-foreground font-bold text-[11px] truncate">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deep Scan behavioral findings */}
      {ds?.enabled && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-3.5 w-3.5 text-primary" />
            <p className="text-[10px] uppercase font-bold text-primary tracking-wider">Deep Scan Findings</p>
          </div>
          <div className="space-y-1 text-xs font-mono text-muted-foreground bg-muted/20 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${ds.external_scripts_count > 0 ? "text-warning" : "text-safe"}`}>⟶</span>
              <span>{ds.external_scripts_count} external script host{ds.external_scripts_count !== 1 ? "s" : ""} detected</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${ds.redirect_count > 0 ? "text-warning" : "text-muted-foreground"}`}>⟶</span>
              <span>{ds.redirect_count} redirect hop{ds.redirect_count !== 1 ? "s" : ""} captured</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${ds.screenshot_available ? "text-primary" : "text-muted-foreground"}`}>⟶</span>
              <span>{ds.screenshot_available ? "Screenshot captured (rendered page)" : "Screenshot not available"}</span>
            </div>
            {ds.render_error && ds.render_error !== "playwright_missing" && (
              <div className="text-warning mt-1">⚠ Render note: {ds.render_error.slice(0, 80)}</div>
            )}
            {ds.render_error === "playwright_missing" && (
              <div className="text-warning mt-1">⚠ Playwright not installed — install to enable behavioral capture</div>
            )}
          </div>
        </div>
      )}

      {/* Export for SIEM */}
      <div className="mt-4 pt-4 border-t border-border/50">
        <button
          onClick={handleExportSiem}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-primary/30 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 transition-all"
        >
          <FileCode2 className="h-3 w-3" />
          Export for SIEM
          <Download className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export default DecisionDriver;
