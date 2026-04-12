import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import { predictBatch, demoPredictBatch, saveScan, isValidUrl, type ScanResult } from "@/lib/api";
import { useApiStatus } from "@/hooks/useApiStatus";

const verdictStyle = (v: ScanResult["verdict"]) =>
  v === "SAFE" ? "bg-safe/15 text-safe" : v === "SUSPICIOUS" ? "bg-warning/15 text-warning" : "bg-danger/15 text-danger";

const Batch = () => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScanResult[]>([]);
  const { online, demoMode } = useApiStatus();

  const urls = input.split("\n").map((u) => u.trim()).filter(Boolean);

  const handleScan = async () => {
    const valid = urls.filter(isValidUrl);
    if (valid.length === 0) return toast.error("No valid URLs found");

    setLoading(true);
    setResults([]);
    setProgress(0);
    try {
      const scanFn = online && !demoMode ? predictBatch : demoPredictBatch;
      const res = await scanFn(valid);
      res.forEach(saveScan);
      setResults(res);
      setProgress(100);
    } catch (e: any) {
      toast.error(e?.message || "Batch scan failed.");
    } finally {
      window.dispatchEvent(new Event("scan-complete"));
      setLoading(false);
    }
  };

  const safe = results.filter((r) => r.verdict === "SAFE").length;
  const suspicious = results.filter((r) => r.verdict === "SUSPICIOUS").length;
  const phishing = results.filter((r) => r.verdict === "PHISHING").length;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-8 space-y-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-foreground">
          Batch Scanner
          {demoMode && <span className="ml-2 text-sm font-medium text-warning">Demo Mode</span>}
        </h1>

        <textarea
          className="glow-input w-full h-40 resize-none"
          placeholder="Enter URLs, one per line..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <button onClick={handleScan} disabled={loading} className="gradient-btn px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Scan All
          </button>
          {urls.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium">{urls.length} URLs</span>
          )}
        </div>

        {loading && (
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="glass-card p-3 text-center">
                <p className="text-xl font-bold text-foreground">{results.length}</p>
                <p className="text-[10px] text-muted-foreground">Total Scanned</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xl font-bold text-safe">{safe}</p>
                <p className="text-[10px] text-muted-foreground">Safe</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xl font-bold text-warning">{suspicious}</p>
                <p className="text-[10px] text-muted-foreground">Suspicious</p>
              </div>
              <div className="glass-card p-3 text-center">
                <p className="text-xl font-bold text-danger">{phishing}</p>
                <p className="text-[10px] text-muted-foreground">Phishing</p>
              </div>
            </div>

            <div className="glass-card p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/50">
                    <th className="text-left pb-2 font-medium">URL</th>
                    <th className="text-center pb-2 font-medium">Risk</th>
                    <th className="text-center pb-2 font-medium">Verdict</th>
                    <th className="text-center pb-2 font-medium">Confidence</th>
                    <th className="text-left pb-2 font-medium">Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="py-2 text-foreground truncate max-w-[220px]" title={r.url}>{r.url}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.riskScore <= 30 ? "bg-safe" : r.riskScore <= 70 ? "bg-warning" : "bg-danger"}`}
                              style={{ width: `${r.riskScore}%` }}
                            />
                          </div>
                          <span className="text-foreground w-6 text-right">{r.riskScore}</span>
                        </div>
                      </td>
                      <td className="py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${verdictStyle(r.verdict)}`}>{r.verdict}</span>
                      </td>
                      <td className="py-2 text-center">
                        <span className={`text-[10px] font-semibold uppercase ${
                          r.confidence === 'high' ? 'text-safe' : r.confidence === 'medium' ? 'text-warning' : 'text-muted-foreground'
                        }`}>{r.confidence}</span>
                      </td>
                      <td className="py-2 text-left">
                        <div className="flex flex-wrap gap-1">
                          {(r.reasons || []).slice(0, 2).map((sig, si) => (
                            <span key={si} className="px-1.5 py-0.5 text-[9px] rounded bg-muted/50 text-muted-foreground border border-border/50">{sig}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Batch;
