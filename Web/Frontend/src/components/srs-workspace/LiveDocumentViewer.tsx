import React, { useEffect, useMemo } from 'react';
import { useDocumentStore } from '@/store/documentStore';

export function LiveDocumentViewer() {
  const { intelligence, patchedRequirements, selectedIssueId, issues, issueToRequirementMap } = useDocumentStore();

  const renderedDocument = useMemo(() => {
    if (!intelligence) return [];
    
    return intelligence.user_stories.map(req => {
      const patchedText = patchedRequirements[req.id];
      return {
        ...req,
        text: patchedText || req.raw_text,
        isPatched: !!patchedText
      };
    });
  }, [intelligence, patchedRequirements]);

  // Group by prefix
  const groupedDoc = useMemo(() => {
    const groups: Record<string, typeof renderedDocument> = {};
    
    renderedDocument.forEach(req => {
      // Extract prefix e.g. SEC from REQ-SEC-01
      const match = req.id.match(/^([A-Z]+)-/i);
      const prefix = match ? match[1] : 'OTHER';
      
      let sectionName = `${prefix} Requirements`;
      if (prefix === 'SEC') sectionName = 'Security Requirements';
      if (prefix === 'SCH') sectionName = 'Scheduling Requirements';
      if (prefix === 'PAT') sectionName = 'Patient Requirements';
      if (prefix === 'SYS') sectionName = 'System Requirements';
      if (prefix === 'USR') sectionName = 'User Requirements';

      if (!groups[sectionName]) groups[sectionName] = [];
      groups[sectionName].push(req);
    });

    return groups;
  }, [renderedDocument]);

  // Scroll Sync
  useEffect(() => {
    if (!selectedIssueId || !issues) return;

    let targetReqId = issueToRequirementMap[selectedIssueId];
    
    if (targetReqId) {
      const el = document.getElementById(`req-${targetReqId}`);
      if (el) {
        // Clear old highlights
        document.querySelectorAll('.flash-highlight').forEach(e => {
          e.classList.remove('ring-2', 'ring-indigo-400', 'flash-highlight', 'shadow-[0_0_15px_rgba(99,102,241,0.2)]');
        });

        // Scroll securely within the right panel container
        const container = el.closest('.overflow-y-auto');
        if (container) {
          // Calculate offset relative to the container, with padding
          const topPos = (el as HTMLElement).offsetTop - 100;
          container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Add highlight
        el.classList.add('ring-2', 'ring-indigo-400', 'flash-highlight', 'shadow-[0_0_15px_rgba(99,102,241,0.2)]', 'transition-all', 'duration-300');
        
        // Remove highlight after 1.5s
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-indigo-400', 'flash-highlight', 'shadow-[0_0_15px_rgba(99,102,241,0.2)]');
        }, 1500);
      }
    }
  }, [selectedIssueId, issues, issueToRequirementMap]);

  if (!intelligence) {
    return null;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-12 pb-32 font-sans relative">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Software Requirements Specification</h1>
        <p className="text-slate-400 mt-2 text-sm font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Document View Sync Active
        </p>
      </div>

      {Object.entries(groupedDoc).map(([section, reqs]) => (
        <div key={section} className="space-y-6">
          <h2 className="text-xl font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
            {section}
          </h2>
          
          <div className="space-y-4">
            {reqs.map(req => (
              <div 
                key={req.id} 
                id={`req-${req.id}`}
                className={`p-5 rounded-xl border transition-colors relative overflow-hidden ${
                  req.isPatched 
                    ? 'bg-emerald-500/5 border-emerald-500/30 shadow-[0_4px_20px_rgba(16,185,129,0.05)]' 
                    : 'bg-slate-900 border-slate-800/80 hover:border-slate-700 shadow-sm'
                }`}
              >
                {req.isPatched && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`text-sm font-bold tracking-tight ${req.isPatched ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {req.id}
                  </h4>
                  {req.isPatched && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Updated
                    </span>
                  )}
                </div>
                <p className="text-[15px] leading-relaxed text-slate-300 font-medium whitespace-pre-wrap pl-1">
                  {req.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
