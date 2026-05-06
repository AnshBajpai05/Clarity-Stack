import { useDocumentStore, type ACNode, type UserStory } from "@/store/documentStore";
import { ChevronRight, User, Target, MessageSquare, Zap, FileText } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

function LogicBadge({ logic }: { logic: any[] }) {
  if (!logic || logic.length === 0) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
      {logic.length} rule{logic.length > 1 ? 's' : ''}
    </span>
  );
}

function ACNodeView({ node, depth = 0 }: { node: ACNode; depth?: number }) {
  const hasLogic = node.logic && node.logic.length > 0;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className={`${depth > 0 ? 'ml-5 border-l border-border/40 pl-3' : ''}`}>
      <div className="flex items-start gap-2 py-1.5 group">
        <span className="text-muted-foreground mt-0.5 text-xs">•</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-relaxed ${node.type === 'group' ? 'font-medium text-foreground' : 'text-foreground/80'}`}>
            {node.text}
          </p>
          {hasLogic && (
            <div className="mt-1.5 space-y-1">
              {node.logic.map((l, i) => (
                <div key={i} className="text-xs p-2 rounded bg-accent/5 border border-accent/10 text-muted-foreground">
                  <span className="text-accent font-medium">If</span>{' '}
                  {l.condition || 'N/A'}{' '}
                  <span className="text-accent font-medium">→</span>{' '}
                  {l.action?.description || 'N/A'}
                </div>
              ))}
            </div>
          )}
        </div>
        <LogicBadge logic={node.logic} />
      </div>
      {hasChildren && node.children.map((child, i) => (
        <ACNodeView key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function StoryCard({ story }: { story: UserStory }) {
  const [isOpen, setIsOpen] = useState(true);
  const acCount = story.acceptance_criteria?.length || 0;
  const logicCount = story.acceptance_criteria?.reduce((sum, ac) => sum + (ac.logic?.length || 0), 0) || 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="glass-card overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-5 hover:bg-muted/10 transition-colors text-left">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <ChevronRight className={`w-4 h-4 shrink-0 transition-transform text-muted-foreground ${isOpen ? 'rotate-90' : ''}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-primary font-semibold">{story.id}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{story.role}</Badge>
              </div>
              <p className="text-sm font-medium truncate">{story.goal}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className="text-[10px] text-muted-foreground">{acCount} AC</span>
            {logicCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">{logicCount} rules</span>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 border-t border-border/50 space-y-4 pt-4">
            {/* Role / Goal / Reason */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <User className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Role</span>
                </div>
                <p className="text-sm">{story.role}</p>
              </div>
              <div className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Target className="w-3 h-3 text-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">Goal</span>
                </div>
                <p className="text-sm">{story.goal}</p>
              </div>
              <div className="p-3 rounded-lg bg-success/5 border border-success/10">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="w-3 h-3 text-success" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-success">Reason</span>
                </div>
                <p className="text-sm">{story.reason || <span className="text-muted-foreground italic">Not specified</span>}</p>
              </div>
            </div>

            {/* Acceptance Criteria */}
            {acCount > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Acceptance Criteria</h4>
                <div className="space-y-0.5">
                  {story.acceptance_criteria.map((ac, i) => (
                    <ACNodeView key={i} node={ac} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function DocumentViewer() {
  const { intelligence, currentDocId, isLoading } = useDocumentStore();

  if (!intelligence) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
        <FileText className="w-12 h-12 mb-4 opacity-30" />
        <h2 className="text-xl font-semibold mb-2">Document Viewer</h2>
        <p className="text-sm">Upload or select a document from the Dashboard to view its structure.</p>
      </div>
    );
  }

  const stories = intelligence.user_stories;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Viewer</h1>
          <p className="text-muted-foreground text-sm">
            {stories.length} user stories · {intelligence.actors.join(', ')}
          </p>
        </div>
        <Badge variant="outline" className="bg-success/15 text-success border-success/30">
          <Zap className="w-3 h-3 mr-1" /> Intelligence Ready
        </Badge>
      </div>

      <div className="space-y-3">
        {stories.map(story => (
          <StoryCard key={story.id} story={story} />
        ))}
      </div>
    </div>
  );
}
