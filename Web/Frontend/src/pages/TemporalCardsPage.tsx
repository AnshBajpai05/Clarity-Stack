import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  getTemporalCards,
  getCardsByLabel,
  getExpiredCards,
  generateCardByLabel,
  autoGenerateCards,
  applyKGUpdates,
  deleteTemporalCard,
  exportReadme,
  exportUml,
  exportPpt,
} from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import {
  Layers, FileCode, FileImage, Presentation,
  RefreshCw, Clock, GitBranch, Brain, Zap,
  AlertTriangle, CheckCircle, Archive, Tag, Trash2, ArrowLeft, Network
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGenerationStore } from "@/store/generationStore";

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

export default function TemporalCardsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [cards, setCards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState("all");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [autoGenResult, setAutoGenResult] = useState<string | null>(null);
  const { setLoading, isGenerating, getStatus } = useGenerationStore();

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
    const key = `gen-${label}`;
    setLoading(key, true, "Generating...");
    try {
      const card = await generateCardByLabel(projectId, label);
      toast({ title: `Card generated: ${card.title}` });
      loadCards();
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(key, false);
    }
  };

  const handleAutoGenerate = async () => {
    if (!projectId) return;
    setLoading(projectId, true, "Analyzing chats...");
    try {
      const result = await autoGenerateCards(projectId);
      setAutoGenResult(result.message);
      toast({ title: "Auto-generation complete", description: result.message });
      loadCards();
    } catch (err: any) {
      toast({ title: "Auto-gen failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(projectId, false);
    }
  };

  const handleApplyKG = async (cardId: string) => {
    if (!projectId) return;
    const key = `kg-${cardId}`;
    setLoading(key, true, "Updating KG...");
    try {
      const result = await applyKGUpdates(projectId, cardId);
      toast({ title: "KG Updated", description: `+${result.added} nodes / +${result.addedEdges} edges` });
      loadCards();
    } catch (err: any) {
      toast({ title: "KG update failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(key, false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!window.confirm("Are you sure you want to delete this card? This action cannot be undone.")) {
      return;
    }

    const key = `delete-${cardId}`;
    setLoading(key, true, "Deleting...");
    try {
      await deleteTemporalCard(cardId);
      toast({ title: "Card deleted" });
      loadCards();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(key, false);
    }
  };

  const handleForceGenerate = async () => {
    if (!projectId) return;
    setLoading(projectId, true, "Generating...");
    try {
      const result = await autoGenerateCards(projectId, true);
      setAutoGenResult(result.message);
      toast({ title: "Forced generation complete", description: result.message });
      loadCards();
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(projectId, false);
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
      <div className="flex flex-col min-h-0 max-w-6xl mx-auto w-full gap-6 pb-20 overflow-y-visible">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4 glass-panel p-6 rounded-3xl mb-2 relative animate-fade-in-up">
          {/* Back button */}
          <div className="absolute left-6 top-6">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate(`/projects/${projectId}/chats`)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neon-peach via-neon-violet to-neon-cyan p-[1px] shadow-glow-sm">
              <div className="w-full h-full rounded-[15px] bg-background flex items-center justify-center">
                <Layers className="w-7 h-7 text-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-display font-extrabold tracking-tight gradient-text">Temporal Cards</h1>
              <p className="text-muted-foreground text-sm mt-1 max-w-lg leading-relaxed">
                AI-synthesized project evolution checkpoints.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Button
              variant="default"
              size="sm"
              onClick={handleAutoGenerate}
              disabled={projectId ? isGenerating(projectId) : false}
              className="bg-gradient-to-r from-neon-violet to-neon-peach hover:opacity-90 min-w-[150px] h-9 shadow-lg shadow-neon-violet/20"
            >
              {projectId && isGenerating(projectId) ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-2" />
              )}
              {projectId && isGenerating(projectId) ? getStatus(projectId) : "Auto-Generate"}
            </Button>

            <div className="h-5 w-px bg-border/50 mx-1" />

            <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50">
              <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] font-bold" onClick={() => handleExport("readme")} disabled={!!exporting}>
                {exporting === "readme" ? <LoadingSpinner size="sm" /> : <FileCode className="w-3 h-3 mr-1.5 text-neon-cyan" />}
                README
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] font-bold" onClick={() => handleExport("uml")} disabled={!!exporting}>
                {exporting === "uml" ? <LoadingSpinner size="sm" /> : <FileImage className="w-3 h-3 mr-1.5 text-neon-mint" />}
                UML
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] font-bold" onClick={() => handleExport("ppt")} disabled={!!exporting}>
                {exporting === "ppt" ? <LoadingSpinner size="sm" /> : <Presentation className="w-3 h-3 mr-1.5 text-neon-peach" />}
                PPT
              </Button>
            </div>
          </div>
        </div>

        {/* Label Filter Tabs - Segmented Control Style */}
        <div className="sticky top-0 z-10 py-4 bg-background/80 backdrop-blur-md -mx-4 px-4 border-b border-border/10">
          <div className="flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-2xl border border-white/5 shadow-2xl overflow-x-auto no-scrollbar">
            {LABELS.map((l) => {
              const Icon = l.icon;
              const isActive = activeLabel === l.key;
              return (
                <button
                  key={l.key}
                  onClick={() => setActiveLabel(l.key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? `bg-gradient-to-r ${l.color} text-white shadow-glow-sm scale-[1.02]`
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate by Label (when a specific label is selected) */}
        {activeLabel !== "all" && (
          <div className="flex items-center gap-3 px-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateByLabel(activeLabel)}
              disabled={isGenerating(`gen-${activeLabel}`)}
              className="border-dashed"
            >
              {isGenerating(`gen-${activeLabel}`) ? (
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
            <p className="text-muted-foreground mb-6 max-w-md">
              {activeLabel === "all"
                ? "Click 'Auto-Generate' to create your first AI summary card from project chats."
                : `No "${activeLabel}" cards yet. Click the button above to generate one.`}
            </p>
            {activeLabel === "all" && (
              <Button
                variant="outline"
                onClick={handleForceGenerate}
                disabled={projectId ? isGenerating(projectId) : false}
                className="border-neon-violet text-neon-violet hover:bg-neon-violet/10"
              >
                {projectId && isGenerating(projectId) ? <LoadingSpinner size="sm" className="mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
                {projectId && isGenerating(projectId) ? getStatus(projectId) : "Force Generate from History"}
              </Button>
            )}
          </div>
        ) : (
          <div data-tour="cards-deck" className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((card, index) => {
              const isExpanded = expandedCard === card._id;
              const labelStyle = LABEL_BADGE[card.label] || LABEL_BADGE.general;
              const versionChain = isExpanded ? getVersionChain(card) : [];
              // §16.4: a card has a real KG diff waiting to be committed (not yet flushed).
              const hasPendingKG = !card.kgUpdated && ((card.kgDiff?.add?.length ?? 0) > 0);
              const sourceChatId = card.sourceChatIds?.[0];

              return (
                <div
                  key={card._id}
                  onClick={() => setExpandedCard(expandedCard === card._id ? null : card._id)}
                  className={`group glass-panel-hover overflow-hidden flex flex-col cursor-pointer animate-fade-in-up stagger-${(index % 5) + 1}`}
                >
                  {/* Card Badge Top-Bar */}
                  <div className="px-5 py-3 bg-muted/20 border-b border-border/30 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md border uppercase ${LABEL_BADGE[card.category || card.label || 'general'] || LABEL_BADGE.general}`}>
                        {card.category || card.label || "general"}
                      </span>
                      {(card.version > 1 || card.version === 0) && (
                        <span className="bg-neon-violet/15 text-neon-violet text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md border border-neon-violet/30">
                          V{card.version || 0}
                        </span>
                      )}
                      {hasPendingKG && (
                        <span className="flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md border border-amber-500/30 uppercase">
                          <Brain className="w-2.5 h-2.5" /> KG Pending
                        </span>
                      )}
                      {card.kgUpdated && (
                        <span className="flex items-center gap-1 bg-green-500/15 text-green-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-md border border-green-500/30 uppercase">
                          <CheckCircle className="w-2.5 h-2.5" /> In KG
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground opacity-50">
                      ID: {card._id.slice(-8)}
                    </span>
                  </div>

                  <div className="p-6 flex-1 flex flex-col gap-4">
                    <h3 className="text-xl font-display font-bold text-foreground leading-tight group-hover:text-neon-violet transition-colors">
                      {card.title}
                    </h3>

                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                      {card.summary}
                    </p>

                    {card.keyChanges && card.keyChanges.length > 0 && (
                      <div className="mt-2 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-border/40" />
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Key Impacts</span>
                          <div className="h-px flex-1 bg-border/40" />
                        </div>
                        <ul className="grid grid-cols-1 gap-2">
                          {card.keyChanges.map((change: string, i: number) => (
                            <li key={i} className="text-xs text-slate-300 flex items-start gap-3 bg-white/5 p-2 rounded-lg border border-white/5">
                              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-neon-violet mt-1.5" />
                              {change}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/30">
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {new Date(card.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        {card.sourceChatIds?.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Layers className="w-3 h-3" />
                            {card.sourceChatIds.length} Sources
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {hasPendingKG && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleApplyKG(card._id); }}
                            disabled={isGenerating(`kg-${card._id}`)}
                            className="h-8 text-[11px] px-3 border-neon-violet/30 hover:border-neon-violet text-neon-violet bg-neon-violet/5"
                          >
                            {isGenerating(`kg-${card._id}`) ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <>
                                <Brain className="w-3.5 h-3.5 mr-1.5" /> Commit to KG
                              </>
                            )}
                          </Button>
                        )}
                        {sourceChatId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); navigate(`/projects/${projectId}/kg?chat=${sourceChatId}`); }}
                            title="See where this card's knowledge lives in the Knowledge Graph"
                            className="h-8 text-[11px] px-3 text-muted-foreground hover:text-neon-violet hover:bg-neon-violet/5"
                          >
                            <Network className="w-3.5 h-3.5 mr-1.5" /> View in Graph
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCard(card._id)}
                          disabled={isGenerating(`delete-${card._id}`)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                        >
                          {isGenerating(`delete-${card._id}`) ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
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
