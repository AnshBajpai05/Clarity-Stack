import React, { useEffect, useRef, useState } from 'react';
import { FileText, Zap, CheckCircle2, BrainCircuit, Cpu, ScanSearch } from 'lucide-react';
import { useDocumentStore } from '@/store/documentStore';

// ─── Stage → UI step mapping ─────────────────────────────────────────────────
const STAGES = [
  { id: 1, label: "Parsing Document",               icon: FileText,   backendKey: "Parsing Document" },
  { id: 2, label: "Equation Processing",             icon: Cpu,        backendKey: "Equation Processing" },
  { id: 3, label: "Requirement Intelligence",        icon: Zap,        backendKey: "Requirement Intelligence" },
  { id: 4, label: "Conflict & Ambiguity Detection",  icon: ScanSearch, backendKey: "Conflict & Ambiguity Detection" },
];

function getActiveStep(backendStage: string | null): number {
  if (!backendStage) return 1;
  const found = STAGES.findIndex(s => s.backendKey === backendStage);
  return found >= 0 ? found + 1 : 1;
}

// ─── Flat list of document items ─────────────────────────────────────────────
// Each item appears when percent crosses its threshold (0–85 range, then highlights 85–100)
const DOC_ITEMS = [
  { type: 'title'   as const },
  { type: 'meta'    as const },
  { type: 'heading' as const, text: '1. Introduction' },
  { type: 'line'    as const, width: 92 },
  { type: 'line'    as const, width: 78 },
  { type: 'heading' as const, text: '2. Functional Requirements' },
  { type: 'req'     as const, id: 'REQ-001', ambiguous: true,  conflict: false, w: 68 },
  { type: 'req'     as const, id: 'REQ-002', ambiguous: false, conflict: false, w: 82 },
  { type: 'req'     as const, id: 'REQ-003', ambiguous: true,  conflict: false, w: 74 },
  { type: 'line'    as const, width: 55 },
  { type: 'heading' as const, text: '3. Non-Functional Requirements' },
  { type: 'req'     as const, id: 'REQ-010', ambiguous: true,  conflict: false, w: 70 },
  { type: 'req'     as const, id: 'REQ-011', ambiguous: false, conflict: true,  w: 85 },
  { type: 'req'     as const, id: 'REQ-012', ambiguous: false, conflict: false, w: 63 },
  { type: 'heading' as const, text: '4. Security Requirements' },
  { type: 'req'     as const, id: 'REQ-020', ambiguous: true,  conflict: false, w: 77 },
  { type: 'req'     as const, id: 'REQ-021', ambiguous: false, conflict: false, w: 60 },
  { type: 'line'    as const, width: 48 },
  { type: 'heading' as const, text: '5. Constraints' },
  { type: 'line'    as const, width: 88 },
  { type: 'line'    as const, width: 71 },
];

const TOTAL = DOC_ITEMS.length;

// Parse "VLM processing page X/N" from the backend message
function parsePageProgress(message: string | null): { page: number; total: number } | null {
  if (!message) return null;
  const match = message.match(/VLM processing page (\d+)\/(\d+)/);
  if (!match) return null;
  return { page: parseInt(match[1]), total: parseInt(match[2]) };
}

// Items to show, driven by real page progress during VLM, then percent for later stages
function visibleCount(percent: number, message: string | null, activeStep: number): number {
  if (percent <= 1) return 2; // always show title + meta

  // Stage 1: lock to the actual page being parsed
  const pageInfo = parsePageProgress(message);
  if (pageInfo && activeStep === 1) {
    // page 0 → show title/meta/heading; page N-1 → show ~65% of items
    const pageRatio = Math.max(0, (pageInfo.page - 1)) / pageInfo.total;
    return Math.min(Math.floor(2 + pageRatio * (TOTAL * 0.65)), TOTAL);
  }

  // Stages 2-4: front-loaded percent curve
  if (percent <= 25) {
    return Math.floor((percent / 25) * (TOTAL * 0.65));
  }
  const ratio = 0.65 + ((Math.min(percent, 85) - 25) / 60) * 0.35;
  return Math.min(Math.floor(ratio * TOTAL), TOTAL);
}

