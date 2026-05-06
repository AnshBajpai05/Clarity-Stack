import { useDocumentStore, type AmbiguityIssue, type ConflictIssue, type GapIssue } from "@/store/documentStore";
import { AlertTriangle, Lightbulb, Shield, Info, Swords, SearchX, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

// ─── Shared ─────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    high: 'bg-destructive/15 text-destructive border-destructive/30',
    medium: 'bg-warning/15 text-warning border-warning/30',
    low: 'bg-muted/15 text-muted-foreground border-border',
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${styles[severity] || styles.low}`}>
      {severity}
    </Badge>
  );
}

function CategoryBadge({ category, colorClass }: { category: string; colorClass?: string }) {
  const labels: Record<string, string> = {
    vague_term: 'Vague Term', weak_verb: 'Weak Verb', missing_reason: 'Missing Reason',
    contradictory_state: 'Contradictory State', overlapping_scope: 'Overlapping Scope', inconsistent_actor: 'Inconsistent Actor',
    missing_ac: 'Missing AC', no_testable_ac: 'No Testable AC', missing_error_handling: 'Missing Error Handling',
    duplicate_ac: 'Duplicate AC', orphan_actor: 'Orphan Actor',
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${colorClass || ''}`}>
      {labels[category] || category.replace(/_/g, ' ')}
    </Badge>
  );
}

// ─── Ambiguity Card ──────────────────────────────────────────────────

function AmbiguityCard({ issue }: { issue: AmbiguityIssue }) {
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${issue.severity === 'high' ? 'text-destructive' : issue.severity === 'medium' ? 'text-warning' : 'text-muted-foreground'}`} />
          <span className="font-mono text-sm text-muted-foreground">{issue.id}</span>
          <span className="text-xs text-muted-foreground">in</span>
          <span className="font-mono text-xs text-primary font-semibold">{issue.story_id}</span>
        </div>
        <div className="flex gap-2">
          <CategoryBadge category={issue.category} />
          <SeverityBadge severity={issue.severity} />
        </div>
      </div>
      <div className="p-3 rounded-lg bg-warning/5 border border-warning/20">
        <p className="text-sm">"...{issue.text.length > 120 ? issue.text.slice(0, 120) + '...' : issue.text}"</p>
        {issue.term !== '(missing)' && (
          <p className="text-xs text-warning mt-1.5">Flagged term: <span className="font-semibold">"{issue.term}"</span></p>
        )}
      </div>
      <div className="flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">{issue.explanation}</p>
      </div>
      <div className="p-3 rounded-lg bg-success/5 border border-success/20">
        <div className="flex items-center gap-2 mb-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-success" />
          <span className="text-xs font-medium text-success">Suggested Fix</span>
        </div>
        <p className="text-sm">{issue.suggested_rewrite}</p>
      </div>
    </div>
  );
}

// ─── Conflict Card (SOTA UI) ──────────────────────────────────────────

function ConfidenceBar({ confidence }: { confidence: number }) {
  const [width, setWidth] = useState(0);
  const percent = Math.round((confidence || 0) * 100);

  // Micro-animation on load
  import("react").then(m => m.useEffect(() => {
    const timer = setTimeout(() => setWidth(percent), 150);
    return () => clearTimeout(timer);
  }, [percent]));

  const getColor = () => {
    if (confidence > 0.8) return "bg-green-500";
    if (confidence > 0.65) return "bg-yellow-500";
    return "bg-gray-400";
  };

  return (
    <div className="w-full mt-4 mb-2">
      <div className="text-xs text-muted-foreground font-medium mb-1">Confidence: {percent}%</div>
      <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getColor()}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function ActionText({ text }: { text: string }) {
  const conflictVerbs = ["allow", "permit", "approve", "reject", "block", "deny", "detain", "restrict", "present", "absent"];
  if (!text) return <span>N/A</span>;
  const words = text.split(" ");
  return (
    <span>
      {words.map((w, i) => {
        const clean = w.toLowerCase().replace(/[^a-z]/g, "");
        const isTarget = conflictVerbs.includes(clean);
        return isTarget ? <span key={i} className="text-red-500 dark:text-red-400 font-bold">{w} </span> : <span key={i}>{w} </span>;
      })}
    </span>
  );
}

type Source = "rule" | "embedding" | "llm" | string;

function SourceBadge({ source }: { source: Source }) {
  const styles: Record<string, string> = {
    rule: "bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30",
    embedding: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30",
    llm: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30"
  };
  const defaultStyle = "bg-muted text-muted-foreground";

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider ${styles[source] || defaultStyle}`}>
      {source ? source.toUpperCase() : 'UNKNOWN'}
    </span>
  );
}

