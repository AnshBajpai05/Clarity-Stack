import { useEffect, useRef, useState } from "react";

interface RiskGaugeProps {
  score: number;
  verdict: "SAFE" | "SUSPICIOUS" | "PHISHING";
  confidence: number;
}

const RiskGauge = ({ score, verdict, confidence }: RiskGaugeProps) => {
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

  const colorClass = score <= 30 ? "text-safe" : score <= 70 ? "text-warning" : "text-danger";
  const strokeColor = score <= 30 ? "hsl(160 84% 39%)" : score <= 70 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)";
  const verdictBg = score <= 30 ? "bg-safe/15 text-safe" : score <= 70 ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger";

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
          <span className={`text-3xl font-bold ${colorClass}`}>{animated}</span>
          <span className="text-xs text-muted-foreground">Risk Score</span>
        </div>
      </div>
      <span
        className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${verdictBg} ${
          showVerdict ? "opacity-100 scale-100" : "opacity-0 scale-75"
        }`}
      >
        {verdict}
      </span>
      <p className="text-sm text-muted-foreground">Confidence: <span className="text-foreground font-medium">{confidence}%</span></p>
    </div>
  );
};

export default RiskGauge;
