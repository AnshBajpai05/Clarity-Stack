import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import ForceGraph2D from "react-force-graph-2d";
import {
  getKnowledgeGraph,
  snapshotKnowledgeGraph,
  getKnowledgeGraphFocus,
} from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Maximize, ZoomIn, Target, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SECTION_COLORS: Record<string, string> = {
  FACT: "#22c55e",       // Green
  DECISION: "#8b5cf6",   // Violet
  CONFLICT: "#ef4444",   // Red
  OPTION: "#3b82f6",     // Blue
  UNKNOWN: "#f59e0b",    // Amber
  ASSUMPTION: "#06b6d4", // Cyan
  CONSTRAINT: "#ec4899", // Pink
  CONFIDENCE: "#eab308", // Yellow
};

export default function KnowledgeGraphPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [focusNode, setFocusNode] = useState<any | null>(null);
  
  const fgRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight,
      });
    }
    
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadGraph = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const data = await getKnowledgeGraph(projectId);
      
      const nodes = data.nodes.map((n: any) => ({
        id: n.nodeId,
        name: n.content,
        group: n.section,
        val: n.section === "DECISION" ? 20 : 10,
        ...n
      }));

      const links = data.edges.map((e: any) => ({
        source: e.fromNodeId,
        target: e.toNodeId,
        label: e.relation,
      }));

      setGraphData({ nodes, links });
      setFocusNode(null);
    } catch (err) {
      toast({ title: "Failed to load graph", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const handleSnapshot = async () => {
    if (!projectId) return;
    setIsSnapshotting(true);
    try {
      await snapshotKnowledgeGraph(projectId);
      toast({ title: "Snapshot generated successfully" });
      loadGraph();
    } catch (err) {
      toast({ title: "Failed to generate snapshot", variant: "destructive" });
    } finally {
      setIsSnapshotting(false);
    }
  };

  const handleNodeClick = async (node: any) => {
    if (!projectId) return;
    
    if (focusNode?.id === node.id) {
      // Unfocus
      setFocusNode(null);
      loadGraph();
      return;
    }

    setFocusNode(node);
    
    // Zoom to node
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(2, 2000);
    }

    // Fetch focus subgraph
    try {
      const data = await getKnowledgeGraphFocus(projectId, node.id);
      
      const nodes = data.nodes.map((n: any) => ({
        id: n.nodeId,
        name: n.content,
        group: n.section,
        val: n.id === node.id ? 25 : 10,
        ...n
      }));

      const links = data.edges.map((e: any) => ({
        source: e.fromNodeId,
        target: e.toNodeId,
        label: e.relation,
      }));

      setGraphData({ nodes, links });
    } catch (err) {
      toast({ title: "Failed to focus node", variant: "destructive" });
    }
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-full gap-4">
        {/* Header */}
        <div className="flex justify-between items-center bg-card/40 border border-border p-4 rounded-xl backdrop-blur-md">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Knowledge Graph</h1>
            <p className="text-muted-foreground text-sm">Visual representation of project intelligence</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => loadGraph()} disabled={isLoading}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Reload
            </Button>
            <Button variant="neon" onClick={handleSnapshot} disabled={isSnapshotting}>
              <Target className="w-4 h-4 mr-2" /> Trigger Snapshot
            </Button>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex gap-4 flex-1 min-h-0">
          
          {/* Main Graph Area */}
          <div 
            ref={containerRef} 
            className="flex-1 bg-background/50 border border-border rounded-xl relative overflow-hidden"
          >
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner text="Loading Graph Data..." />
              </div>
            ) : graphData.nodes.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Info className="w-12 h-12 mb-4 opacity-50" />
                <p>No Knowledge Graph data found.</p>
                <p className="text-sm">Trigger a snapshot to build the graph.</p>
              </div>
            ) : (
              <ForceGraph2D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                nodeColor={(node: any) => SECTION_COLORS[node.group] || "#888"}
                nodeRelSize={6}
                linkColor={() => "#4b5563"} // gray-600
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                onNodeClick={handleNodeClick}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                  const label = node.name.length > 20 ? node.name.substring(0, 20) + "..." : node.name;
                  const fontSize = 12 / globalScale;
                  ctx.font = `${fontSize}px Sans-Serif`;
                  const textWidth = ctx.measureText(label).width;
                  const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); 

                  ctx.fillStyle = "rgba(15, 15, 35, 0.8)";
                  ctx.fillRect(
                    node.x - bckgDimensions[0] / 2, 
                    node.y - bckgDimensions[1] / 2 - 10, 
                    bckgDimensions[0], 
                    bckgDimensions[1]
                  );

                  ctx.textAlign = "center";
                  ctx.textBaseline = "middle";
                  ctx.fillStyle = SECTION_COLORS[node.group] || "#fff";
                  ctx.fillText(label, node.x, node.y - 10);
                  
                  // Draw Node
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, node.val / 2, 0, 2 * Math.PI, false);
                  ctx.fillStyle = node.id === focusNode?.id ? "#fff" : (SECTION_COLORS[node.group] || "#888");
                  ctx.fill();
                  
                  if (node.id === focusNode?.id) {
                    ctx.strokeStyle = SECTION_COLORS[node.group];
                    ctx.lineWidth = 2;
                    ctx.stroke();
                  }
                }}
                linkCanvasObjectMode={() => "after"}
                linkCanvasObject={(link: any, ctx, globalScale) => {
                  const MAX_FONT_SIZE = 4;
                  const LABEL_NODE_MARGIN = 6;
                  
                  const start = link.source;
                  const end = link.target;

                  // ignore unbound links
                  if (typeof start !== 'object' || typeof end !== 'object') return;

                  // calculate label positioning
                  const textPos = Object.assign({}, ...['x', 'y'].map(c => ({
                    [c]: start[c] + (end[c] - start[c]) / 2 // calc middle point
                  })));

                  const relLink = { x: end.x - start.x, y: end.y - start.y };
                  let textAngle = Math.atan2(relLink.y, relLink.x);
                  // maintain label vertical orientation for legibility
                  if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
                  if (textAngle < -Math.PI / 2) textAngle = -(-Math.PI - textAngle);

                  const label = link.label;

                  // estimate fontSize to fit in link length
                  ctx.font = '1px Sans-Serif';
                  const fontSize = Math.min(MAX_FONT_SIZE, (Math.sqrt(Math.pow(relLink.x, 2) + Math.pow(relLink.y, 2)) - LABEL_NODE_MARGIN * 2) / ctx.measureText(label).width);

                  ctx.font = `${fontSize}px Sans-Serif`;
                  const textWidth = ctx.measureText(label).width;
                  const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // some padding

                  ctx.save();
                  ctx.translate(textPos.x, textPos.y);
                  ctx.rotate(textAngle);

                  ctx.fillStyle = 'rgba(15, 15, 35, 0.8)';
                  ctx.fillRect(- bckgDimensions[0] / 2, - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = '#9ca3af'; // gray-400
                  ctx.fillText(label, 0, 0);
                  ctx.restore();
                }}
              />
            )}
            
            {/* Focus Mode Overlay Indicator */}
            {focusNode && (
              <div className="absolute top-4 left-4 bg-background/80 border border-neon-violet px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md animate-fade-in">
                <span className="w-2 h-2 rounded-full bg-neon-violet animate-pulse"></span>
                <span className="text-sm font-medium text-neon-violet">Focus Mode Active</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 ml-2 hover:bg-neon-violet/20" onClick={() => loadGraph()}>
                  Clear
                </Button>
              </div>
            )}
            
            {/* Legend Overlay */}
            <div className="absolute bottom-4 left-4 bg-card/80 border border-border p-3 rounded-lg backdrop-blur-md">
              <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">Legend</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(SECTION_COLORS).map(([key, color]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
                    <span className="text-xs">{key}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Node Details Sidebar */}
          <div className="w-80 bg-card/40 border border-border rounded-xl p-4 flex flex-col backdrop-blur-md overflow-y-auto">
            {focusNode ? (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <span 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: SECTION_COLORS[focusNode.group] || "#888" }}
                  />
                  <h3 className="font-semibold text-lg">{focusNode.group}</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-medium">Content</p>
                    <p className="bg-background/50 p-3 rounded-lg text-sm border border-border">
                      {focusNode.name}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-background/50 p-3 rounded-lg border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                      <p className="font-medium text-neon-cyan">{focusNode.confidence || "N/A"}</p>
                    </div>
                    <div className="bg-background/50 p-3 rounded-lg border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Connections</p>
                      <p className="font-medium">{graphData.links.length}</p>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground mb-2 font-medium">Connected To:</p>
                    <div className="space-y-2">
                      {graphData.links.map((link: any, i) => (
                        <div key={i} className="text-xs bg-background/50 p-2 rounded border border-border flex justify-between">
                          <span className="text-muted-foreground">{link.label}</span>
                          <span className="truncate max-w-[150px] font-medium" title={link.target.name || link.target}>
                            {link.target.name || link.target}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-70">
                <Maximize className="w-10 h-10 mb-3" />
                <p className="text-sm text-center">Select a node to view details<br/>and enter Focus Mode</p>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </MainLayout>
  );
}
