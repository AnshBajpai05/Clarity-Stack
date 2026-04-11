import { useEffect, useState } from "react";

interface ScoreCardsProps {
  gnn: number;
  llm: number;
  fusion: number;
}

const ScoreCard = ({ label, value, desc, delay }: { label: string; value: number; desc: string; delay: number }) => {
  const [visible, setVisible] = useState(false);
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), delay);
    const animTimer = setTimeout(() => setAnimatedValue(value), delay + 100);
    return () => { clearTimeout(showTimer); clearTimeout(animTimer); };
  }, [value, delay]);

  const color = value <= 30 ? "bg-safe" : value <= 70 ? "bg-warning" : "bg-danger";

  return (
    <div
      className={`glass-card p-4 flex-1 min-w-[160px] transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{animatedValue}</p>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`}
          style={{ width: `${animatedValue}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">{desc}</p>
    </div>
  );
};

const ScoreCards = ({ gnn, llm, fusion }: ScoreCardsProps) => (
  <div className="flex gap-3 flex-wrap">
    <ScoreCard label="GNN Score" value={gnn} desc="Graph Neural Network" delay={0} />
    <ScoreCard label="LLM Score" value={llm} desc="Language Model" delay={150} />
    <ScoreCard label="Fusion Score" value={fusion} desc="PSSA Combined" delay={300} />
  </div>
);

export default ScoreCards;
