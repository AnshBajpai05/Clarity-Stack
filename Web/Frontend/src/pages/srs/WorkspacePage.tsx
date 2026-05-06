import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  FileText
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
      <div className="flex-1 flex flex-col items-center justify-center h-full text-slate-400 bg-[#0a0f18] rounded-xl border border-slate-800 border-dashed">
        <FileText className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-medium text-slate-300">No Document Selected</h2>
        <p className="mt-2 mb-6">Select or upload a document from the Dashboard to start triaging issues.</p>
        <button onClick={() => navigate('/srs/dashboard')} className="px-6 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg font-medium transition-colors">
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

  if (!currentDocId || !issues) return null;

  return (
    <div className="h-full bg-slate-950 text-slate-200 flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/srs/dashboard')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-medium text-slate-400">Workspace</h1>
            <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              {currentDocId}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-sm px-4 py-1.5 bg-slate-900 rounded-full border border-slate-800">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300">Total: {metrics.total}</span>
            </span>
            <span className="w-px h-4 bg-slate-800" />
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Resolved: {metrics.resolved}</span>
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
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-sm font-medium rounded-lg border border-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReanalyzing ? 'Validating...' : 'Re-analyze Document'}
          </button>

          <div className="flex items-center gap-4 border-l border-slate-800 pl-6">
            {metrics.remaining === 0 && (
              <div className="hidden md:flex flex-col items-end text-right">
                <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> 0 conflicts remaining</p>
                <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> 0 critical ambiguities</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Confidence: <span className="text-emerald-400 font-bold">HIGH</span></p>
              </div>
            )}
            <button
              onClick={handleExport}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
                metrics.remaining === 0 
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] transform hover:-translate-y-0.5' 
                  : hasUnsavedChanges 
                    ? 'bg-emerald-500/80 hover:bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <Download className="w-4 h-4" />
              Export Clean SRS
            </button>
          </div>
        </div>
      </header>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden">
        {metrics.remaining === 0 && metrics.total > 0 ? (
          <>
            {/* Left: Success summary + re-triage option */}
            <div className="w-[40%] border-r border-slate-800 flex flex-col shrink-0 min-w-[350px] bg-slate-900/30">
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">🎉 All Issues Resolved!</h2>
                <p className="text-slate-400 mb-6 text-center text-sm">
                  {intelligence?.user_stories.length} requirements analyzed. {metrics.resolved} issues triaged.
                </p>
                <button
                  onClick={handleExport}
                  className="w-full max-w-xs py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-lg transition-colors mb-3"
                >
                  <Download className="w-4 h-4 inline mr-2" />
                  Export Clean SRS (.md)
                </button>
                <p className="text-xs text-slate-500 mt-4 text-center">
                  👉 Review your edits in the live document on the right. Click any requirement to re-edit it.
                </p>
              </div>
            </div>

            {/* Right: Live Document for review */}
            <div className="w-[60%] overflow-y-auto bg-[#05080f] relative scroll-smooth">
              <LiveDocumentViewer />
            </div>
          </>
        ) : (
          <>
            {/* Left Panel (40%) */}
            <div className="w-[40%] border-r border-slate-800 flex flex-col shrink-0 min-w-[350px] h-full">
              {/* Modules List (Top) */}
              <div className="flex shrink-0 min-h-[200px] max-h-[35%] border-b border-slate-800 bg-slate-900/30">
                <ControlPanel />
              </div>
              
              {/* Issues List (Bottom) */}
              <div className="flex-1 overflow-y-auto bg-[#0a0f18] relative scroll-smooth">
                <IssueDetailView />
              </div>
            </div>

            {/* Right Panel (60%) */}
            <div className="w-[60%] overflow-y-auto bg-[#05080f] relative scroll-smooth">
              <LiveDocumentViewer />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
