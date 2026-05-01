import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Network,
  BarChart3,
  Upload,
  Sparkles,
  Search,
} from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1033] to-[#0f1a2b] text-white">
      
      {/* NAVBAR */}
      <div className="flex justify-between items-center px-8 py-6">
        <h1 className="text-xl font-semibold tracking-wide flex items-center gap-2">
          <Sparkles className="text-cyan-400" size={20} />
          ClarityStack
        </h1>

        <div className="flex gap-4">
          <Button variant="ghost" onClick={() => navigate("/login")}>
            Login
          </Button>
          <Button onClick={() => navigate("/login")}>
            Get Started
          </Button>
        </div>
      </div>

      {/* HERO */}
      <section className="flex flex-col items-center justify-center text-center mt-24 px-6">
        <h2 className="text-5xl font-bold leading-tight max-w-4xl">
          Turn messy AI chats into
          <span className="text-cyan-400"> structured knowledge</span>
        </h2>

        <p className="mt-6 text-lg text-gray-300 max-w-2xl">
          ClarityStack synthesizes multiple AI models, builds knowledge graphs,
          and tracks decision reasoning — all in one place.
        </p>

        <div className="mt-8 flex gap-4">
          <Button size="lg" onClick={() => navigate("/login")}>
            Start Building
          </Button>
          <Button size="lg" variant="outline">
            Learn More
          </Button>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mt-28 px-10 grid md:grid-cols-3 gap-8">
        
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-cyan-400/40 transition">
          <Brain className="text-cyan-400 mb-4" size={28} />
          <h3 className="text-xl font-semibold mb-3">Multi-Model AI</h3>
          <p className="text-gray-400">
            Combine outputs from Groq, HuggingFace, and Gemini to generate a
            unified truth.
          </p>
        </div>

        <div className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-cyan-400/40 transition">
          <Network className="text-purple-400 mb-4" size={28} />
          <h3 className="text-xl font-semibold mb-3">Knowledge Graph</h3>
          <p className="text-gray-400">
            Automatically convert conversations into structured nodes and
            relationships.
          </p>
        </div>

        <div className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-cyan-400/40 transition">
          <BarChart3 className="text-amber-400 mb-4" size={28} />
          <h3 className="text-xl font-semibold mb-3">Decision Intelligence</h3>
          <p className="text-gray-400">
            Track decisions, conflicts, and reasoning across evolving discussions.
          </p>
        </div>

      </section>

      {/* HOW IT WORKS */}
      <section className="mt-28 px-10 text-center">
        <h2 className="text-3xl font-bold mb-10">How It Works</h2>

        <div className="grid md:grid-cols-3 gap-8">
          
          <div>
            <Upload className="mx-auto mb-3 text-cyan-400" />
            <h4 className="font-semibold text-lg mb-2">Import</h4>
            <p className="text-gray-400">
              Paste conversations from ChatGPT, Slack, or documents.
            </p>
          </div>

          <div>
            <Sparkles className="mx-auto mb-3 text-purple-400" />
            <h4 className="font-semibold text-lg mb-2">Synthesize</h4>
            <p className="text-gray-400">
              AI models analyze and merge information into structured knowledge.
            </p>
          </div>

          <div>
            <Search className="mx-auto mb-3 text-amber-400" />
            <h4 className="font-semibold text-lg mb-2">Explore</h4>
            <p className="text-gray-400">
              Navigate your knowledge graph and trace decisions.
            </p>
          </div>

        </div>
      </section>
    </div>
  );
}