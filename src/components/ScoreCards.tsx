import { useEffect, useState } from "react";
import { Shield, Layout, Zap } from "lucide-react";

interface Evidence {
  structural_impact: number;
  heuristic_penalty: number;
  scraping_status: "success" | "blocked" | "fast-path";
}

interface ScoreCardProps {
  label: string;
  value: number;
  desc: string;
  delay: number;
  icon: any;
  status?: "success" | "blocked" | "fast-path";
  weak?: boolean;
}

const ScoreCard = ({ label, value, desc, delay, icon: Icon, status, weak }: ScoreCardProps) => {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    if (status === "blocked") {
      setAnimatedValue(0);
      return;
    }
    const timer = setTimeout(() => setAnimatedValue(value), delay + 50);
    return () => clearTimeout(timer);
  }, [value, delay, status]);

  const color = status === "blocked" ? "bg-muted" : weak ? "bg-muted-foreground/30" : value <= 30 ? "bg-safe" : value <= 70 ? "bg-warning" : "bg-danger";
  const displayValue = status === "blocked" ? "UNAVAILABLE" : weak ? "WEAK SIGNAL" : animatedValue === 0 ? "—" : animatedValue;

  return (
    <div className="glass-card p-4 flex-1 min-w-[200px] animate-fade-in relative overflow-hidden group">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary" />
      </div>
      
      <div className="flex items-baseline gap-2">
        <p className={`text-2xl font-bold ${status === "blocked" || weak ? "text-muted-foreground text-sm" : "text-foreground"}`}>
          {displayValue}
        </p>
        {(status === "blocked" || weak) && (
           <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${status === "blocked" ? "bg-danger/10 text-danger border-danger/20" : "bg-warning/10 text-warning border-warning/20"}`}>
             {status === "blocked" ? "Anti-Scrape / Offline" : "Single Node"}
           </span>
        )}
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`}
          style={{ width: `${status === "blocked" || weak ? 100 : animatedValue}%`, opacity: status === "blocked" || weak ? 0.3 : 1 }}
        />
      </div>
      
      <p className="text-[10px] text-muted-foreground mt-2 italic line-clamp-1">{desc}</p>
    </div>
  );
};

const ScoreCards = ({ gnn, nlp, fusion, evidence, analysisMode, graphSignal }: { gnn: number; nlp: number; fusion: number; evidence?: Evidence | null, analysisMode?: string, graphSignal?: string }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
    <ScoreCard 
      label="Structural Analysis" 
      value={gnn} 
      desc={graphSignal === "weak" ? "Insufficient structural depth (single node graph)" : "URL syntax & graph patterns"} 
      icon={Layout}
      weak={graphSignal === "weak"}
      delay={0} 
    />
    <ScoreCard 
      label="Semantic Analysis" 
      value={nlp} 
      desc={analysisMode === "OFFLINE" ? "Unavailable (Offline)" : evidence?.scraping_status === "blocked" ? "Scraping blocked by target server" : "NLP model — rendered page semantics"} 
      icon={Shield}
      status={analysisMode === "OFFLINE" ? "blocked" : evidence?.scraping_status}
      delay={150} 
    />
    <ScoreCard 
      label="Integrated Probability" 
      value={fusion} 
      desc="Fused AI-weighted verdict" 
      icon={Zap}
      delay={300} 
    />
  </div>
);

export default ScoreCards;
