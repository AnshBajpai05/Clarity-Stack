import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import ForceGraph2D from "react-force-graph-2d";
import { forceCollide } from "d3-force";
import { getProject, getChats } from "@/lib/api";
import { api } from "@/lib/http";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Info, ArrowLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, string> = {
  FACT:       "#22c55e",
  DECISION:   "#8b5cf6",
  CONFLICT:   "#ef4444",
  OPTION:     "#3b82f6",
  UNKNOWN:    "#f59e0b",
  ASSUMPTION: "#06b6d4",
  CONSTRAINT: "#ec4899",
  CONFIDENCE: "#eab308",
};

const LINK_COLORS = {
  CONTAINS: "rgba(139,92,246,0.6)",
  HAS_TYPE: "rgba(148,163,184,0.45)",
  MEMBER:   "rgba(75,85,99,0.5)",
};

function getLinkColor(label: string) {
  return LINK_COLORS[label as keyof typeof LINK_COLORS] ?? "rgba(100,116,139,0.4)";
}

// Position nodes in a fan arc around a centre point
function arcPositions(
  nodes: any[],
  cx: number,
  cy: number,
  radius: number,
  spread = Math.PI * 1.2,
  baseAngle = 0,
) {
  const count = nodes.length;
  nodes.forEach((n, i) => {
    // Only set position if not already set (e.g. from previous tick or saved state)
    if (n.x != null && n.y != null) return;

    const angle = count === 1
      ? baseAngle
      : baseAngle - spread / 2 + (i / (count - 1)) * spread;
    
    n.x = cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 8;
    n.y = cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 8;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkChat = searchParams.get("chat");   // §16.4: arrive from a card's "View in Graph"
  const { toast } = useToast();

  // Raw data
  const [rawKG, setRawKG] = useState<any>({ nodes: [], edges: [] });
  const [chats, setChats] = useState<any[]>([]);
  const [projectName, setProjectName] = useState("Project");
  // chatKGCache: stores per-chat reasoning data so we don't re-fetch on every render
  const chatKGCache = useRef<Record<string, any>>({});

  // Graph display state
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [expandedChats, setExpandedChats] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [focusNode, setFocusNode] = useState<any>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fgRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Keep a stable ref to current node positions so we can preserve them on rebuild
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // ── Resize ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadGraph = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [projectData, chatData] = await Promise.all([
        getProject(projectId),
        getChats(projectId),
      ]);
      setProjectName(projectData.name ?? "Project");
      setChats(chatData);
      // Reset state
      setRawKG({ nodes: [], edges: [] });
      chatKGCache.current = {};
      setExpandedChats(new Set());
      setExpandedTypes(new Set());
      setFocusNode(null);
      positionsRef.current = {};
      console.log("💬 Chats loaded:", chatData.map((c: any) => ({ id: c.id, title: c.title })));
    } catch (err) {
      console.error("Graph load error:", err);
      toast({ title: "Failed to load graph", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, toast]);

  // Fetch reasoning for a specific chat directly from Backend
  const fetchChatKG = useCallback(async (chatId: string) => {
    if (chatKGCache.current[chatId]) return; // already loaded
    chatKGCache.current[chatId] = 'loading';
    try {
      const data = await api<any>(`/api/reasoning/chat/${chatId}`);
      console.log(`🧠 Reasoning for chat ${chatId}:`, {
        decisions: data.decision?.length,
        supports: data.supports?.length,
        conflicts: data.conflicts?.length,
        others: data.others?.length,
      });

      // Map response to flat node list
      const newNodes: any[] = [];
      const mapGroup = (list: any[], sectionOverride?: string) => {
        (list || []).forEach((n: any) => {
          newNodes.push({
            nodeId: n.id,
            section: n.section || sectionOverride || 'UNKNOWN',
            content: n.content,
            confidence: n.confidence,
            chatId,
          });
        });
      };
      mapGroup(data.decision,    'DECISION');
      mapGroup(data.supports,    'FACT');
      mapGroup(data.conflicts,   'CONFLICT');
      mapGroup(data.blockers,    'UNKNOWN');
      mapGroup(data.alternatives,'OPTION');
      mapGroup(data.others);

      chatKGCache.current[chatId] = newNodes;

      // Merge into rawKG
      setRawKG((prev: any) => ({
        nodes: [
          ...(prev?.nodes ?? []).filter((n: any) => n.chatId !== chatId),
          ...newNodes,
        ],
        edges: prev?.edges ?? [],
      }));
    } catch (err) {
      console.error(`❌ Failed to fetch KG for chat ${chatId}:`, err);
      chatKGCache.current[chatId] = []; // mark as failed so we don't retry
    }
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Deep-link (§16.4): when navigated here from a card's "View in Graph", auto-expand that
  // card's source chat and fetch its KG so the user lands exactly where the card's knowledge
  // lives — same effect as clicking the chat node, but driven by the ?chat= param.
  useEffect(() => {
    if (!deepLinkChat || isLoading) return;
    if (!chats.some((c: any) => c.id === deepLinkChat)) return;
    if (expandedChats.has(deepLinkChat)) return;
    fetchChatKG(deepLinkChat);
    setExpandedChats(new Set([deepLinkChat]));
  }, [deepLinkChat, isLoading, chats, expandedChats, fetchChatKG]);

  // ── Build graph from state ─────────────────────────────────────────────────
  const buildGraph = useCallback(() => {
    // Snapshot current positions before rebuild
    graphData.nodes.forEach((n: any) => {
      if (n.x != null) positionsRef.current[n.id] = { x: n.x, y: n.y };
    });

    const nodes: any[] = [];
    const links: any[] = [];
    const saved = positionsRef.current;

    // ── Project (pinned) ─────────────────────────────────────────────────
    nodes.push({
      id: "project-root",
      name: projectName,
      group: "PROJECT",
      val: 42,
      fx: 0, fy: 0,
    });

    if (!chats.length) {
      setGraphData({ nodes, links });
      return;
    }

    // ── Chats ────────────────────────────────────────────────────────────
    const chatRadius = Math.max(220, chats.length * 45);

    const chatNodes = chats.map((c: any, i: number) => {
      // Use a stable angle (no random rotation) so nodes don't jump on re-render
      const defaultAngle = (i / chats.length) * 2 * Math.PI - Math.PI / 2;
      const pos = saved[`chat-${c.id}`];
      return {
        id: `chat-${c.id}`,
        chatId: c.id,
        name: c.title ?? `Chat ${i + 1}`,
        group: "CHAT",
        val: 28,
        x: pos?.x ?? Math.cos(defaultAngle) * chatRadius,
        y: pos?.y ?? Math.sin(defaultAngle) * chatRadius,
      };
    });

    chatNodes.forEach(n => {
      nodes.push(n);
      links.push({ source: "project-root", target: n.id, label: "CONTAINS" });
    });

    // ── Type groups for expanded chats ───────────────────────────────────
    expandedChats.forEach(cId => {
      const chatNode = chatNodes.find(n => n.chatId === cId);
      if (!chatNode) return;

      const angleToCenter = Math.atan2(chatNode.y - 0, chatNode.x - 0);

      // Aggregate KG nodes by section for this chat
      const bySection: Record<string, any[]> = {};
      if (rawKG?.nodes) {
        rawKG.nodes
          .filter((n: any) => n.chatId === cId)
          .forEach((n: any) => {
            const s = n.section ?? "UNKNOWN";
            (bySection[s] = bySection[s] ?? []).push(n);
          });
      }

      const sections = Object.keys(bySection);

      // If no KG data for this chat, show a placeholder so user knows it expanded
      if (!sections.length) {
        const placeholderId = `type-${cId}::NO_DATA`;
        const pos = saved[placeholderId];
        const placeholder = {
          id: placeholderId,
          typeKey: `${cId}::NO_DATA`,
          chatId: cId,
          section: "NO_DATA",
          name: "No Intelligence Yet",
          count: 0,
          group: "TYPE_GROUP",
          val: 12,
          x: pos?.x ?? chatNode.x + Math.cos(angleToCenter + Math.PI) * 140,
          y: pos?.y ?? chatNode.y + Math.sin(angleToCenter + Math.PI) * 140,
        };
        nodes.push(placeholder);
        links.push({ source: `chat-${cId}`, target: placeholderId, label: "HAS_TYPE" });
        return;
      }

      const typeNodes = sections.map((sec) => {
        const typeKey = `${cId}::${sec}`;
        const nodeId = `type-${typeKey}`;
        const pos = saved[nodeId];
        return {
          id: nodeId,
          typeKey,
          chatId: cId,
          section: sec,
          name: sec,
          count: bySection[sec].length,
          group: "TYPE_GROUP",
          val: 16,
          x: pos?.x,
          y: pos?.y,
        };
      });

      // Pre-position only unplaced nodes
      // Pre-position only unplaced nodes
      if (typeNodes.some(n => n.x == null)) {
        arcPositions(typeNodes, chatNode.x, chatNode.y, 140, Math.PI * 0.85, angleToCenter);
      }

      typeNodes.forEach(n => {
        nodes.push(n);
        links.push({ source: `chat-${cId}`, target: n.id, label: "HAS_TYPE" });
      });

      // ── KG nodes for expanded type groups ─────────────────────────────
      expandedTypes.forEach(typeKey => {
        if (!typeKey.startsWith(cId + "::")) return;
        const sec = typeKey.split("::")[1];
        const typeGroupNode = typeNodes.find(n => n.section === sec);
        if (!typeGroupNode) return;

        const kgNodes = (bySection[sec] ?? []).map((n: any) => {
          const nodeId = `kg-${n.nodeId}`;
          const pos = saved[nodeId];
          return {
            id: nodeId,
            nodeId: n.nodeId,
            name: n.content,
            section: sec,
            group: "KG_NODE",
            val: 8,
            chatId: cId,
            confidence: n.confidence,
            x: pos?.x,
            y: pos?.y,
          };
        });

        // Pre-position only unplaced nodes
        if (kgNodes.some(n => n.x == null)) {
          const angleAway = Math.atan2(
            typeGroupNode.y! - chatNode.y,
            typeGroupNode.x! - chatNode.x,
          );
          arcPositions(kgNodes, typeGroupNode.x!, typeGroupNode.y!, 110, Math.PI * 1.1, angleAway);
        }

        kgNodes.forEach(n => {
          nodes.push(n);
          links.push({ source: typeGroupNode.id, target: n.id, label: "MEMBER" });
        });
      });
    });

    setGraphData({ nodes, links });
  }, [chats, rawKG, expandedChats, expandedTypes, projectName]);

  useEffect(() => { buildGraph(); }, [buildGraph]);

  // ── Forces ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    fg.d3Force("charge").strength((n: any) => {
      if (n.group === "PROJECT")    return -900;
      if (n.group === "CHAT")       return -450;
      if (n.group === "TYPE_GROUP") return -250;
      return -130;
    });

    fg.d3Force("link")
      .distance((l: any) => {
        if (l.label === "CONTAINS") return 230;
        if (l.label === "HAS_TYPE") return 130;
        return 90;
      })
      .strength((l: any) => {
        if (l.label === "CONTAINS") return 0.5;
        if (l.label === "HAS_TYPE") return 0.75;
        return 0.7;
      });

    fg.d3Force(
      "collide",
      forceCollide((n: any) => {
        if (n.group === "PROJECT")    return 38;
        if (n.group === "CHAT")       return 22;
        if (n.group === "TYPE_GROUP") return 18;
        return 12;
      }).strength(0.85),
    );

    fg.d3ReheatSimulation();
  }, [graphData]);

  // ── Click handler ──────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((node: any) => {
    const fg = fgRef.current;

    if (node.group === "PROJECT") {
      fg?.centerAt(0, 0, 700);
      fg?.zoom(1.2, 800);
      setFocusNode(null);
      return;
    }

    if (node.group === "CHAT") {
      const next = new Set(expandedChats);
      if (next.has(node.chatId)) {
        next.delete(node.chatId);
        // Collapse children too
        const nextTypes = new Set(expandedTypes);
        [...nextTypes].filter(k => k.startsWith(node.chatId + "::")).forEach(k => nextTypes.delete(k));
        setExpandedTypes(nextTypes);
        fg?.centerAt(0, 0, 700);
        fg?.zoom(1.2, 800);
      } else {
        next.add(node.chatId);
        // Fetch intelligence data for this chat on first expand
        fetchChatKG(node.chatId);
        setTimeout(() => {
          fg?.centerAt(node.x, node.y, 700);
          fg?.zoom(1.8, 800);
        }, 100);
      }
      setExpandedChats(next);
      return;
    }

    if (node.group === "TYPE_GROUP") {
      const next = new Set(expandedTypes);
      next.has(node.typeKey) ? next.delete(node.typeKey) : next.add(node.typeKey);
      setExpandedTypes(next);
      fg?.centerAt(node.x, node.y, 700);
      return;
    }

    if (node.group === "KG_NODE") {
      const isAlready = focusNode?.id === node.id;
      setFocusNode(isAlready ? null : node);
      fg?.centerAt(node.x, node.y, 700);
      if (!isAlready) fg?.zoom(2.8, 800);
    }
  }, [expandedChats, expandedTypes, focusNode, fetchChatKG]);

  // ── Focused links ──────────────────────────────────────────────────────────
  const focusedLinks = useMemo(() => {
    if (!focusNode) return [];
    return graphData.links.filter((l: any) =>
      (l.source?.id ?? l.source) === focusNode.id ||
      (l.target?.id ?? l.target) === focusNode.id,
    );
  }, [focusNode, graphData.links]);

  // ── Node painter ───────────────────────────────────────────────────────────
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { x, y, group, name, section, count } = node;
    const isFocused  = focusNode?.id === node.id;
    const isExpanded =
      (group === "CHAT"       && expandedChats.has(node.chatId)) ||
      (group === "TYPE_GROUP" && expandedTypes.has(node.typeKey));

    const color =
      group === "PROJECT"    ? "#8b5cf6"
      : group === "CHAT"     ? (isExpanded ? "#ffffff" : "#94a3b8")
      : (SECTION_COLORS[section] ?? "#888");

    const r = Math.sqrt(node.val) * 3.5; // Boosted size

    // Pulse ring — project only
    if (group === "PROJECT") {
      const pulse = Math.sin(Date.now() / 600) * 6 + r + 5;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(139,92,246,0.15)";
      ctx.fill();
    }

    // Selection / expanded ring
    if (isFocused || isExpanded) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4 / globalScale, 0, 2 * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / globalScale;
      ctx.setLineDash([3 / globalScale, 2 / globalScale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = isFocused ? "#ffffff" : color;
    ctx.fill();

    if (group === "CHAT" || group === "TYPE_GROUP") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
    }

    // Labels
    const alwaysLabel = group === "PROJECT" || group === "CHAT" || group === "TYPE_GROUP";
    if (!alwaysLabel && globalScale < 1.4) return;

    const rawLabel = group === "TYPE_GROUP"
      ? `${section}  ·  ${count}`
      : name.length > 30 ? name.slice(0, 30) + "…" : name;

    // Fixed font sizes — readable at all zoom levels
    const fontSize =
      group === "PROJECT"      ? 14
      : group === "CHAT"       ? 13
      : group === "TYPE_GROUP" ? 13
      : 11;

    const isBold = group === "PROJECT" || group === "TYPE_GROUP";
    ctx.font = `${isBold ? "bold " : ""}${fontSize}px Inter, sans-serif`;
    const tw = ctx.measureText(rawLabel).width;
    const pad = 6;
    const bw = tw + pad * 2, bh = fontSize + pad * 1.6;
    const bx = x - bw / 2, by = y - r - bh - 4;

    // Pill background
    const br = bh / 2;
    ctx.fillStyle = "rgba(6,8,20,0.92)";
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, br);
    ctx.lineTo(bx + br, by + bh);
    ctx.arcTo(bx, by + bh, bx, by, br);
    ctx.lineTo(bx, by + br);
    ctx.arcTo(bx, by, bx + bw, by, br);
    ctx.closePath();
    ctx.fill();

    // Subtle border for TYPE_GROUP labels only
    if (group === "TYPE_GROUP") {
      ctx.strokeStyle = (SECTION_COLORS[section] ?? "#64748b") + "66"; // 40% opacity
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + br, by);
      ctx.lineTo(bx + bw - br, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, br);
      ctx.lineTo(bx + bw, by + bh - br);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, br);
      ctx.lineTo(bx + br, by + bh);
      ctx.arcTo(bx, by + bh, bx, by, br);
      ctx.lineTo(bx, by + br);
      ctx.arcTo(bx, by, bx + bw, by, br);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Always white text for maximum readability
    ctx.fillStyle = "#ffffff";
    ctx.fillText(rawLabel, x, by + bh / 2);
  }, [focusNode, expandedChats, expandedTypes, zoomLevel]);


  // ── Breadcrumb ─────────────────────────────────────────────────────────────
  const breadcrumb = useMemo(() => {
    const parts: string[] = [projectName];
    if (focusNode) {
      const chat = chats.find(c => c.id === focusNode.chatId);
      if (chat) parts.push(chat.title ?? chat.id);
      if (focusNode.section) parts.push(focusNode.section);
    }
    return parts;
  }, [focusNode, projectName, chats]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <MainLayout wide>
      <div className="flex flex-col h-full w-full gap-4 min-h-0 overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center glass-panel p-4 rounded-xl animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-display font-bold gradient-text tracking-tight">Knowledge Graph</h1>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 opacity-40" />}
                  <span className={i === breadcrumb.length - 1 ? "text-foreground font-medium" : ""}>{b}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(`/projects/${projectId}/chats`)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button variant="outline" onClick={loadGraph} disabled={isLoading}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Reload
            </Button>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Graph canvas */}
          <div ref={containerRef} data-tour="kg-canvas" className="flex-1 bg-background/50 border border-border rounded-xl relative overflow-hidden">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner text="Loading graph…" />
              </div>
            ) : graphData.nodes.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Info className="w-12 h-12 opacity-40" />
                <p className="text-sm">No knowledge yet — ask questions in this project's chats, then hit Reload.</p>
              </div>
            ) : (
              <ForceGraph2D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                cooldownTime={4500}
                warmupTicks={60}
                onZoom={({ k }) => setZoomLevel(k)}
                nodeCanvasObject={paintNode}
                nodeCanvasObjectMode={() => "replace"}
                linkColor={(l: any) => getLinkColor(l.label)}
                linkWidth={(l: any) =>
                  l.label === "CONTAINS" ? 2.5
                  : l.label === "HAS_TYPE" ? 1.5
                  : 1.0
                }
                linkDirectionalArrowLength={(l: any) => l.label === "MEMBER" ? 0 : 5}
                linkDirectionalArrowRelPos={1}
                linkDirectionalArrowColor={(l: any) => getLinkColor(l.label)}
                linkDirectionalParticles={(l: any) => l.label === "CONTAINS" ? 3 : 0}
                linkDirectionalParticleSpeed={0.006}
                linkDirectionalParticleWidth={2.5}
                linkDirectionalParticleColor={(l: any) => getLinkColor(l.label)}
                linkCanvasObjectMode={() => "after"}
                linkCanvasObject={() => {}}
                onNodeClick={handleNodeClick}
                onNodeDragEnd={(node: any) => {
                  node.fx = node.x;
                  node.fy = node.y;
                  positionsRef.current[node.id] = { x: node.x, y: node.y };
                }}
              />
            )}

            {/* Drill-down hint */}
            {!isLoading && expandedChats.size === 0 && graphData.nodes.length > 1 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
                <div className="glass-panel px-4 py-2 rounded-full text-xs text-muted-foreground whitespace-nowrap">
                  Click a <span className="text-foreground font-medium">Chat</span> to expand
                  → <span className="text-neon-violet font-medium">type groups</span>
                  → individual nodes
                </div>
              </div>
            )}

            {/* Focus indicator */}
            {focusNode && (
              <div className="absolute top-4 left-4 bg-background/80 border border-neon-violet px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-neon-violet animate-pulse" />
                <span className="text-xs font-medium text-neon-violet">Node selected</span>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={() => setFocusNode(null)}>
                  ✕
                </Button>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 glass-panel p-3 rounded-lg text-xs">
              <p className="font-medium mb-2 text-muted-foreground uppercase tracking-wider">Node types</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
                {Object.entries(SECTION_COLORS).map(([key, color]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-muted-foreground">{key}</span>
                  </div>
                ))}
              </div>
              <p className="font-medium mb-1.5 text-muted-foreground uppercase tracking-wider">Edges</p>
              {[
                { label: "project → chat", color: "rgba(139,92,246,0.9)" },
                { label: "chat → type group", color: "rgba(148,163,184,0.9)" },
                { label: "type → node", color: "rgba(100,116,139,0.9)" },
              ].map(e => (
                <div key={e.label} className="flex items-center gap-2 mb-1">
                  <span style={{ display: "block", width: 20, height: 2, backgroundColor: e.color, borderRadius: 1 }} />
                  <span className="text-muted-foreground">{e.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div data-tour="graph-controls" className="w-72 glass-panel p-4 flex flex-col gap-4 overflow-y-auto">

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Chats", value: chats.length },
                { label: "Expanded", value: expandedChats.size },
                { label: "KG nodes", value: graphData.nodes.filter(n => n.group === "KG_NODE").length },
              ].map(s => (
                <div key={s.label} className="bg-background/50 border border-border rounded-lg p-2 text-center">
                  <p className="text-lg font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Node detail */}
            {focusNode ? (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: SECTION_COLORS[focusNode.section ?? ""] ?? "#888" }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {focusNode.section}
                  </span>
                  <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={() => setFocusNode(null)}>
                    Clear
                  </Button>
                </div>

                <div className="bg-background/50 border border-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Content</p>
                  <p className="text-sm leading-relaxed">{focusNode.name}</p>
                </div>

                {focusNode.confidence && (
                  <div className="bg-background/50 border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                    <p className="text-sm font-medium text-cyan-400">{focusNode.confidence}</p>
                  </div>
                )}

                {focusedLinks.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                      Edges ({focusedLinks.length})
                    </p>
                    <div className="space-y-1.5">
                      {focusedLinks.map((l: any, i: number) => {
                        const isSource = (l.source?.id ?? l.source) === focusNode.id;
                        const other = isSource ? l.target : l.source;
                        const otherName = typeof other === "object" ? other.name : other;
                        return (
                          <div key={i} className="flex items-start gap-2 text-xs bg-background/50 p-2 rounded border border-border">
                            <span className={`shrink-0 font-mono ${isSource ? "text-neon-violet" : "text-neon-cyan"}`}>
                              {isSource ? "→" : "←"}
                            </span>
                            <span className="text-muted-foreground shrink-0">{l.label}</span>
                            <span className="truncate" title={otherName}>{otherName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-60">
                <p className="text-sm text-center">Click an individual node<br/>to inspect its content</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}