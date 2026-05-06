import React, { useEffect, useState, useRef } from 'react';
import { useDocumentStore } from '@/store/documentStore';
import { Search, Folder, CheckCircle2, ChevronRight, AlertCircle, LayoutGrid } from 'lucide-react';

const AnimatedCount = ({ count, isSelected }: { count: number, isSelected: boolean }) => {
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(count);

  useEffect(() => {
    if (count < prevCount.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold inline-block transition-all duration-300 ${
      isSelected ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'bg-slate-800 text-slate-300'
    } ${pulse ? 'scale-125 bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'scale-100'}`}>
      {count}
    </span>
  );
};

export function ControlPanel() {
  const { 
    getGroupedIssuesByModule, 
    selectedModule, 
    setSelectedModule,
    issueStatus
  } = useDocumentStore();

  const grouped = getGroupedIssuesByModule();
  const modules = Object.keys(grouped).sort();

  // Set default module on mount if none selected
  useEffect(() => {
    if (!selectedModule && modules.length > 0) {
      setSelectedModule(modules[0]);
    }
  }, [modules, selectedModule, setSelectedModule]);

  return (
    <div className="flex flex-col font-sans w-full h-full">
      {/* Search Bar */}
      <div className="p-4 border-b border-slate-800 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search issues..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Modules List */}
      <div className="flex-1 overflow-y-auto p-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-3 flex items-center gap-2">
          <LayoutGrid className="w-3.5 h-3.5" />
          Modules
        </h3>
        
        <div className="space-y-1">
          {modules.map(mod => {
            const issues = grouped[mod];
            const active = issues.filter(i => issueStatus[i.id] === 'open').length;
            const total = issues.length;
            const isSelected = selectedModule === mod;
            
            return (
              <button
                key={mod}
                onClick={() => setSelectedModule(mod)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                  isSelected 
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shadow-sm' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md ${isSelected ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500 group-hover:text-slate-400'}`}>
                    <Folder className="w-4 h-4" />
                  </div>
                  <span className="font-medium tracking-wide">{mod}</span>
                </div>
                
                <div className="flex items-center gap-3">
                  {active === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500/70" />
                  ) : (
                    <AnimatedCount count={active} isSelected={isSelected} />
                  )}
                  <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-500 opacity-0 group-hover:opacity-100'}`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
