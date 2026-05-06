import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { getDeltas, computeDelta, generateTemporalCard } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Activity, Plus, Minus, Zap, RefreshCcw, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DeltaTimelinePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [deltas, setDeltas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isComputing, setIsComputing] = useState(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState<string | null>(null);

  const loadDeltas = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const data = await getDeltas(projectId);
      setDeltas(data);
    } catch (err) {
      toast({ title: "Failed to load deltas", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    loadDeltas();
  }, [loadDeltas]);

  const handleComputeDelta = async () => {
    if (!projectId) return;
    setIsComputing(true);
    try {
      await computeDelta(projectId);
      toast({ title: "Delta computed successfully" });
      loadDeltas();
    } catch (err) {
      toast({ title: "Failed to compute delta", variant: "destructive" });
    } finally {
      setIsComputing(false);
    }
  };

  const handleGenerateCard = async (deltaId: string) => {
    if (!projectId) return;
    setIsGeneratingCard(deltaId);
    try {
      await generateTemporalCard(projectId);
      toast({ title: "Temporal Card generated successfully!" });
      navigate(`/projects/${projectId}/cards`);
    } catch (err: any) {
      toast({ title: err.message || "Failed to generate card", variant: "destructive" });
    } finally {
      setIsGeneratingCard(null);
    }
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-full max-w-4xl mx-auto w-full gap-6 pb-12">
        {/* Header */}
        <div className="flex justify-between items-center bg-card/40 border border-border p-6 rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-blue to-neon-violet flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">Graph Delta Engine</h1>
              <p className="text-muted-foreground">Track knowledge evolution over time (3-day windows)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={loadDeltas} disabled={isLoading}>
              <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Reload
            </Button>
            <Button variant="neon" onClick={handleComputeDelta} disabled={isComputing}>
              <Zap className="w-4 h-4 mr-2" /> Compute Diff Now
            </Button>
          </div>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="py-20 flex justify-center">
            <LoadingSpinner text="Loading deltas..." />
          </div>
        ) : deltas.length === 0 ? (
          <div className="bg-card/30 border border-dashed border-border p-12 rounded-2xl flex flex-col items-center text-center">
            <Activity className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Deltas Computed</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Trigger a delta computation to capture the differences in the knowledge graph since the last snapshot.
            </p>
            <Button variant="neon" onClick={handleComputeDelta}>Compute First Delta</Button>
          </div>
        ) : (
          <div className="relative pl-8 border-l-2 border-border/50 ml-4 space-y-10">
            {deltas.map((delta, index) => {
              const isLatest = index === 0;
              const hasChanges = delta.totalAdded > 0 || delta.totalRemoved > 0;
              
              return (
                <div key={delta._id} className="relative">
                  {/* Timeline Node */}
                  <div className={`absolute -left-[41px] w-5 h-5 rounded-full border-4 border-background ${isLatest ? 'bg-neon-cyan' : 'bg-muted-foreground'}`}></div>
                  
                  <div className={`bg-card/60 border p-5 rounded-xl backdrop-blur-sm transition-all hover:border-neon-cyan/50 ${isLatest ? 'border-neon-cyan/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'border-border'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold">Diff Computation</h3>
                          {isLatest && <span className="bg-neon-cyan/20 text-neon-cyan text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Latest</span>}
                        </div>
                        <p className="text-sm text-muted-foreground">{new Date(delta.computedAt).toLocaleString()}</p>
                      </div>
                      
                      {hasChanges && isLatest && (
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="bg-neon-violet/10 hover:bg-neon-violet/20 text-neon-violet border border-neon-violet/30"
                          onClick={() => handleGenerateCard(delta._id)}
                          disabled={isGeneratingCard !== null}
                        >
                          {isGeneratingCard === delta._id ? (
                            <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="w-4 h-4 mr-2" />
                          )}
                          Generate AI Card
                        </Button>
                      )}
                    </div>

                    {!hasChanges ? (
                      <div className="bg-background/50 p-4 rounded-lg text-center text-muted-foreground text-sm border border-border/50">
                        No structural changes detected in the Knowledge Graph during this period.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {/* Added Column */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-neon-green mb-2">
                            <Plus className="w-4 h-4" />
                            <span className="font-medium text-sm tracking-wide uppercase">Added ({delta.totalAdded})</span>
                          </div>
                          
                          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 space-y-2 max-h-[250px] overflow-y-auto">
                            {delta.addedNodes?.map((n: any, i: number) => (
                              <div key={`n-${i}`} className="text-xs">
                                <span className="text-green-400 font-medium mr-2">[{n.section}]</span>
                                <span className="text-slate-300">{n.content}</span>
                              </div>
                            ))}
                            {delta.addedEdges?.map((e: any, i: number) => (
                              <div key={`e-${i}`} className="text-xs">
                                <span className="text-green-400 font-medium mr-2">[{e.relation}]</span>
                                <span className="text-slate-400 opacity-80">{e.fromNodeId} → {e.toNodeId}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Removed Column */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-neon-peach mb-2">
                            <Minus className="w-4 h-4" />
                            <span className="font-medium text-sm tracking-wide uppercase">Removed ({delta.totalRemoved})</span>
                          </div>
                          
                          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 space-y-2 max-h-[250px] overflow-y-auto">
                            {delta.removedNodes?.map((n: any, i: number) => (
                              <div key={`n-${i}`} className="text-xs">
                                <span className="text-red-400 font-medium mr-2">[{n.section}]</span>
                                <span className="text-slate-300 line-through opacity-70">{n.content}</span>
                              </div>
                            ))}
                            {delta.removedEdges?.map((e: any, i: number) => (
                              <div key={`e-${i}`} className="text-xs">
                                <span className="text-red-400 font-medium mr-2">[{e.relation}]</span>
                                <span className="text-slate-400 line-through opacity-60">{e.fromNodeId} → {e.toNodeId}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
