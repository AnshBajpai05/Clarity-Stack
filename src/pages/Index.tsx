import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import RiskGauge from "@/components/RiskGauge";
import ScoreCards from "@/components/ScoreCards";
import SslPanel from "@/components/SslPanel";
import SecurityHeaders from "@/components/SecurityHeaders";
import ThreatIntel from "@/components/ThreatIntel";
import DomainInfo from "@/components/DomainInfo";
import RecentScans from "@/components/RecentScans";
import { predictUrl, demoPredictUrl, saveScan, isValidUrl, type ScanResult } from "@/lib/api";
import { useApiStatus } from "@/hooks/useApiStatus";

const Index = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const { online, demoMode } = useApiStatus();

  const handleScan = async () => {
    const trimmed = url.trim();
    if (!trimmed) return toast.error("Please enter a URL");
    if (!isValidUrl(trimmed)) return toast.error("Invalid URL format");

    setLoading(true);
    setResult(null);
    try {
      const scanFn = online && !demoMode ? predictUrl : demoPredictUrl;
      const res = await scanFn(trimmed);
      setResult(res);
      saveScan(res);
      window.dispatchEvent(new Event("scan-complete"));
    } catch (e: any) {
      toast.error(e?.message || "Scan failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-8 space-y-6">
        {/* Hero */}
        <div className="text-center space-y-4 py-6">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Detect Phishing URLs <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Instantly</span>
          </h1>
          <div className="max-w-2xl mx-auto flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="glow-input w-full pl-10 pr-4"
                placeholder="Enter URL to analyze..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
              />
            </div>
            <button onClick={handleScan} disabled={loading} className="gradient-btn px-6 py-3 flex items-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Analyze URL
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Powered by GNN + LLM Fusion Architecture
            {demoMode && <span className="ml-2 text-warning">• Demo Mode</span>}
          </p>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-6 h-40 animate-pulse" />
            ))}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-[auto_1fr] gap-4">
              <RiskGauge score={result.riskScore} verdict={result.verdict} confidence={result.confidence} />
              <div className="space-y-4">
                <ScoreCards gnn={result.gnnScore} llm={result.llmScore} fusion={result.fusionScore} />
                <DomainInfo result={result} />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <SslPanel ssl={result.ssl} />
              <SecurityHeaders headers={result.headers} />
              <ThreatIntel data={result.threatIntel} />
            </div>
          </div>
        )}

        <RecentScans />
      </main>
    </div>
  );
};

export default Index;
