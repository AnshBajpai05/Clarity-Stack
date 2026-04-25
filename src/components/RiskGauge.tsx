import { useEffect, useRef, useState } from "react";
import { Server } from "lucide-react";

interface RiskGaugeProps {
  score: number;
  verdict: "SAFE" | "SUSPICIOUS" | "HIGH_RISK" | "PHISHING" | "VERIFICATION_REQUIRED";
  confidence: string;   // "high" | "medium" | "low"
  confidenceNum: number; // 0-100
  scoreBreakdown: { base_score: number; heuristic_boost: number; final_score: number } | null;
}

const RiskGauge = ({ score, verdict, confidence, confidenceNum, scoreBreakdown }: RiskGaugeProps) => {
  const [animated, setAnimated] = useState(0);
  const [showVerdict, setShowVerdict] = useState(false);
  const frameRef = useRef<number>();

  useEffect(() => {
    setAnimated(0);
    setShowVerdict(false);
    let start: number | null = null;
    const duration = 1200;

    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(eased * score));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setTimeout(() => setShowVerdict(true), 150);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [score]);

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;

  const isVerify = verdict === "VERIFICATION_REQUIRED";

  const colorClass = isVerify ? "text-purple-400" : score <= 30 ? "text-safe" : score <= 70 ? "text-warning" : "text-danger";
  const strokeColor = isVerify ? "hsl(270 70% 65%)" : score <= 30 ? "hsl(160 84% 39%)" : score <= 70 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)";
  const verdictBg = isVerify ? "bg-purple-500/15 text-purple-400"
    : verdict === "HIGH_RISK" ? "bg-orange-500/15 text-orange-400"
    : score <= 30 ? "bg-safe/15 text-safe" : score <= 70 ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger";

  return (
    <div className="glass-card p-6 flex flex-col items-center gap-4 animate-fade-in">
      <div className="relative">
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx="70" cy="70" r={radius} fill="none"
            stroke={strokeColor} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isVerify ? (
            <>
              <span className="text-2xl">⚠</span>
              <span className="text-xs text-purple-400 font-bold mt-1">VERIFY</span>
            </>
          ) : (
            <>
              <span className={`text-3xl font-bold ${colorClass}`}>{animated}</span>
              <span className="text-xs text-muted-foreground">Risk Score</span>
            </>
          )}
        </div>
      </div>
      <span
        className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${verdictBg} ${
          showVerdict ? "opacity-100 scale-100" : "opacity-0 scale-75"
        }`}
      >
        {verdict}
      </span>
      <div className="w-full mt-2">
        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Overall Certainty</p>
        <div className="flex items-center gap-2 mb-2">
          <div className={`h-2 w-2 rounded-full ${
            confidence === 'high' ? 'bg-safe shadow-[0_0_8px_rgba(22,163,74,0.5)]' : 
            confidence === 'medium' ? 'bg-warning shadow-[0_0_8px_rgba(234,179,8,0.5)]' : 
            'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.5)]'
          }`} />
          <span className="font-mono text-sm capitalize">{confidence}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-700"
            style={{ width: `${confidenceNum}%`, background: confidenceNum >= 75 ? 'hsl(160 84% 39%)' : confidenceNum >= 50 ? 'hsl(38 92% 50%)' : 'hsl(215 16% 47%)' }}
          />
        </div>
      </div>

      {scoreBreakdown && (
        <div className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-muted/30 to-muted/10 border-t border-border/50 text-xs">
          <div className="text-muted-foreground flex items-center gap-1.5 opacity-80 mb-2">
            <Server className="h-3 w-3" /> Decision based on structural and heuristic signals
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-3 font-mono">
              <div>
                <span className="text-[9px] text-muted-foreground uppercase mr-1.5">AI Baseline</span>
                <span className="text-foreground font-bold">{scoreBreakdown.base_score}</span>
              </div>
              <div className="h-3 w-px bg-border max-sm:hidden" />
              <div>
                <span className="text-[9px] text-muted-foreground uppercase mr-1.5">Heuristic Boost</span>
                <span className="text-warning font-bold">+{scoreBreakdown.heuristic_boost}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskGauge;
