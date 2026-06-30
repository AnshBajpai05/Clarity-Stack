import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Network,
  BarChart3,
  MessageSquare,
  Sparkles,
  Search,
} from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background effects */}
      <div className="glow-orb w-[36rem] h-[36rem] bg-neon-violet top-0 -right-48 opacity-[0.12]" />
      <div className="glow-orb w-[32rem] h-[32rem] bg-neon-cyan -bottom-32 -left-32 opacity-[0.10]" />
      <div className="glow-orb w-[24rem] h-[24rem] bg-neon-peach top-1/2 left-1/3 opacity-[0.05]" />

      {/* NAVBAR */}
      <div className="relative flex justify-between items-center px-8 py-6 border-b border-border/20">
        <h1 className="text-xl font-display font-bold tracking-tight flex items-center gap-2.5">
          ClarityStack
        </h1>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate("/login")}>
            Login
          </Button>
          <Button onClick={() => navigate("/login")}>
            Get Started
          </Button>
        </div>
      </div>

      {/* HERO */}
      <section className="relative flex flex-col items-center justify-center text-center mt-24 px-6 animate-fade-in">


        <h2 className="text-5xl md:text-6xl font-display font-extrabold leading-[1.08] max-w-4xl tracking-tight">
          Turn messy AI chats into{" "}
          <span className="gradient-text">knowledge you can audit</span>
        </h2>

        <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
          ClarityStack runs your question through a genuinely diverse model ensemble,
          surfaces where they <span className="text-foreground font-medium">measurably</span> agree,
          grounds every claim in its source, and chains it all into a living knowledge graph.
        </p>

        <div className="mt-10 flex gap-4">
          <Button size="lg" onClick={() => navigate("/login")} className="shadow-glow">
            Start Building
          </Button>
          <Button size="lg" variant="outline">
            Learn More
          </Button>
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative mt-32 px-10 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Brain,
              iconColor: "text-neon-cyan",
              title: "Honest Multi-Model Engine",
              desc: "Your prompt fans out to a genuinely different ensemble (Groq + NVIDIA). Confidence is the measured agreement between them — never a model's self-report.",
            },
            {
              icon: Network,
              iconColor: "text-neon-violet",
              title: "Semantic Knowledge Graph",
              desc: "Conversations become typed nodes and reasoning edges — supports, contradicts, depends-on — that you can explore and trace.",
            },
            {
              icon: BarChart3,
              iconColor: "text-neon-peach",
              title: "Decision Intelligence",
              desc: "Track decisions, conflicts, and the evidence behind them, with version-chained Temporal Cards as your source of truth.",
            },
          ].map((feature, i) => (
            <div
              key={feature.title}
              className={cn(
                "glass-panel-hover p-6 rounded-2xl group",
                `stagger-${i + 1} animate-fade-in-up`
              )}
            >
              <div className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-[box-shadow] duration-normal",
                feature.iconColor === "text-neon-cyan" && "bg-neon-cyan/10 group-hover:shadow-[0_0_20px_hsl(var(--neon-cyan)/0.2)]",
                feature.iconColor === "text-neon-violet" && "bg-neon-violet/10 group-hover:shadow-[0_0_20px_hsl(var(--neon-violet)/0.2)]",
                feature.iconColor === "text-neon-peach" && "bg-neon-peach/10 group-hover:shadow-[0_0_20px_hsl(var(--neon-peach)/0.2)]",
              )}>
                <feature.icon className={cn("w-5 h-5", feature.iconColor)} />
              </div>
              <h3 className="text-lg font-display font-semibold mb-2 text-foreground">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative mt-32 px-10 text-center max-w-5xl mx-auto pb-24">
        <h2 className="text-3xl font-display font-bold mb-4 tracking-tight">How It Works</h2>
        <p className="text-muted-foreground mb-12 max-w-lg mx-auto">Three steps to transform your project conversations into actionable intelligence.</p>

        <div className="grid md:grid-cols-3 gap-10">
          {[
            { icon: MessageSquare, color: "text-neon-cyan", title: "Ask", desc: "Pose a question in any project chat; the engine assembles the relevant context." },
            { icon: Sparkles, color: "text-neon-violet", title: "Synthesize", desc: "A diverse ensemble answers in parallel; ClarityStack measures their agreement and grounds each claim in its sources." },
            { icon: Search, color: "text-neon-peach", title: "Explore", desc: "Navigate the knowledge graph, replay how decisions evolved, and see what's ready to act on." },
          ].map((step, i) => (
            <div key={step.title} className={`animate-fade-in-up stagger-${i + 1}`}>
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/40",
                step.color === "text-neon-cyan" && "bg-neon-cyan/8",
                step.color === "text-neon-violet" && "bg-neon-violet/8",
                step.color === "text-neon-peach" && "bg-neon-peach/8",
              )}>
                <step.icon className={cn("w-6 h-6", step.color)} />
              </div>
              <h4 className="font-display font-semibold text-lg mb-2 text-foreground">{step.title}</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Helper — cn import from utils
import { cn } from "@/lib/utils";