// ─── Right panel ─────────────────────────────────────────────────────────────
function LiveDocPanel({ percent, message, activeStep }: { percent: number; message: string | null; activeStep: number }) {
  const count        = visibleCount(percent, message, activeStep);
  const showReqIds   = activeStep >= 3;
  const showHighlights = activeStep >= 4 || percent >= 85;
  // Index of the "scan cursor" — item currently being revealed
  const scanIdx = Math.min(count, TOTAL - 1);

  return (
    <div className="bg-[#080d17] border border-slate-800/60 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40 shrink-0">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-700" />
          <span className="w-2 h-2 rounded-full bg-slate-700" />
          <span className="w-2 h-2 rounded-full bg-slate-700" />
        </div>
        <div className="flex-1 mx-3 h-3 rounded bg-slate-800/60 animate-pulse" />
        <FileText className="w-3 h-3 text-slate-600" />
      </div>

      {/* Document body */}
      <div className="flex-1 overflow-hidden px-5 py-4 space-y-2 relative">
        {DOC_ITEMS.map((item, idx) => {
          const isVisible = idx < count;
          const isScanTarget = idx === scanIdx && count < TOTAL;

          if (!isVisible) return null;

          if (item.type === 'title') return (
            <div key={idx} className="mb-3 animate-in fade-in duration-500">
              <div className="h-4 w-2/3 rounded bg-slate-600/50 mb-1.5" />
              <div className="h-2 w-1/3 rounded bg-slate-800/60" />
            </div>
          );

          if (item.type === 'meta') return (
            <div key={idx} className="flex gap-3 mb-3 animate-in fade-in duration-300">
              <div className="h-2 w-16 rounded bg-indigo-900/40 border border-indigo-800/30" />
              <div className="h-2 w-20 rounded bg-slate-800/50" />
            </div>
          );

          if (item.type === 'heading') return (
            <div key={idx} className="mt-4 mb-1 animate-in slide-in-from-left-2 duration-400">
              <div className="h-3 rounded bg-indigo-500/25 border-l-2 border-indigo-500/60"
                   style={{ width: `${30 + item.text.length * 1.2}%`, maxWidth: '75%' }} />
              <span className="text-[9px] font-mono text-indigo-400/50 mt-0.5 block tracking-wider">
                {item.text}
              </span>
            </div>
          );

          if (item.type === 'line') return (
            <div key={idx}
                 className={`h-2 rounded animate-in fade-in duration-500 ${isScanTarget ? 'animate-pulse' : ''}`}
                 style={{
                   width: `${item.width}%`,
                   background: isScanTarget
                     ? 'rgba(99,102,241,0.25)'
                     : 'rgba(100,116,139,0.18)',
                 }}
            />
          );

          if (item.type === 'req') {
            const isAmb = item.ambiguous && showHighlights;
            const isCft = item.conflict  && showHighlights;
            return (
              <div key={idx} className="flex items-center gap-2 animate-in fade-in slide-in-from-left-1 duration-400">
                {/* REQ ID badge */}
                <span className={`shrink-0 text-[8px] font-mono px-1.5 py-0.5 rounded border transition-all duration-500 ${
                  showReqIds
                    ? isCft ? 'bg-red-500/20 border-red-500/40 text-red-400'
                    : isAmb ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    :         'bg-slate-700/50 border-slate-600/40 text-slate-400'
                    : 'bg-slate-800/30 border-slate-700/20 text-slate-600'
                }`}>{item.id}</span>

                {/* Bar */}
                <div className="relative flex-1 h-2.5 rounded overflow-hidden">
                  <div className={`absolute inset-0 rounded transition-colors duration-700 ${
                    isCft ? 'bg-red-500/18' : isAmb ? 'bg-amber-500/18' : 'bg-slate-700/25'
                  }`} style={{ width: `${item.w}%` }} />
                  {(isAmb || isCft) && (
                    <div className={`absolute inset-0 rounded ${isCft ? 'bg-red-500/10' : 'bg-amber-500/10'} animate-pulse`}
                         style={{ width: `${item.w}%` }} />
                  )}
                  {/* Scan glow on the active target */}
                  {isScanTarget && (
                    <div className="absolute inset-0 bg-indigo-400/10 animate-pulse rounded" />
                  )}
                </div>

                {isAmb && !isCft && <span className="shrink-0 text-[8px] font-bold text-amber-400 animate-in fade-in duration-300">AMB</span>}
                {isCft           && <span className="shrink-0 text-[8px] font-bold text-red-400   animate-in fade-in duration-300">CFT</span>}
              </div>
            );
          }

          return null;
        })}

        {/* Scan-line cursor — glows at the leading edge while parsing */}
        {count < TOTAL && count > 0 && (
          <div className="h-0.5 rounded-full bg-indigo-400/60 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse"
               style={{ width: `${60 + Math.random() * 20}%` }} />
        )}

        {/* Done checkmark when all revealed */}
        {count >= TOTAL && (
          <div className="flex items-center gap-2 mt-2 animate-in fade-in duration-500">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-[9px] text-emerald-400 font-mono">Document fully parsed</span>
          </div>
        )}

        {/* Fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#080d17] to-transparent pointer-events-none" />
      </div>

      {/* Status strip */}
      <div className="shrink-0 border-t border-slate-800/60 bg-slate-900/40 px-4 py-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${showHighlights ? 'bg-amber-400' : 'bg-indigo-400'}`} />
          {showHighlights
            ? 'Flagging issues...'
            : (() => {
                const pi = parsePageProgress(message);
                if (pi) return `Parsing page ${pi.page} / ${pi.total}`;
                return count < TOTAL ? `Analysing structure...` : 'Structure complete';
              })()}
        </span>
        <span className="text-[10px] font-mono text-slate-600 tabular-nums">{percent}%</span>
      </div>
    </div>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────
export function ProcessingOverlay({ isVisible }: { isVisible: boolean }) {
  const { uploadProgress, uploadProgressPercent, uploadActiveStage } = useDocumentStore();

  // No rAF interpolation — use raw percent directly so panel stays in sync
  const progress   = uploadProgressPercent ?? 0;
  const message    = uploadProgress ?? 'Initializing...';
  const activeStep = getActiveStep(uploadActiveStage);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#05080f]/95 backdrop-blur-xl flex items-center justify-center font-sans animate-in fade-in duration-300">
      <div className="w-full max-w-6xl grid grid-cols-2 gap-12 p-8 h-[85vh] max-h-[680px]">

        {/* ── Left: Stage timeline ───────────────────────────── */}
        <div className="flex flex-col justify-center space-y-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <BrainCircuit className="w-3.5 h-3.5 animate-pulse" /> AI Engine Active
            </div>
            <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">Processing SRS Document</h2>
            <p className="text-slate-400 text-lg">Running deep semantic analysis pipeline...</p>
          </div>

          <div className="space-y-5 relative">
            <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-800 rounded-full" />
            <div
              className="absolute left-6 top-6 w-0.5 bg-emerald-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(16,185,129,0.5)]"
              style={{ height: `${Math.min(((activeStep - 1) / (STAGES.length - 1)) * 100, 100)}%` }}
            />
            {STAGES.map((step) => {
              const isActive = activeStep === step.id;
              const isPast   = activeStep > step.id;
              return (
                <div key={step.id}
                     className={`flex items-start gap-5 relative z-10 transition-opacity duration-300 ${isActive || isPast ? 'opacity-100' : 'opacity-30'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 ${
                    isPast
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                      : isActive
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-110'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}>
                    {isPast ? <CheckCircle2 className="w-6 h-6" /> : <step.icon className="w-5 h-5" />}
                  </div>
                  <div className="pt-2">
                    <h4 className={`text-base font-bold ${isActive ? 'text-white' : isPast ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {step.label}
                    </h4>
                    {isActive && (
                      <p className="text-xs text-indigo-400/80 font-mono mt-1 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                        {message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>Pipeline Progress</span>
              <span className="text-emerald-400 font-mono tabular-nums">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {activeStep >= 4 && (
            <div className="flex items-center gap-4 animate-in fade-in duration-500">
              <span className="flex items-center gap-1.5 text-xs text-amber-400">
                <span className="w-2 h-2 rounded-sm bg-amber-500/40 border border-amber-500/60" /> Ambiguity
              </span>
              <span className="flex items-center gap-1.5 text-xs text-red-400">
                <span className="w-2 h-2 rounded-sm bg-red-500/40 border border-red-500/60" /> Conflict
              </span>
            </div>
          )}
        </div>

        {/* ── Right: Live document ───────────────────────────── */}
        <LiveDocPanel percent={progress} message={message} activeStep={activeStep} />
      </div>
    </div>
  );
}
