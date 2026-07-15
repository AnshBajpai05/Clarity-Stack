import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AetherFlowHero from "@/components/ui/aether-flow-hero";
import { Typewriter } from "@/components/ui/typewriter";
import { ProcessPillars } from "@/components/ui/process-pillars";
import { GlareCard } from "@/components/ui/glare-card";
import { DottedSurface } from "@/components/ui/dotted-surface";
import { MarqueeBand } from "@/components/ui/marquee-band";
import { DoodleStar, DoodleSquiggle, DoodleOrbit } from "@/components/ui/doodles";
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
      {/* Film grain over the whole landing page */}
      <div className="grain-overlay" aria-hidden="true" />
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

      {/* HERO — interactive particle network + typewriter headline */}
      <AetherFlowHero
        className="h-[calc(100vh-5.5rem)] min-h-[560px] animate-fade-in"
        badgeText="Honest Multi-Model Intelligence"
        title={
          <>
            Turn messy AI chats into
            <br />
            <Typewriter
              text={[
                "knowledge you can audit",
                "decisions you can trace",
                "confidence you can measure",
                "a living knowledge graph",
              ]}
              speed={55}
              deleteSpeed={28}
              waitTime={2200}
              cursorChar="_"
              cursorClassName="ml-1 text-purple-400"
              className="gradient-text"
            />
          </>
        }
        description={
          <>
            ClarityStack runs your question through a genuinely diverse model ensemble,
            surfaces where they <span className="text-foreground font-medium">measurably</span> agree,
            grounds every claim in its source, and chains it all into a living knowledge graph.
          </>
        }
        ctaLabel="Start Building"
        onCtaClick={() => navigate("/login")}
        actions={
          <Button
            size="lg"
            variant="outline"
            className="h-[52px]"
            onClick={() =>
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Learn More
          </Button>
        }
      />

      {/* STUDIO MARQUEE — scrolling promise band */}
      <MarqueeBand
        className="mt-20"
        phrases={[
          "Measured Confidence",
          "Grounded Claims",
          "Honest Ensemble",
          "Living Knowledge Graph",
          "Decision Intelligence",
        ]}
      />

      {/* FEATURES */}
      <section id="features" className="relative mt-32 px-10 max-w-6xl mx-auto">
        <div className="mb-12 flex flex-col items-start gap-3">
          <span className="section-number">01 ~ what it does</span>
          <div className="relative">
            <h2 className="text-3xl font-display font-bold tracking-tight">
              Flagship features
            </h2>
            <DoodleStar className="absolute -top-5 -right-10 text-neon-peach animate-float" />
          </div>
        </div>
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
            <GlareCard
              key={feature.title}
              containerClassName={cn("w-full aspect-auto", `stagger-${i + 1} animate-fade-in-up`)}
              className="group p-6 bg-card/80"
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
            </GlareCard>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative mt-32 px-10 text-center max-w-5xl mx-auto pb-24">
        <span className="section-number block mb-3">02 ~ the flow</span>
        <div className="inline-block relative">
          <h2 className="text-3xl font-display font-bold mb-1 tracking-tight">How It Works</h2>
          <DoodleSquiggle className="mx-auto text-neon-violet mb-3" />
        </div>
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

        {/* Pipeline depth — each stage builds on the last */}
        <div className="mt-20 flex flex-col items-center gap-6">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">
            The pipeline, stage by stage
          </p>
          <div className="flex justify-center">
            <ProcessPillars labels={["Ask", "Classify", "Ensemble", "Ground", "Graph"]} />
          </div>
        </div>
      </section>

      {/* CLOSING CTA — dotted surface ripples and follows the cursor */}
      <section className="relative h-[80vh] min-h-[520px] flex items-center justify-center overflow-hidden">
        <DottedSurface className="cursor-crosshair" />
        {/* soft glow behind the copy, matching the hero treatment */}
        <div className="pointer-events-none absolute -top-[10%] left-1/2 -translate-x-1/2 w-[140%] h-full rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--neon-violet)/0.09),transparent_55%)] blur-[40px]" />

        <div className="relative z-10 pointer-events-none flex flex-col items-center text-center max-w-2xl px-6">
          <span className="section-number block mb-4 animate-fade-in-up stagger-1">03 ~ begin</span>
          <span className="inline-block px-3 py-1 mb-6 text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground bg-muted/60 border border-border rounded-md animate-fade-in-up stagger-1">
            ClarityStack Knowledge Engine
          </span>

          <div className="relative animate-fade-in-up stagger-2">
            <h2 className="text-5xl sm:text-6xl font-display font-semibold tracking-tight leading-[1.05] mb-5 text-foreground">
              Built on solid ground
            </h2>
            <DoodleOrbit className="absolute -top-8 -right-14 text-neon-cyan animate-float" />
          </div>

          <p className="text-base sm:text-lg leading-relaxed mb-10 px-2 text-muted-foreground animate-fade-in-up stagger-3">
            A quiet field of particles that ripples with the wave of the canvas —
            and reacts to every move your cursor makes. Every claim beneath it is
            grounded, measured, and traceable.
          </p>

          <div className="pointer-events-auto flex flex-col sm:flex-row items-center gap-3 animate-fade-in-up stagger-4">
            <Button size="lg" onClick={() => navigate("/login")} className="shadow-glow">
              Start Building
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() =>
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Explore the features
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Helper — cn import from utils
import { cn } from "@/lib/utils";