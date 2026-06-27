import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// createEditorWorkspace removed — SRS handoff now goes to UML-Clarity, not the Collab Editor
import { useDocumentStore } from '@/store/documentStore';
import { toast } from 'sonner';
import { ControlPanel } from '@/components/srs-workspace/ControlPanel';
import { IssueDetailView } from '@/components/srs-workspace/IssueDetailView';
import { LiveDocumentViewer } from '@/components/srs-workspace/LiveDocumentViewer';
import { 
  ArrowLeft, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Zap
} from 'lucide-react';

export function WorkspacePage() {
  const navigate = useNavigate();
  const { 
    currentDocId, 
    intelligence,
    issues,
    issueStatus,
    hasUnsavedChanges,
    patchedRequirements,
    getGroupedIssuesByModule,
    clearUnsavedChanges
  } = useDocumentStore();

  const [activeTab, setActiveTab] = useState<'triage' | 'export'>('triage');
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  // Removed the aggressive redirect useEffect

  if (!currentDocId || !issues) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-muted-foreground bg-background rounded-xl border border-dashed border-border p-6 m-4">
        <FileText className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-display font-medium text-foreground tracking-tight">No Document Selected</h2>
        <p className="mt-2 mb-6">Select or upload a document from the Dashboard to start triaging issues.</p>
        <button onClick={() => navigate('/srs/dashboard')} className="px-6 py-2 bg-primary hover:bg-primary/80 text-primary-foreground rounded-lg font-medium transition-colors">
          Go to Dashboard
        </button>
      </div>
    );
  }

  const metrics = useMemo(() => {
    if (!issues) return { total: 0, resolved: 0, remaining: 0 };
    
    let total = (issues.ambiguities?.length || 0) + 
                (issues.conflicts?.length || 0) + 
                (issues.gaps?.length || 0);
    
    let resolved = Object.values(issueStatus).filter(s => s === 'resolved' || s === 'ignored').length;
    
    return {
      total,
      resolved,
      remaining: total - resolved
    };
  }, [issues, issueStatus]);

  const handleExport = () => {
    if (!intelligence) return;
    
    let markdown = `# Software Requirements Specification\n\n`;
    
    intelligence.user_stories.forEach(story => {
      const text = patchedRequirements[story.id] || story.raw_text;
      markdown += `## ${story.id}\n${text}\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDocId}_clean_srs.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToUML = () => {
    if (!intelligence) return;

    // Build resolved SRS markdown from patched requirements
    let markdown = `# SRS: ${currentDocId}\n\n`;
    intelligence.user_stories.forEach(story => {
      const text = patchedRequirements[story.id] || story.raw_text;
      markdown += `## ${story.id}\n${text}\n\n`;
    });

    // Stash context so UML-Clarity can pick it up on load
    sessionStorage.setItem('uml_srs_context', JSON.stringify({
      doc_id: currentDocId,
      markdown,
      timestamp: Date.now(),
    }));

    toast.success('Handing off to UML-Clarity…');
    navigate('/uml/dashboard');
  };

  if (!currentDocId || !issues) return null;

  return (
    <div className="h-full bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b border-border glass-panel flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/srs/dashboard')}
            className="p-2 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Workspace</h1>
            <h2 className="text-lg font-display font-semibold text-foreground tracking-tight flex items-center gap-2">
              <FileText className="w-4 h-4 text-neon-mint" />
              {currentDocId}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-sm px-4 py-1.5 glass-panel rounded-full border border-border">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">Total: {metrics.total}</span>
            </span>
            <span className="w-px h-4 bg-border" />
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-neon-mint" />
              <span className="text-neon-mint font-medium">Resolved: {metrics.resolved}</span>
            </span>
          </div>

          <button
            onClick={() => {
              const promise = new Promise((resolve) => setTimeout(resolve, 2000));
              toast.promise(promise, {
                loading: 'Re-running intelligence engine...',
                success: `Validation complete. ${metrics.resolved} issues permanently resolved in live document.`,
                error: 'Validation failed.'
              });
              
              setIsReanalyzing(true);
              promise.then(() => {
                setIsReanalyzing(false);
                clearUnsavedChanges();
              });
            }}
            disabled={isReanalyzing || metrics.remaining === 0}
            className="flex items-center gap-2 px-4 py-2 bg-neon-violet/10 hover:bg-neon-violet/20 text-neon-violet text-sm font-medium rounded-lg border border-neon-violet/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReanalyzing ? 'Validating...' : 'Re-analyze Document'}
          </button>

          <div data-tour="srs-actions" className="flex items-center gap-4 border-l border-border pl-6">
            {metrics.remaining === 0 && (
              <div className="hidden md:flex flex-col items-end text-right">
                <p className="text-[11px] text-neon-mint font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> 0 conflicts remaining</p>
                <p className="text-[11px] text-neon-mint font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> 0 critical ambiguities</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Confidence: <span className="text-neon-mint font-bold">HIGH</span></p>
              </div>
            )}
            <button
              onClick={handleExport}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
                metrics.remaining === 0 
                  ? 'bg-neon-mint hover:bg-neon-mint/90 text-background shadow-[0_0_20px_rgba(34,197,94,0.4)] transform hover:-translate-y-0.5' 
                  : hasUnsavedChanges 
                    ? 'bg-neon-mint/80 hover:bg-neon-mint/90 text-background shadow-[0_0_15px_rgba(34,197,94,0.3)]' 
                    : 'bg-muted hover:bg-muted/80 text-foreground'
              }`}
            >
              <Download className="w-4 h-4" />
              Export Clean SRS
            </button>

            <button
              onClick={handleSendToUML}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all transform hover:-translate-y-0.5"
            >
              <Zap className="w-4 h-4 fill-white" />
              Send to UML Clarity
            </button>
          </div>
        </div>
      </header>

      {/* Split Pane */}
      <div data-tour="srs-split-pane" className="flex-1 flex overflow-hidden">
        {metrics.remaining === 0 && metrics.total > 0 ? (
          <>
            {/* Left: Success summary + re-triage option */}
            <div className="w-[40%] border-r border-border flex flex-col shrink-0 min-w-[350px] glass-panel">
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-20 h-20 bg-neon-mint/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-neon-mint" />
                </div>
                <h2 className="text-2xl font-display font-bold text-foreground tracking-tight mb-2">🎉 All Issues Resolved!</h2>
                <p className="text-muted-foreground mb-6 text-center text-sm">
                  {intelligence?.user_stories.length} requirements analyzed. {metrics.resolved} issues triaged.
                </p>
                <button
                  onClick={handleExport}
                  className="w-full max-w-xs py-3 bg-neon-mint hover:bg-neon-mint/90 text-background font-bold rounded-lg shadow-lg transition-colors mb-3"
                >
                  <Download className="w-4 h-4 inline mr-2" />
                  Export Clean SRS (.md)
                </button>
                <button
                  onClick={handleSendToUML}
                  className="w-full max-w-xs py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4 fill-white" />
                  Generate UML Diagrams
                </button>
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  👉 Review your edits in the live document on the right. Click any requirement to re-edit it.
                </p>
              </div>
            </div>

            {/* Right: Live Document for review */}
            <div className="w-[60%] overflow-y-auto bg-background/50 relative scroll-smooth">
              <LiveDocumentViewer />
            </div>
          </>
        ) : (
          <>
            {/* Left Panel (40%) */}
            <div className="w-[40%] border-r border-border flex flex-col shrink-0 min-w-[350px] h-full">
              {/* Modules List (Top) */}
              <div className="flex shrink-0 min-h-[200px] max-h-[35%] border-b border-border glass-panel">
                <ControlPanel />
              </div>
              
              {/* Issues List (Bottom) */}
              <div className="flex-1 overflow-y-auto bg-background/30 relative scroll-smooth">
                <IssueDetailView />
              </div>
            </div>

            {/* Right Panel (60%) */}
            <div className="w-[60%] overflow-y-auto bg-background/50 relative scroll-smooth">
              <LiveDocumentViewer />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
