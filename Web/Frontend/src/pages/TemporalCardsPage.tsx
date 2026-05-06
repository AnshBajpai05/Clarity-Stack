import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  getTemporalCards,
  getCardsByLabel,
  getExpiredCards,
  generateCardByLabel,
  autoGenerateCards,
  refreshCard,
  applyKGUpdates,
  exportReadme,
  exportUml,
  exportPpt,
} from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import {
  Layers, FileCode, FileImage, Presentation,
  RefreshCw, Clock, GitBranch, Brain, Zap,
  AlertTriangle, CheckCircle, Archive, Tag
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LABELS = [
  { key: "all", name: "All", color: "from-slate-500 to-slate-600", icon: Layers },
  { key: "risk", name: "Risk", color: "from-red-500 to-rose-600", icon: AlertTriangle },
  { key: "decision", name: "Decision", color: "from-violet-500 to-purple-600", icon: CheckCircle },
  { key: "architecture", name: "Architecture", color: "from-blue-500 to-cyan-600", icon: GitBranch },
  { key: "progress", name: "Progress", color: "from-green-500 to-emerald-600", icon: Zap },
  { key: "conflict", name: "Conflict", color: "from-orange-500 to-amber-600", icon: AlertTriangle },
  { key: "general", name: "General", color: "from-slate-400 to-gray-500", icon: Tag },
] as const;

const LABEL_BADGE: Record<string, string> = {
  risk: "bg-red-500/15 text-red-400 border-red-500/30",
  decision: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  architecture: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  progress: "bg-green-500/15 text-green-400 border-green-500/30",
  conflict: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  general: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function getTimeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  return `${hours}h left`;
}

export default function TemporalCardsPage() {
  const { projectId } = useParams();
  const { toast } = useToast();

  const [cards, setCards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState("all");
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [autoGenResult, setAutoGenResult] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      let data;
      if (activeLabel === "all") {
        data = await getTemporalCards(projectId);
      } else {
        data = await getCardsByLabel(projectId, activeLabel);
      }
      setCards(data);
    } catch (err) {
      toast({ title: "Failed to load cards", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, activeLabel, toast]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleExport = async (type: "readme" | "uml" | "ppt") => {
    if (!projectId) return;
    setExporting(type);
    try {
      let data;
      let filename = "";
      if (type === "readme") { data = await exportReadme(projectId); filename = "README.md"; }
      else if (type === "uml") { data = await exportUml(projectId); filename = "architecture.mmd"; }
      else { data = await exportPpt(projectId); filename = "slides.md"; }

      const blob = new Blob([data.content], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      toast({ title: `${filename} exported!` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleGenerateByLabel = async (label: string) => {
    if (!projectId) return;
    setGenerating(label);
    try {
      const card = await generateCardByLabel(projectId, label);
      toast({ title: `Card generated: ${card.title}` });
      loadCards();
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const handleAutoGenerate = async () => {
    if (!projectId) return;
    setGenerating("auto");
    try {
      const result = await autoGenerateCards(projectId);
      setAutoGenResult(result.message);
      toast({ title: "Auto-generation complete", description: result.message });
      loadCards();
    } catch (err: any) {
      toast({ title: "Auto-generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const handleRefresh = async (cardId: string) => {
    if (!projectId) return;
    setGenerating(cardId);
    try {
      const card = await refreshCard(projectId, cardId);
      toast({ title: `Refreshed: ${card.title}` });
      loadCards();
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const handleApplyKG = async (cardId: string) => {
    if (!projectId) return;
    setGenerating(`kg-${cardId}`);
    try {
      const result = await applyKGUpdates(projectId, cardId);
      toast({ title: "KG Updated", description: `+${result.added} / -${result.removed} nodes` });
      loadCards();
    } catch (err: any) {
      toast({ title: "KG update failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  // Group cards by label for the version history view
  const getVersionChain = (card: any) => {
    return cards
      .filter((c) => c.label === card.label)
      .sort((a, b) => b.version - a.version);
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-full max-w-6xl mx-auto w-full gap-6 pb-12">
        {/* Header */}
        <div className="bg-card/40 border border-border p-6 rounded-2xl backdrop-blur-md">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-peach to-neon-violet flex items-center justify-center">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold gradient-text">Temporal Cards</h1>
                <p className="text-muted-foreground text-sm">
                  AI-generated project updates • Auto-expires every 3 days • Powered by Llama 405B
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                onClick={handleAutoGenerate}
                disabled={!!generating}
                className="bg-gradient-to-r from-neon-violet to-neon-peach hover:opacity-90"
              >
                {generating === "auto" ? <LoadingSpinner size="sm" className="mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                Auto-Generate
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("readme")} disabled={!!exporting}>
                {exporting === "readme" ? <LoadingSpinner size="sm" className="mr-2" /> : <FileCode className="w-4 h-4 mr-2 text-neon-blue" />}
                README
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("uml")} disabled={!!exporting}>
                {exporting === "uml" ? <LoadingSpinner size="sm" className="mr-2" /> : <FileImage className="w-4 h-4 mr-2 text-neon-green" />}
                UML
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("ppt")} disabled={!!exporting}>
                {exporting === "ppt" ? <LoadingSpinner size="sm" className="mr-2" /> : <Presentation className="w-4 h-4 mr-2 text-neon-peach" />}
                PPT
              </Button>
            </div>
          </div>

          {autoGenResult && (
            <div className="mt-4 p-3 rounded-lg bg-neon-violet/10 border border-neon-violet/30 text-sm text-neon-violet">
              ⏰ {autoGenResult}
            </div>
          )}
        </div>

        {/* Label Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {LABELS.map((l) => {
            const Icon = l.icon;
            const isActive = activeLabel === l.key;
            return (
              <button
                key={l.key}
                onClick={() => setActiveLabel(l.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
                  isActive
                    ? `bg-gradient-to-r ${l.color} text-white border-transparent shadow-lg`
                    : "bg-card/50 text-muted-foreground border-border hover:border-muted-foreground/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {l.name}
              </button>
            );
          })}
        </div>

        {/* Generate by Label (when a specific label is selected) */}
        {activeLabel !== "all" && (
          <div className="flex items-center gap-3 px-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateByLabel(activeLabel)}
              disabled={!!generating}
              className="border-dashed"
            >
              {generating === activeLabel ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <Brain className="w-4 h-4 mr-2 text-neon-violet" />
              )}
              Generate New {activeLabel.charAt(0).toUpperCase() + activeLabel.slice(1)} Card
            </Button>
            <span className="text-xs text-muted-foreground">
              Uses all project messages since the last {activeLabel} card
            </span>
          </div>
        )}

        {/* Cards Grid */}
        {isLoading ? (
          <div className="py-20 flex justify-center">
            <LoadingSpinner text="Loading cards..." />
          </div>
        ) : cards.length === 0 ? (
          <div className="bg-card/30 border border-dashed border-border p-12 rounded-2xl flex flex-col items-center text-center">
            <Layers className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Cards Generated</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              {activeLabel === "all"
                ? "Click 'Auto-Generate' to create your first AI summary card from project chats."
                : `No "${activeLabel}" cards yet. Click the button above to generate one.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((card) => {
              const timeLeft = card.expiresAt ? getTimeLeft(card.expiresAt) : null;
              const isExpired = card.expired;
              const isExpanded = expandedCard === card._id;
              const labelStyle = LABEL_BADGE[card.label] || LABEL_BADGE.general;
              const versionChain = isExpanded ? getVersionChain(card) : [];

              return (
                <div
                  key={card._id}
                  className={`bg-card/50 border rounded-xl overflow-hidden transition-all duration-200 flex flex-col ${
                    isExpired
                      ? "border-orange-500/30 opacity-75"
                      : "border-border hover:border-neon-violet/50"
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-5 flex-1">
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <h3 className="text-lg font-bold text-slate-100 leading-tight flex-1">
                        {card.title}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${labelStyle}`}>
                          {(card.label || "general").toUpperCase()}
                        </span>
                        {card.version > 1 && (
                          <span className="bg-neon-violet/10 text-neon-violet text-[10px] font-bold px-2 py-0.5 rounded-full">
                            v{card.version}
                          </span>
                        )}
                        <span className="bg-card text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-full border border-border">
                          #{card.chainIndex + 1}
                        </span>
                      </div>
                    </div>

                    <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                      {card.summary}
                    </p>

                    {card.keyChanges && card.keyChanges.length > 0 && (
                      <div className="bg-background/50 rounded-lg p-3 border border-border/50 mb-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Key Changes
                        </p>
                        <ul className="space-y-1">
                          {card.keyChanges.map((change: string, i: number) => (
                            <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                              <span className="text-neon-violet mt-0.5">•</span>
                              {change}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Expiry / Status indicator */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isExpired ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30">
                          <Archive className="w-3 h-3" /> EXPIRED
                        </span>
                      ) : timeLeft ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          <Clock className="w-3 h-3" /> {timeLeft}
                        </span>
                      ) : null}

                      {card.kgUpdated && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <GitBranch className="w-3 h-3" /> KG Updated
                        </span>
                      )}

                      {card.sourceType && card.sourceType !== "delta" && (
                        <span className="text-[10px] text-muted-foreground">
                          via {card.sourceType}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="px-5 py-3 border-t border-border bg-background/30 flex items-center justify-between gap-2">
                    <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                      <span>{new Date(card.createdAt).toLocaleDateString()}</span>
                      {card.sourceChatIds?.length > 0 && (
                        <span>{card.sourceChatIds.length} chat{card.sourceChatIds.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>

                    <div className="flex gap-1">
                      {isExpired && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefresh(card._id)}
                          disabled={!!generating}
                          className="h-7 text-[11px] px-2"
                        >
                          {generating === card._id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                            </>
                          )}
                        </Button>
                      )}

                      {!card.kgUpdated && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApplyKG(card._id)}
                          disabled={!!generating}
                          className="h-7 text-[11px] px-2"
                        >
                          {generating === `kg-${card._id}` ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <>
                              <Brain className="w-3 h-3 mr-1" /> Update KG
                            </>
                          )}
                        </Button>
                      )}

                      {card.version > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedCard(isExpanded ? null : card._id)}
                          className="h-7 text-[11px] px-2"
                        >
                          <GitBranch className="w-3 h-3 mr-1" />
                          {isExpanded ? "Hide" : `${card.version} versions`}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Version History (expanded) */}
                  {isExpanded && versionChain.length > 1 && (
                    <div className="border-t border-border bg-background/20 px-5 py-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Version History ({card.label})
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {versionChain.map((v) => (
                          <div
                            key={v._id}
                            className={`text-xs p-2 rounded-lg border ${
                              v._id === card._id
                                ? "border-neon-violet/40 bg-neon-violet/5"
                                : "border-border/50 bg-background/30"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-slate-300">
                                v{v.version}: {v.title}
                              </span>
                              <span className="text-muted-foreground">
                                {new Date(v.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-muted-foreground mt-1 line-clamp-2">
                              {v.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
