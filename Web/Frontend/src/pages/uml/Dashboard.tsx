import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitMerge, ExternalLink, RefreshCw, WifiOff, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MainLayout } from "@/components/layout/MainLayout";

const UML_SERVICE_URL =
  (import.meta.env.VITE_UML_URL as string) || `http://${window.location.hostname}:8007`;

type ConnectionStatus = "checking" | "online" | "offline";

export default function UMLDashboard() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [refreshKey, setRefreshKey] = useState(0);

  // Probe the UML service health every 3s until it responds
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const probe = async () => {
      try {
        const res = await fetch(`${UML_SERVICE_URL}`, {
          method: "GET",
          mode: "no-cors", // Vite dev server — just checking reachability
          signal: AbortSignal.timeout(2000),
        });
        setStatus("online");
        clearInterval(interval);
      } catch {
        setStatus("offline");
      }
    };

    probe();
    interval = setInterval(probe, 3000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  // Hand off any pending SRS context to the embedded UML app.
  // Called from BOTH iframe onLoad and the child's "ready" signal — whichever
  // fires first wins; the other no-ops because sessionStorage is cleared after send.
  // This avoids the race where onLoad posts before the UML app's message listener exists.
  const sendSrsContext = useCallback(() => {
    const srsContext = sessionStorage.getItem('uml_srs_context');
    if (!srsContext || !iframeRef.current?.contentWindow) return;
    try {
      const payload = JSON.parse(srsContext);
      if (Date.now() - payload.timestamp < 3600000) { // 1 hour max
        // §15.8: target the UML app's own origin, not '*' — don't broadcast SRS context to any frame.
        iframeRef.current.contentWindow.postMessage({ type: 'SRS_CONTEXT', payload }, new URL(UML_SERVICE_URL).origin);
        // Clear it so it doesn't get resent on manual reloads
        sessionStorage.removeItem('uml_srs_context');
      }
    } catch (e) {
      console.error("Failed to parse uml_srs_context", e);
    }
  }, []);

  // The UML app posts UML_CLARITY_READY once its message listener is mounted.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'UML_CLARITY_READY') sendSrsContext();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sendSrsContext]);

  const handleIframeLoad = () => sendSrsContext();

  const handleRefresh = () => {
    setStatus("checking");
    setRefreshKey((k) => k + 1);
    if (iframeRef.current) {
      iframeRef.current.src = UML_SERVICE_URL;
    }
  };

  return (
    <MainLayout fullWidth={true}>
      <div className="flex flex-col h-full w-full animate-fade-in-up">
        {/* ── Header Bar ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0 glass-panel z-10">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/projects")}
              className="text-muted-foreground hover:text-foreground -ml-2 mr-1"
              title="Back to Projects"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <div className="w-9 h-9 rounded-xl bg-neon-violet/20 border border-neon-violet/30 flex items-center justify-center shadow-glow-sm shadow-neon-violet/30">
              <GitMerge className="w-4 h-4 text-neon-violet" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-sm text-foreground tracking-tight leading-tight">UML-Clarity</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Diagram Intelligence Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/30 border border-border text-xs">
              {status === "checking" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Connecting…</span>
                </>
              )}
              {status === "online" && (
                <>
                  <div className="w-2 h-2 rounded-full bg-neon-mint animate-pulse" />
                  <span className="text-neon-mint font-medium">Online</span>
                </>
              )}
              {status === "offline" && (
                <>
                  <WifiOff className="w-3 h-3 text-destructive" />
                  <span className="text-destructive font-medium">Offline</span>
                </>
              )}
            </div>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleRefresh} title="Refresh UML service">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => window.open(UML_SERVICE_URL, "_blank")} title="Open in new tab">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Main area ── */}
        <div className="flex-1 relative overflow-hidden bg-background">
          {status === "offline" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 glass-panel z-10">
              <div className="w-20 h-20 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center">
                <WifiOff className="w-9 h-9 text-destructive" />
              </div>
              <div className="text-center max-w-sm">
                <h2 className="text-xl font-display font-bold tracking-tight mb-2">UML-Clarity is not running</h2>
                <p className="text-muted-foreground text-sm mb-1">
                  The UML service frontend isn't reachable at <code className="text-xs bg-muted/50 px-1.5 py-0.5 rounded text-destructive">{UML_SERVICE_URL}</code>
                </p>
              </div>
              <Button onClick={handleRefresh} className="gap-2 bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/30 transition-colors">
                <RefreshCw className="w-4 h-4" />
                Retry Connection
              </Button>
            </div>
          )}

          {status === "checking" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 glass-panel z-10">
              <div className="w-16 h-16 rounded-2xl bg-neon-violet/10 border border-neon-violet/30 flex items-center justify-center shadow-glow-sm">
                <Loader2 className="w-7 h-7 text-neon-violet animate-spin" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground tracking-wide">Connecting to UML-Clarity…</p>
            </div>
          )}

          {status === "online" && (
            <>
              {/* Focused invisible walkthrough anchors for UML components */}
              <div 
                data-tour="uml-toolbox" 
                className="absolute left-0 top-0 w-[184px] h-full pointer-events-none z-20"
              />
              <div 
                data-tour="uml-toolbar" 
                className="absolute left-[184px] top-0 right-0 h-[46px] pointer-events-none z-20"
              />
              <div 
                data-tour="uml-ai-prompt" 
                className="absolute left-[184px] top-[46px] right-0 h-[64px] pointer-events-none z-20"
              />
              <div 
                data-tour="uml-canvas" 
                className="absolute left-[184px] top-[110px] right-0 bottom-0 pointer-events-none z-20"
              />
            </>
          )}

          <iframe
            key={refreshKey}
            ref={iframeRef}
            src={UML_SERVICE_URL}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            title="UML-Clarity Diagram Engine"
            allow="clipboard-write"
            style={{ display: status === "offline" ? "none" : "block" }}
          />
        </div>
      </div>
    </MainLayout>
  );
}
