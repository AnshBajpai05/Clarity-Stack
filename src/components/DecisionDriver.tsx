import { Target, AlertTriangle, ShieldOff, CheckCircle2 } from "lucide-react";
import type { ScanResult } from "@/lib/api";

const DecisionDriver = ({ result }: { result: ScanResult }) => {
  const signal = result.evidence?.signal_reliability;
  const isWeakGraph = result.graphSignal === "weak";
  const isOffline = result.analysisMode === "OFFLINE";
  const isBlocked = result.analysisMode === "RESTRICTED";

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

      <div className="pt-3 mt-4 border-t border-border/50 bg-muted/20 p-3 rounded-lg">
        <p className="text-xs font-mono text-muted-foreground">
          Verdict Generation: <span className="text-foreground font-bold">{
            result.scoreBreakdown && result.scoreBreakdown.heuristic_boost > 0 
              ? "Heuristic + structure dominated classification" 
              : "AI Model driven classification"
          }</span>
        </p>
      </div>
    </div>
  );
};

export default DecisionDriver;
