import React, { useState, useMemo } from 'react';
import { useDocumentStore } from '@/store/documentStore';
import { AlertTriangle, Check, X, Edit3, MessageSquare } from 'lucide-react';
import { toast } from "sonner";

export function AmbiguityCard({ ambiguity, isResolved = false, isSelected = false }: { ambiguity: any, isResolved?: boolean, isSelected?: boolean }) {
  const { applyFix, ignoreIssue, patchedRequirements, setSelectedIssue } = useDocumentStore();
  const [isEditing, setIsEditing] = useState(false);
  
  // Use patched requirement if exists, otherwise fallback to suggested rewrite or original
  const existingPatch = patchedRequirements[ambiguity.story_id];
  // Calculate the default full-sentence rewrite by replacing the vague term with the suggestion
  const defaultFullRewrite = useMemo(() => {
    if (!ambiguity.text || !ambiguity.term || !ambiguity.suggested_rewrite) return ambiguity.text;
    try {
      const regex = new RegExp(`\\b${ambiguity.term}\\b`, 'gi');
      return ambiguity.text.replace(regex, ambiguity.suggested_rewrite);
    } catch(e) {
      return ambiguity.text.replace(ambiguity.term, ambiguity.suggested_rewrite);
    }
  }, [ambiguity.text, ambiguity.term, ambiguity.suggested_rewrite]);

  const [fixText, setFixText] = useState(existingPatch || defaultFullRewrite);

  const handleApplyFix = () => {
    applyFix(ambiguity.story_id, fixText);
    setIsEditing(false);
    toast.success(`✔ Fix applied to ${ambiguity.story_id}`);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isSelected || isEditing) return;
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) return;

      if ((e.key === 'a' || e.key === 'A') && !isResolved) {
        handleApplyFix();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, isEditing, isResolved, handleApplyFix]);

  const getImpact = () => {
    return `May cause inconsistent interpretations and unmeasurable validation criteria.`;
  };

  return (
    <div 
      onClick={() => setSelectedIssue(ambiguity.id)}
      className={`bg-slate-900 border cursor-pointer ${isResolved ? 'border-slate-800 opacity-70' : 'border-amber-500/20'} ${isSelected && !isResolved ? 'ring-1 ring-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] transform scale-[1.01]' : 'shadow-[0_4px_20px_rgba(245,158,11,0.05)]'} rounded-xl overflow-hidden font-sans transition-all duration-200`}
    >
      {/* Header */}
      <div className={`px-5 py-3 border-b flex items-center justify-between ${isResolved ? 'border-slate-800 bg-slate-900/50' : 'border-amber-500/20 bg-amber-500/5'}`}>
        <div className="flex items-center gap-3">
          <AlertTriangle className={`w-5 h-5 ${isResolved ? 'text-slate-500' : 'text-amber-400'}`} />
          <h4 className={`font-semibold tracking-tight ${isResolved ? 'text-slate-400' : 'text-amber-400'}`}>
            Ambiguous Requirement
          </h4>
        </div>
        <span className="px-2 py-1 bg-slate-950 rounded text-xs font-medium text-slate-400 border border-slate-800 shadow-inner">
          {ambiguity.story_id}
        </span>
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Original Text</p>
          <p className="text-sm text-slate-300 leading-relaxed font-medium bg-slate-950 p-4 rounded-lg border border-slate-800/50">
            {ambiguity.text}
          </p>
        </div>

        {/* Human Explanation & Impact */}
        <div className="mb-6 bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 space-y-3">
          <div className="flex gap-3">
            <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-300 mb-1">Why is this unclear?</p>
              <p className="text-sm text-slate-400 leading-relaxed">
                {ambiguity.explanation || `The term "${ambiguity.term}" is vague and lacks measurable criteria.`}
              </p>
            </div>
          </div>
          <div className="h-px w-full bg-slate-700/50"></div>
          <div className="flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-500/90 mb-1">Impact:</p>
              <p className="text-sm text-amber-200/80 leading-relaxed">
                {getImpact()}
              </p>
            </div>
          </div>
        </div>

        {/* Remediation Workspace */}
        {!isResolved && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-emerald-500/80 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Edit3 className="w-3.5 h-3.5" />
              Rewrite Suggestion
            </p>
            {isEditing ? (
              <div className="space-y-3">
                <textarea 
                  value={fixText}
                  onChange={(e) => setFixText(e.target.value)}
                  className="w-full h-24 bg-slate-950 border border-indigo-500/50 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button 
                    onClick={() => {
                      setFixText(existingPatch || defaultFullRewrite);
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-md transition-colors"
                  >
                    Save Draft
                  </button>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => setIsEditing(true)}
                className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-text rounded-lg p-4 text-sm transition-all"
              >
                {/* Diff View */}
                <div className="space-y-2 mb-3">
                  <div className="text-rose-400/70 bg-rose-500/5 px-2 py-1 rounded line-through decoration-rose-500/50">
                    {ambiguity.text}
                  </div>
                  <div className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                    {fixText}
                  </div>
                </div>
                
                {/* Impact Indicator */}
                <div className="flex items-start gap-2 pt-3 border-t border-slate-800/50">
                  <span className="text-indigo-400 text-xs">⚠</span>
                  <p className="text-xs text-slate-400 font-medium">
                    <span className="text-slate-300">Impact:</span> Removes ambiguity → makes requirement testable.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {isResolved && existingPatch && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-emerald-500/80 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Applied Fix
            </p>
            <div className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 text-sm text-emerald-400/90">
              {existingPatch}
            </div>
          </div>
        )}

        {/* Triage Actions */}
        {!isResolved && (
          <div className="flex items-center gap-3 pt-4 border-t border-slate-800/50 mt-4">
            <button 
              onClick={handleApplyFix}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
            >
              <Check className="w-4 h-4" />
              Apply Fix
              {isSelected && <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-indigo-600 rounded border border-indigo-400 font-mono">A</kbd>}
            </button>
            <button 
              onClick={() => ignoreIssue(ambiguity.id)}
              className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800 text-slate-400 text-sm font-medium rounded-lg transition-colors border border-transparent hover:border-slate-700"
            >
              <X className="w-4 h-4" />
              Ignore
              {isSelected && <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-slate-800 rounded border border-slate-700 font-mono">I</kbd>}
            </button>
            {!isEditing && (
              <button 
                onClick={() => setIsEditing(true)}
                className="ml-auto text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Edit suggestion
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
