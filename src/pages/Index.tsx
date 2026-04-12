import { useState } from "react";
import { Search, Loader2, Info, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import RiskGauge from "@/components/RiskGauge";
import ScoreCards from "@/components/ScoreCards";
import SslPanel from "@/components/SslPanel";
import SecurityHeaders from "@/components/SecurityHeaders";
import ThreatIntel from "@/components/ThreatIntel";
import DomainInfo from "@/components/DomainInfo";
import RecentScans from "@/components/RecentScans";
import DecisionDriver from "@/components/DecisionDriver";
import { predictUrl, demoPredictUrl, saveScan, isValidUrl, type ScanResult } from "@/lib/api";
import { useApiStatus } from "@/hooks/useApiStatus";

const Index = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const { online, demoMode } = useApiStatus();

  const handleScan = async (isDeep = false) => {
    const trimmed = url.trim();
    if (!trimmed) return toast.error("Please enter a URL");
    if (!isValidUrl(trimmed)) return toast.error("Invalid URL format");

    setLoading(true);
    // Only reset result if it's a fresh scan, not a deep enrichment of the current result
    if (!isDeep) setResult(null);
    
    try {
      const scanFn = online && !demoMode ? predictUrl : demoPredictUrl;
      const res = await scanFn(trimmed, isDeep);
      setResult(res);
      saveScan(res);
      window.dispatchEvent(new Event("scan-complete"));
      if (isDeep) toast.success("Deep Intelligence analysis complete");
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
            <button onClick={() => handleScan()} disabled={loading} className="gradient-btn px-6 py-3 flex items-center gap-2 disabled:opacity-50">
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
            <div className="flex gap-2 items-center mb-4">
              <div className={`px-3 py-1 rounded border text-xs font-bold tracking-widest ${
                result.analysisMode === "OFFLINE" ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                result.analysisMode === "RESTRICTED" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" :
                "bg-green-500/10 border-green-500/20 text-green-400"
              }`}>
                MODE: {result.analysisMode} ANALYSIS
              </div>
              {result.analysisMode !== "FULL" && (
                <span className="text-xs text-muted-foreground italic">Analysis based on available signals</span>
              )}
            </div>

            <div className="grid md:grid-cols-[auto_1fr] gap-4">
              <RiskGauge score={result.riskScore} verdict={result.verdict} confidence={result.confidence} confidenceNum={result.confidenceNum} scoreBreakdown={result.scoreBreakdown} />
              <div className="space-y-4">
                <ScoreCards 
                  gnn={result.gnnScore} 
                  llm={result.llmScore} 
                  fusion={result.fusionScore} 
                  evidence={result.evidence} 
                  analysisMode={result.analysisMode}
                  graphSignal={result.graphSignal}
                />
                <DomainInfo result={result} />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <SslPanel ssl={result.ssl} analysisMode={result.analysisMode} />
              <SecurityHeaders headers={result.headers} hasDetailedData={result.hasDetailedData} analysisMode={result.analysisMode} />
              <ThreatIntel data={result.threatIntel} analysisMode={result.analysisMode} />
            </div>
            {result.reasons && result.reasons.length > 0 && (
              <div className="glass-card p-6 space-y-4 relative overflow-hidden group">
                {/* Background pulse for suspicious findings */}
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none transition-opacity group-hover:opacity-10">
                  <Shield className="h-48 w-48 text-primary" />
                </div>

                <div className="flex justify-between items-center border-b border-border/50 pb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                        Threat Signals
                        <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Timeline</span>
                      </p>
                      {result.resolvedUrl && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">↳ Resolved to: <span className="text-foreground font-mono">{result.resolvedUrl}</span></p>
                      )}
                    </div>
                  </div>
                  
                  {result.scoreBreakdown && (
                    <div className="flex gap-4 text-xs font-mono">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-muted-foreground uppercase">Structural AI</span>
                        <span className="text-foreground font-bold">{result.scoreBreakdown.base_score}</span>
                      </div>
                      <div className="flex flex-col items-end border-l border-border/50 pl-4">
                        <span className="text-[10px] text-muted-foreground uppercase">Heuristics</span>
                        <span className="text-warning font-bold">+{result.scoreBreakdown.heuristic_boost}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="grid md:grid-cols-2 gap-6 relative z-10">
                  <div>
                    <DecisionDriver result={result} />
                  </div>
                  
                  <div className="space-y-0 relative border-l-2 border-border/30 ml-4 py-2">
                    {result.reasons.map((r, i) => {
                      const isPenalty = r.includes('[+');
                      const cleanReason = r.split(' [')[0];
                      const pts = r.includes('[+') ? r.split('[+')[1].split(']')[0] : null;
                      
                      return (
                        <div key={i} className="flex items-start gap-4 p-3 relative hover:bg-muted/30 rounded-r-xl transition-all group">
                          <div className={`absolute -left-[18px] top-4 h-8 w-8 rounded-full border-4 border-background flex items-center justify-center text-[10px] font-bold ${isPenalty ? 'bg-danger text-danger-foreground' : 'bg-primary text-primary-foreground'}`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 space-y-1 ml-4 pb-4 border-b border-border/30 group-last:border-0 group-last:pb-0">
                            <div className="flex justify-between items-center">
                              <p className="text-sm font-medium text-foreground">{cleanReason}</p>
                              {pts && (
                                <span className="text-[10px] font-bold text-danger bg-danger/10 px-1.5 py-0.5 rounded ml-2">+{pts}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground opacity-80">
                              {isPenalty ? "Threat indicator triggered." : "Observation."}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-start gap-4 p-3 relative mt-2">
                      <div className="absolute -left-[14px] top-4 h-6 w-6 rounded-full bg-safe border-4 border-background" />
                      <div className="flex-1 ml-4 pt-1">
                        <p className="text-sm font-bold text-foreground">Final classification complete</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Deep Scan Trigger if SSL/Headers are missing */}
                {!result.hasDetailedData && result.reachability === 'reachable' && (
                  <div className="pt-4 border-t border-border/50 flex justify-center">
                    <button 
                      onClick={() => handleScan(true)}
                      disabled={loading}
                      className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary-foreground hover:bg-primary/10 px-4 py-2 rounded-lg transition-all border border-primary/20 flex items-center gap-2"
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                      Run Deep Intelligence Analysis
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <RecentScans />
      </main>
    </div>
  );
};

export default Index;
