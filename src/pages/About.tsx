import { ArrowRight, Brain, Network, Cpu, Timer, Zap, Clock, ShieldCheck, Layers } from "lucide-react";
import Header from "@/components/Header";

const steps = [
  { label: "URL Input", icon: Zap },
  { label: "Preprocessing", icon: Cpu },
  { label: "GNN Branch", icon: Network, parallel: true },
  { label: "LLM Branch", icon: Brain, parallel: true },
  { label: "PSSA Fusion", icon: Layers },
  { label: "Temporal Weighting", icon: Timer },
  { label: "Verdict", icon: ShieldCheck },
];

const stats = [
  { value: "93.5%", label: "Accuracy" },
  { value: "<1s", label: "Response" },
  { value: "6", label: "Security Checks" },
  { value: "Multi-Modal", label: "AI Analysis" },
];

const features = [
  { title: "Graph Neural Network", desc: "Analyzes URL structure, domain relationships, and link patterns using graph-based deep learning to detect anomalous connection patterns.", icon: Network },
  { title: "Large Language Model", desc: "Processes URL text, page content, and metadata using transformer-based NLP to understand semantic patterns and detect social engineering cues.", icon: Brain },
  { title: "PSSA Fusion", desc: "Probabilistic Soft Score Aggregation combines GNN and LLM outputs using learned attention weights for optimal detection accuracy.", icon: Layers },
  { title: "Temporal Weighting", desc: "Applies time-decay functions to historical threat data, prioritizing recent intelligence while maintaining long-term pattern awareness.", icon: Timer },
];

const techBadges = ["Python", "FastAPI", "PyTorch", "BERT", "NetworkX", "TensorFlow"];

const About = () => (
  <div className="min-h-screen">
    <Header />
    <main className="container py-8 space-y-10 max-w-4xl">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">How It Works</h1>
        <p className="text-sm text-muted-foreground">Multi-modal AI architecture for real-time phishing detection</p>
      </div>

      {/* Architecture Flow */}
      <div className="glass-card p-6">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${
                step.parallel ? "border-accent/50 bg-accent/10" : "border-border bg-card"
              }`}>
                <step.icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-foreground whitespace-nowrap">{step.label}</span>
              </div>
              {i < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="glass-card p-4 text-center">
            <p className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {features.map((f) => (
          <div key={f.title} className="glass-card p-5 space-y-2 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Tech Stack */}
      <div className="text-center space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Tech Stack</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {techBadges.map((t) => (
            <span key={t} className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">{t}</span>
          ))}
        </div>
      </div>
    </main>
  </div>
);

export default About;
