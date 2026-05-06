import React, { useState } from 'react';
import { useDocumentStore } from '@/store/documentStore';
import { ShieldAlert, Check, X, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from "sonner";

export function ConflictCard({ conflict, isResolved = false, isSelected = false }: { conflict: any, isResolved?: boolean, isSelected?: boolean }) {
  const { resolveIssue, ignoreIssue, setSelectedIssue } = useDocumentStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Generate Human Trace
  const getHumanExplanation = () => {
    const trace = conflict.trace || [];
    const hasNumeric = trace.some((t: any) => t.layer === 'numeric_rule');
    const hasSemantic = trace.some((t: any) => t.layer === 'semantic');

    if (hasNumeric) {
      return "These requirements trigger under the exact same condition, but enforce contradictory numeric values or limits.";
    }
    if (hasSemantic) {
      return "These requirements share the same trigger context, but they enforce fundamentally opposing actions (e.g., allowing vs denying).";
    }
    return "These rules are logically incompatible based on their condition triggers.";
  };

  const getImpact = () => {
    const trace = conflict.trace || [];
    const hasNumeric = trace.some((t: any) => t.layer === 'numeric_rule');
    if (hasNumeric) return "May cause system errors or inconsistent validation due to numeric mismatch.";
    return "May cause inconsistent access control or system behavior when the condition is met.";
  };

  return (
    <div 
      onClick={() => setSelectedIssue(conflict.id)}
      className={`bg-slate-900 border cursor-pointer ${isResolved ? 'border-slate-800' : 'border-rose-500/20'} ${isSelected && !isResolved ? 'ring-1 ring-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)] transform scale-[1.01]' : 'shadow-[0_4px_20px_rgba(244,63,94,0.05)]'} rounded-xl overflow-hidden font-sans transition-all duration-200`}
    >
      {/* Header */}
      <div className={`px-5 py-3 border-b flex items-center justify-between ${isResolved ? 'border-slate-800 bg-slate-900/50' : 'border-rose-500/20 bg-rose-500/5'}`}>
        <div className="flex items-center gap-3">
          <ShieldAlert className={`w-5 h-5 ${isResolved ? 'text-slate-500' : 'text-rose-400'}`} />
          <h4 className={`font-semibold tracking-tight ${isResolved ? 'text-slate-400' : 'text-rose-400'}`}>
            Logic Conflict Detected
          </h4>
        </div>
        <div className="flex gap-2">
          {conflict.stories.map((sId: string) => (
            <span key={sId} className="px-2 py-1 bg-slate-950 rounded text-xs font-medium text-slate-400 border border-slate-800 shadow-inner">
              {sId}
            </span>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-800/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-slate-700"></div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rule A</p>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
              IF <span className="text-amber-200/90 bg-amber-500/10 px-1 rounded">{conflict.rule_a?.condition}</span>
              <br/>
              THEN <span className="text-rose-200/90 bg-rose-500/10 px-1 rounded">{conflict.rule_a?.action}</span>
            </p>
          </div>
          <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-800/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-slate-700"></div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rule B</p>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
              IF <span className="text-amber-200/90 bg-amber-500/10 px-1 rounded">{conflict.rule_b?.condition}</span>
              <br/>
              THEN <span className="text-rose-200/90 bg-rose-500/10 px-1 rounded">{conflict.rule_b?.action}</span>
            </p>
          </div>
        </div>

        {/* Human Explanation & Impact */}
        <div className="mb-6 bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-4 space-y-3">
          <p className="text-sm text-indigo-200/80 leading-relaxed flex items-start gap-3">
            <span className="text-indigo-400 mt-0.5">💡</span>
            <span>
              <strong className="text-indigo-300 font-semibold block mb-1">Why was this flagged?</strong>
              {getHumanExplanation()}
            </span>
          </p>
          <div className="h-px w-full bg-indigo-500/10"></div>
          <p className="text-sm text-amber-200/80 leading-relaxed flex items-start gap-3">
            <span className="text-amber-500 mt-0.5">⚠</span>
            <span>
              <strong className="text-amber-500/90 font-semibold block mb-1">Impact:</strong>
              {getImpact()}
            </span>
          </p>
        </div>

        {/* Advanced Toggle */}
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors mb-4"
        >
          <Code2 className="w-3.5 h-3.5" />
          {showAdvanced ? 'Hide raw metrics' : 'Inspect raw metrics'}
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showAdvanced && (
          <div className="mb-6 p-3 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-slate-400 whitespace-pre-wrap">
            {JSON.stringify(conflict.trace, null, 2)}
          </div>
        )}

        {/* Triage Actions */}
        {!isResolved && (
          <div className="flex items-center gap-3 pt-4 border-t border-slate-800/50 mt-2">
            <button 
              onClick={() => {
                resolveIssue(conflict.id);
                toast.success(`✔ Conflict resolved`);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-medium rounded-lg transition-colors border border-emerald-500/20"
            >
              <Check className="w-4 h-4" />
              Resolve Manually
              {isSelected && <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 rounded border border-emerald-500/30 font-mono">R</kbd>}
            </button>
            <button 
              onClick={() => {
                ignoreIssue(conflict.id);
                toast.info(`Conflict ignored`);
              }}
              className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800 text-slate-400 text-sm font-medium rounded-lg transition-colors border border-transparent hover:border-slate-700"
            >
              <X className="w-4 h-4" />
              Ignore (False Positive)
              {isSelected && <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-slate-800 rounded border border-slate-700 font-mono">I</kbd>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