type Breakdown = {
  rule: number
  embedding: number
  llm: number
}

function DebugPanel({ issue }: { issue: any }) {
  const isDebug = typeof window !== 'undefined' && window.location.search.includes("debug=true");
  const [open, setOpen] = useState(isDebug);

  return (
    <div className="mt-3">
      <button
        className="text-[10px] font-medium text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide Runtime Trace ▲" : "Inspect Layer Metrics ▼"}
      </button>

      {open && (
        <div className="mt-2 text-[10px] bg-muted/30 p-3 rounded-md border border-border/50 space-y-1.5 font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Action Distance (sim):</span>
            <span>{issue.similarity !== undefined ? issue.similarity.toFixed(2) : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Layer Confidence:</span>
            <span>{issue.confidence ? Math.round(issue.confidence * 100) + '%' : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Terminus Node:</span>
            <span className="uppercase text-primary font-bold">{issue.source || 'RULE'}</span>
          </div>
          <div className="flex justify-between border-t border-border/50 pt-1.5 mt-1.5">
            <span className="text-muted-foreground">LLM Fallback Status:</span>
            <span>{issue.source === "llm" ? "TRIGGERED" : "BYPASSED"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceBreakdown({ data }: { data?: Breakdown }) {
  if (!data) return null;

  const layers = [
    { key: "rule", label: "Rule", color: "bg-green-500/80" },
    { key: "embedding", label: "Embedding", color: "bg-yellow-500/80" },
    { key: "llm", label: "LLM", color: "bg-blue-500/80" }
  ];

  const maxValue = Math.max(data.rule, data.embedding, data.llm);

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">
        Confidence Breakdown
      </div>
      <div className="space-y-1.5">
        {layers.map(layer => {
          const value = data[layer.key as keyof Breakdown];
          const percent = Math.round(value * 100);
          const isDominant = value === maxValue && value > 0;

          return (
            <div key={layer.key} className="flex items-center gap-3">
              <div className={`w-16 text-xs ${isDominant ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {layer.label}
              </div>
              <div className="flex-1 bg-muted/40 h-2 rounded-full overflow-hidden">
                <div
                  className={`${layer.color} h-full transition-all duration-500`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className={`w-10 text-xs text-right font-mono ${isDominant ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                {percent}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}

function ReasoningTimeline({ trace }: { trace: any[] }) {
  if (!trace || trace.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">
        Reasoning Trace
      </div>
      <div className="space-y-2">
        {trace.map((step, i) => {
          const text = typeof step === 'string' ? step : JSON.stringify(step);
          return (
            <div key={i} className="flex gap-3 items-start">
              <div className="flex flex-col items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5" />
                {i < trace.length - 1 && <div className="w-px h-full bg-border min-h-[12px]" />}
              </div>
              <p className="text-[11px] font-mono text-muted-foreground leading-tight">
                {text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConflictCard({ issue }: { issue: ConflictIssue }) {
  return (
    <div className="glass-card p-5 shadow-sm transition-all hover:shadow-md border border-border/50 bg-card/40">
      
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-destructive" />
          <h3 className="font-semibold text-sm text-destructive">
            ⚠ Conflicting Logic Detected
          </h3>
        </div>
        <SourceBadge source={issue.source || 'rule'} />
      </div>

      {issue.rule_a && issue.rule_b ? (
        <>
          <div className="p-3 rounded-md bg-muted/30 border border-border/50 mb-3 space-y-1">
            <div className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Shared Condition</div>
            <div className="font-mono text-sm text-foreground">
              {issue.rule_a?.condition || "N/A"}
            </div>
          </div>

          <div className="text-sm">
            <div className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Incompatible Actions</div>
            <div className="grid gap-2">
              <div className="flex gap-2 items-start p-2 rounded bg-destructive/5 border border-destructive/10">
                <Badge variant="outline" className="text-[10px] shrink-0 font-mono mt-0.5">{issue.stories[0]}</Badge>
                <div className="text-sm text-foreground/90"><ActionText text={issue.rule_a?.action} /></div>
              </div>
              <div className="flex gap-2 items-start p-2 rounded bg-destructive/5 border border-destructive/10">
                <Badge variant="outline" className="text-[10px] shrink-0 font-mono mt-0.5">{issue.stories[1] || '?'}</Badge>
                <div className="text-sm text-foreground/90"><ActionText text={issue.rule_b?.action} /></div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm">{issue.description}</p>
      )}

      <ConfidenceBar confidence={issue.confidence || 0} />

      <div className="text-xs mt-3 mb-2 p-2 bg-destructive/5 border-l-2 border-destructive text-destructive font-medium">
        Impact: This conflict can cause inconsistent logic execution or infinite loops triggering unpredictably based on {issue.rule_a?.condition || "the shared condition"}.
      </div>

      {issue.explanation && (
        <div className="flex items-start gap-2 mt-4 pt-3 border-t border-border/50">
          <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {issue.explanation}
          </p>
        </div>
      )}

      {issue.trace && <ReasoningTimeline trace={issue.trace} />}
      {issue.confidence_breakdown && <ConfidenceBreakdown data={issue.confidence_breakdown} />}
      <DebugPanel issue={issue} />

    </div>
  );
}

// ─── Gap Card ────────────────────────────────────────────────────────

function GapCard({ issue }: { issue: GapIssue }) {
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <SearchX className={`w-4 h-4 ${issue.severity === 'medium' ? 'text-warning' : 'text-muted-foreground'}`} />
          <span className="font-mono text-sm text-muted-foreground">{issue.id}</span>
          <span className="text-xs text-muted-foreground">in</span>
          <span className="font-mono text-xs text-primary font-semibold">{issue.story_id}</span>
        </div>
        <div className="flex gap-2">
          <CategoryBadge category={issue.category} colorClass="border-accent/30 text-accent" />
          <SeverityBadge severity={issue.severity} />
        </div>
      </div>
      <p className="text-sm">{issue.description}</p>
      <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
        <div className="flex items-center gap-2 mb-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-medium text-accent">Recommendation</span>
        </div>
        <p className="text-sm">{issue.recommendation}</p>
      </div>
    </div>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────

type TabId = 'ambiguities' | 'conflicts' | 'gaps';

function TabButton({ id, label, count, icon: Icon, active, onClick, color }: {
  id: TabId; label: string; count: number; icon: any; active: boolean;
  onClick: (id: TabId) => void; color: string;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? `${color} shadow-sm`
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-muted/30'}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function IssuesPage() {
  const { issues } = useDocumentStore();
  const [activeTab, setActiveTab] = useState<TabId>('ambiguities');
  const [strictMode, setStrictMode] = useState(false);

  if (!issues) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
        <Shield className="w-12 h-12 mb-4 opacity-30" />
        <h2 className="text-xl font-semibold mb-2">Issues</h2>
        <p className="text-sm">Upload or select a document to see detected issues.</p>
      </div>
    );
  }

  const ambiguities = issues.ambiguities || [];
  let rawConflicts = [...(issues.conflicts || [])];

  const distHigh = rawConflicts.filter(c => (c.confidence || 0) > 0.8).length;
  const distMed = rawConflicts.filter(c => (c.confidence || 0) <= 0.8 && (c.confidence || 0) > 0.4).length;

  if (strictMode) {
    rawConflicts = rawConflicts.filter(c => (c.confidence || 0) > 0.8 || c.source === 'rule');
  }

  const conflicts = rawConflicts.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const gaps = issues.gaps || [];
  const total = ambiguities.length + conflicts.length + gaps.length;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Issues</h1>
          <p className="text-muted-foreground text-sm">
            {total} issues detected across {issues.metadata?.stories_scanned || 0} stories
          </p>
        </div>
        
        {/* Toggle Mode */}
        {activeTab === 'conflicts' && (
          <div className="flex items-center gap-2 p-1 bg-muted/30 rounded-lg border border-border/50">
            <button 
              onClick={() => setStrictMode(false)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${!strictMode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Balanced Mode
            </button>
            <button 
              onClick={() => setStrictMode(true)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${strictMode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Strict Mode
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-muted/10 border border-border w-fit">
        <TabButton id="ambiguities" label="Ambiguities" count={ambiguities.length}
          icon={AlertTriangle} active={activeTab === 'ambiguities'} onClick={setActiveTab}
          color="bg-warning/20 text-warning border border-warning/30" />
        <TabButton id="conflicts" label="Conflicts" count={conflicts.length}
          icon={Swords} active={activeTab === 'conflicts'} onClick={setActiveTab}
          color="bg-destructive/20 text-destructive border border-destructive/30" />
        <TabButton id="gaps" label="Gaps" count={gaps.length}
          icon={SearchX} active={activeTab === 'gaps'} onClick={setActiveTab}
          color="bg-accent/20 text-accent border border-accent/30" />
      </div>

      {/* Content */}
      {activeTab === 'ambiguities' && (
        <div className="space-y-3">
          {ambiguities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No ambiguities detected.</p>
          ) : (
            <>
              {/* Summary chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {['high', 'medium', 'low'].map(sev => {
                  const c = ambiguities.filter(a => a.severity === sev).length;
                  if (c === 0) return null;
                  const colors: Record<string, string> = { high: 'bg-destructive/10 text-destructive', medium: 'bg-warning/10 text-warning', low: 'bg-muted/10 text-muted-foreground' };
                  return (
                    <div key={sev} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${colors[sev]}`}>
                      <AlertTriangle className="w-3 h-3" /> {c} {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </div>
                  );
                })}
              </div>
              {ambiguities.map(a => <AmbiguityCard key={a.id} issue={a} />)}
            </>
          )}
        </div>
      )}

      {activeTab === 'conflicts' && (
        <div className="space-y-3">
          {conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No conflicts detected.</p>
          ) : (
            <>
              {/* Distribution Bar */}
              <div className="flex items-center gap-4 mb-4 bg-muted/20 p-3 rounded-lg border border-border/50">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-36">System Confidence</div>
                <div className="flex-1 flex items-center h-2 overflow-hidden gap-0.5 rounded-sm">
                  {distHigh > 0 && <div className="h-full bg-green-500" style={{ flex: distHigh }} title="High Confidence" />}
                  {distMed > 0 && <div className="h-full bg-yellow-500" style={{ flex: distMed }} title="Medium/Low Confidence" />}
                  {distHigh === 0 && distMed === 0 && <div className="h-full bg-muted w-full" />}
                </div>
                <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                  <span className="text-green-500 font-bold">{distHigh} High</span>
                  <span className="text-yellow-600 font-bold">{distMed} Med</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {['high', 'medium'].map(sev => {
                  const c = conflicts.filter(x => x.severity === sev).length;
                  if (c === 0) return null;
                  const colors: Record<string, string> = { high: 'bg-destructive/10 text-destructive', medium: 'bg-warning/10 text-warning' };
                  return (
                    <div key={sev} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${colors[sev]}`}>
                      <Swords className="w-3 h-3" /> {c} {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </div>
                  );
                })}
              </div>
              {conflicts.map(c => <ConflictCard key={c.id} issue={c} />)}
            </>
          )}
        </div>
      )}

      {activeTab === 'gaps' && (
        <div className="space-y-3">
          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No gaps detected.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {['medium', 'low'].map(sev => {
                  const c = gaps.filter(x => x.severity === sev).length;
                  if (c === 0) return null;
                  const colors: Record<string, string> = { medium: 'bg-warning/10 text-warning', low: 'bg-muted/10 text-muted-foreground' };
                  return (
                    <div key={sev} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${colors[sev]}`}>
                      <SearchX className="w-3 h-3" /> {c} {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </div>
                  );
                })}
              </div>
              {gaps.map(g => <GapCard key={g.id} issue={g} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
