import React from 'react';
import { useDocumentStore } from '@/store/documentStore';
import { CheckCircle2, ListTodo, Box } from 'lucide-react';
import { ConflictCard } from '@/components/srs-workspace/cards/ConflictCard';
import { AmbiguityCard } from '@/components/srs-workspace/cards/AmbiguityCard';
import { toast } from 'sonner';

export function IssueDetailView() {
  const { 
    selectedModule, 
    selectedIssueId,
    setSelectedIssue,
    getGroupedIssuesByModule, 
    issueStatus,
    resolveModule,
    resolveIssue,
    ignoreIssue
  } = useDocumentStore();

  const grouped = getGroupedIssuesByModule();
  const moduleIssues = selectedModule ? (grouped[selectedModule] || []) : [];
  const activeIssues = moduleIssues.filter(i => issueStatus[i.id] === 'open');
  const resolvedIssues = moduleIssues.filter(i => issueStatus[i.id] !== 'open');

  // Auto-select first issue if none selected
  React.useEffect(() => {
    if (!selectedIssueId && activeIssues.length > 0) {
      setSelectedIssue(activeIssues[0].id);
    }
  }, [selectedIssueId, activeIssues, setSelectedIssue]);

  // Global Keyboard Shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) {
        return;
      }
      
      if (!selectedIssueId) return;

      if (e.key === 'r' || e.key === 'R') {
        resolveIssue(selectedIssueId);
        toast.success(`✔ Issue resolved`);
      } else if (e.key === 'i' || e.key === 'I') {
        ignoreIssue(selectedIssueId);
        toast.info(`Issue ignored`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIssueId, resolveIssue, ignoreIssue]);

  if (!selectedModule) {
    return (
      <div className="py-32 flex flex-col items-center justify-center text-slate-500">
        <Box className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-medium text-slate-400">Select a module</h2>
        <p className="text-sm mt-2">Choose a module from the left panel to begin triage.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col relative bg-[#0a0f18] font-sans">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a0f18]/80 border-b border-slate-800/80 px-8 py-5 flex items-center justify-between shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {selectedModule} Module
            </h2>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
              {activeIssues.length} Open
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
            <ListTodo className="w-4 h-4" />
            Triage your outstanding issues to clear this module.
          </p>
        </div>
        
        {activeIssues.length > 0 && (
          <button 
            onClick={() => resolveModule(selectedModule)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition-all hover:border-slate-600 hover:shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Mark Module Resolved
          </button>
        )}
      </div>

      <div className="p-8 max-w-5xl mx-auto w-full">
        {/* Open Issues Section */}
        {activeIssues.length > 0 && (
          <div className="mb-12">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>
              Needs Attention ({activeIssues.length})
            </h3>
            <div className="space-y-6">
              {activeIssues.map((issue) => {
                const isSelected = issue.id === selectedIssueId;
                if (issue._type === 'conflict') return <ConflictCard key={issue.id} conflict={issue} isSelected={isSelected} />;
                if (issue._type === 'ambiguity') return <AmbiguityCard key={issue.id} ambiguity={issue} isSelected={isSelected} />;
                return null;
              })}
            </div>
          </div>
        )}

        {/* Empty State for Module */}
        {activeIssues.length === 0 && (
          <div className="py-20 text-center animate-in zoom-in duration-500">
             <div className="text-6xl mb-6">🎉</div>
             <h3 className="text-2xl font-bold text-emerald-400 mb-3">{selectedModule} Module Clean</h3>
             <p className="text-slate-400 font-medium text-lg">All requirements are now unambiguous and consistent.</p>
          </div>
        )}

        {/* Resolved Issues Section (Collapsed by default or just shown below) */}
        {resolvedIssues.length > 0 && (
          <div className="mt-12 pt-8 border-t border-slate-800/50">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2 opacity-70">
              <CheckCircle2 className="w-4 h-4" />
              Resolved & Ignored ({resolvedIssues.length})
            </h3>
            <div className="space-y-4 opacity-50 grayscale hover:grayscale-0 transition-all duration-300">
              {resolvedIssues.map((issue) => {
                if (issue._type === 'conflict') return <ConflictCard key={issue.id} conflict={issue} isResolved />;
                if (issue._type === 'ambiguity') return <AmbiguityCard key={issue.id} ambiguity={issue} isResolved />;
                return null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
