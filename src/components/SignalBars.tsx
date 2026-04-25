import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import type { ApiSignals } from "@/lib/api";

interface SignalBarProps {
  label: string;
  value: number; // 0-1
  delay: number;
  color?: string;
}

const SignalBar = ({ label, value, delay, color }: SignalBarProps) => {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), delay + 80);
    return () => clearTimeout(t);
  }, [value, delay]);

  const pct = Math.round(animated * 100);
  const barColor = color ?? (
    pct <= 25 ? "bg-emerald-500" :
    pct <= 50 ? "bg-yellow-400" :
    pct <= 75 ? "bg-orange-400" : "bg-red-500"
  );

  return (
    <div className="flex items-center gap-3 group">
      <span className="text-[11px] text-muted-foreground w-40 shrink-0 uppercase tracking-wide font-medium truncate group-hover:text-foreground transition-colors">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-foreground w-8 text-right shrink-0">
        {animated === 0 ? "—" : animated.toFixed(2)}
      </span>
    </div>
  );
};

interface SignalBarsProps {
  signals: ApiSignals;
  riskProbability: number | null;
}

const SIGNAL_LABELS: { key: keyof ApiSignals; label: string }[] = [
  { key: "namespace_risk",     label: "Namespace Risk" },
  { key: "access_friction",    label: "Access Friction" },
  { key: "structural_anomaly", label: "Structural Anomaly" },
  { key: "uncertainty",        label: "Model Uncertainty" },
  { key: "gnn_score",          label: "Graph (GNN)" },
  { key: "nlp_score",          label: "Semantic (NLP)" },
  { key: "visual_score",       label: "Visual Similarity" },
  { key: "is_shortener",       label: "URL Shortener" },
  { key: "has_ip_pattern",     label: "IP Pattern Host" },
  { key: "is_unreachable",     label: "NXDOMAIN" },
  { key: "redirect_depth",     label: "Cross-domain Redirect" },
];

const SignalBars = ({ signals, riskProbability }: SignalBarsProps) => {
  const probDisplay = riskProbability != null;
  return (
    <div className="glass-card p-5 animate-fade-in space-y-4">
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">Signal Breakdown</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Risk Probability</span>
          {probDisplay ? (
            <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${
              riskProbability >= 0.8 ? "text-red-400 bg-red-500/10" :
              riskProbability >= 0.6 ? "text-orange-400 bg-orange-500/10" :
              riskProbability >= 0.4 ? "text-yellow-400 bg-yellow-500/10" :
              "text-emerald-400 bg-emerald-500/10"
            }`}>
              {(riskProbability * 100).toFixed(1)}%
            </span>
          ) : (
            <span className="text-sm font-mono font-bold px-2 py-0.5 rounded text-muted-foreground bg-muted/30">
              N/A
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {SIGNAL_LABELS.map(({ key, label }, i) => (
          <SignalBar
            key={key}
            label={label}
            value={signals[key]}
            delay={i * 50}
          />
        ))}
      </div>

      <div className="pt-3 border-t border-border/30 text-[10px] text-muted-foreground font-mono flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> 0–0.25 Safe
        <span className="h-2 w-2 rounded-full bg-yellow-400 inline-block ml-2" /> 0.25–0.50
        <span className="h-2 w-2 rounded-full bg-orange-400 inline-block ml-2" /> 0.50–0.75
        <span className="h-2 w-2 rounded-full bg-red-500 inline-block ml-2" /> 0.75–1 Critical
      </div>
    </div>
  );
};

export default SignalBars;
