import { create } from 'zustand';

const API_BASE = 'http://localhost:8002';

// ────────────────────────────────────────────────────────────────────
// TYPES (from real backend schemas)
// ────────────────────────────────────────────────────────────────────

export interface DocumentSummary {
  doc_id: string;
  stories: number;
  actors: string[];
  issues: number;
  original_issues?: number;
  has_intelligence: boolean;
  has_issues: boolean;
}

export interface LogicBlock {
  type: string;
  trigger: Record<string, any> | null;
  condition: string | null;
  action: Record<string, any> | null;
  result: string | null;
  confidence: number;
}

export interface ACNode {
  text: string;
  type: string;
  level: number;
  children: ACNode[];
  logic: LogicBlock[];
}

export interface UserStory {
  id: string;
  role: string;
  goal: string;
  reason: string | null;
  confidence: number;
  acceptance_criteria: ACNode[];
  raw_text: string;
}

export interface IntelligenceModel {
  document_name: string;
  actors: string[];
  user_stories: UserStory[];
  metadata: Record<string, any>;
}

export interface AmbiguityIssue {
  id: string;
  story_id: string;
  text: string;
  term: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  suggested_rewrite: string;
}

export interface ConflictIssue {
  id: string;
  stories: string[];
  severity: 'high' | 'medium';
  category: string;
  description: string;
  details: string[];
  confidence: number;
  source: 'rule' | 'embedding' | 'llm';
  explanation: string;
  rule_a: any;
  rule_b: any;
  trace?: any[];
  similarity?: number;
  confidence_breakdown?: {
    rule: number;
    embedding: number;
    llm: number;
  };
}

export interface GapIssue {
  id: string;
  story_id: string;
  severity: 'medium' | 'low';
  category: string;
  description: string;
  recommendation: string;
}

export interface IssuesReport {
  document_name: string;
  total_ambiguities: number;
  total_conflicts: number;
  total_gaps: number;
  ambiguities: AmbiguityIssue[];
  conflicts: ConflictIssue[];
  gaps: GapIssue[];
  metadata: Record<string, any>;
}

// ────────────────────────────────────────────────────────────────────
// STORE
// ────────────────────────────────────────────────────────────────────

interface DocumentState {
  // Connection
  isLoading: boolean;
  error: string | null;
  uploadProgress: string | null;
  uploadProgressPercent: number;
  uploadActiveStage: string | null;

  // Data
  documents: DocumentSummary[];
  currentDocId: string | null;
  intelligence: IntelligenceModel | null;
  issues: IssuesReport | null;

  // Workspace Triage State
  issueStatus: Record<string, "open" | "resolved" | "ignored">;
  selectedIssueId: string | null;
  selectedModule: string | null;
  
  // Patching & Memory State
  patchedRequirements: Record<string, string>;
  issueToRequirementMap: Record<string, string>;
  patchHistory: Array<{ reqId: string, oldText: string, newText: string }>;
  hasUnsavedChanges: boolean;

  // Actions
  fetchDocuments: () => Promise<void>;
  selectDocument: (docId: string) => Promise<void>;
  uploadPdf: (file: File) => Promise<{ status: 'duplicate' | 'success', docId: string }>;
  deleteDocument: (docId: string) => Promise<void>;
  clearError: () => void;
  
  // Triage Actions
  resolveIssue: (id: string) => void;
  ignoreIssue: (id: string) => void;
  applyFix: (reqId: string, newText: string) => void;
  resolveModule: (moduleId: string) => void;
  setSelectedIssue: (id: string | null) => void;
  setSelectedModule: (moduleId: string | null) => void;
  clearUnsavedChanges: () => void;

  // Getters
  getIssueStatus: (id: string) => "open" | "resolved" | "ignored";
  getGroupedIssuesByModule: () => Record<string, any[]>;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  isLoading: false,
  error: null,
  uploadProgress: null,
  uploadProgressPercent: 0,
  uploadActiveStage: null,
  documents: [],
  currentDocId: null,
  intelligence: null,
  issues: null,

  issueStatus: {},
  selectedIssueId: null,
  selectedModule: null,
  patchedRequirements: {},
  issueToRequirementMap: {},
  patchHistory: [],
  hasUnsavedChanges: false,

  clearError: () => set({ error: null }),

  deleteDocument: async (docId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/document/${encodeURIComponent(docId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete document: ${res.statusText}`);
      // Remove from local list immediately, and clear state if it was selected
      set(state => ({
        documents: state.documents.filter(d => d.doc_id !== docId),
        currentDocId: state.currentDocId === docId ? null : state.currentDocId,
        intelligence: state.currentDocId === docId ? null : state.intelligence,
        issues: state.currentDocId === docId ? null : state.issues,
      }));
      localStorage.removeItem(`srs_clarity_state_${docId}`);
    } catch (e: any) {
      set({ error: e.message });
    }
  },


  fetchDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/documents`);
      if (!res.ok) throw new Error(`Failed to fetch documents: ${res.statusText}`);
      const data = await res.json();
      
      // Update issues count with local resolution state
      const updatedDocuments = data.documents.map((doc: any) => {
        const savedStateStr = localStorage.getItem(`srs_clarity_state_${doc.doc_id}`);
        let resolvedCount = 0;
        if (savedStateStr) {
           try {
              const savedState = JSON.parse(savedStateStr);
              if (savedState.issueStatus) {
                 resolvedCount = Object.values(savedState.issueStatus).filter(s => s === 'resolved' || s === 'ignored').length;
              }
           } catch(e) {}
        }
        return {
          ...doc,
          issues: Math.max(0, doc.issues - resolvedCount),
          original_issues: doc.issues
        };
      });

      set({ documents: updatedDocuments, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  selectDocument: async (docId: string) => {
    set({ isLoading: true, error: null, currentDocId: docId });
    try {
      const [intelRes, issuesRes] = await Promise.all([
        fetch(`${API_BASE}/api/document/${encodeURIComponent(docId)}/intelligence`),
        fetch(`${API_BASE}/api/document/${encodeURIComponent(docId)}/issues`),
      ]);

      const intelligence = intelRes.ok ? await intelRes.json() : null;
      const issues = issuesRes.ok ? await issuesRes.json() : null;

      // Build issueToRequirementMap and reset triage state
      const map: Record<string, string> = {};
      const status: Record<string, "open"> = {};
      
      if (issues) {
        issues.ambiguities?.forEach((a: any) => {
           map[a.id] = a.story_id;
           status[a.id] = "open";
        });
        issues.gaps?.forEach((g: any) => {
           map[g.id] = g.story_id;
           status[g.id] = "open";
        });
        issues.conflicts?.forEach((c: any) => {
           // A conflict links to multiple stories, we map it to the first one for simplicity 
           // but applyFix will need to handle multiple if necessary, or just rely on the map
           if (c.stories && c.stories.length > 0) {
              map[c.id] = c.stories[0];
           }
           status[c.id] = "open";
        });
      }

      // Check for saved local state
      const savedStateStr = localStorage.getItem(`srs_clarity_state_${docId}`);
      let finalPatchedRequirements: Record<string, string> = {};
      let finalPatchHistory: any[] = [];
      
      if (savedStateStr) {
         try {
            const savedState = JSON.parse(savedStateStr);
            if (savedState.patchedRequirements) finalPatchedRequirements = savedState.patchedRequirements;
            if (savedState.patchHistory) finalPatchHistory = savedState.patchHistory;
            if (savedState.issueStatus) {
               // Merge saved statuses, overriding the default "open" state
               Object.assign(status, savedState.issueStatus);
            }
         } catch(e) {
            console.error("Failed to parse saved state", e);
         }
      }

      set({ 
        intelligence, 
        issues, 
        isLoading: false,
        issueStatus: status,
        selectedIssueId: null,
        selectedModule: null,
        patchedRequirements: finalPatchedRequirements,
        issueToRequirementMap: map,
        patchHistory: finalPatchHistory,
        hasUnsavedChanges: Object.keys(finalPatchedRequirements).length > 0
      });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  uploadPdf: async (file) => {
    const docId = file.name.replace(/\.[^/.]+$/, ""); // basic stem
    const isDuplicate = get().documents.some(d => d.doc_id === docId);
    
    if (isDuplicate) {
      return { status: 'duplicate', docId };
    }

    set({ isLoading: true, error: null, uploadProgress: 'Uploading document...', uploadProgressPercent: 0, uploadActiveStage: 'Parsing Document' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      const uploadedDocId: string = data.doc_id;

      // --- Real-time polling ---
      await new Promise<void>((resolve, reject) => {
        const startTime = Date.now();
        const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
        let lastPercent = 0;
        let staleSince = Date.now();

        const pollInterval = setInterval(async () => {
          try {
            // Timeout guard
            if (Date.now() - startTime > TIMEOUT_MS) {
              clearInterval(pollInterval);
              reject(new Error('Processing timed out after 10 minutes.'));
              return;
            }

            const statusRes = await fetch(`${API_BASE}/api/document/${encodeURIComponent(uploadedDocId)}/status`);
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();

            const { status, stage, message, percent } = statusData;

            // Stall detection: if percent hasn't changed in 5s, show stall message
            if (percent !== undefined && percent !== lastPercent) {
              lastPercent = percent;
              staleSince = Date.now();
            }
            const isStalled = Date.now() - staleSince > 5000;
            const displayMessage = isStalled
              ? 'Still processing... this may take a few moments'
              : (message || 'Processing...');

            set({
              uploadProgress: displayMessage,
              uploadProgressPercent: percent ?? lastPercent,
              uploadActiveStage: stage ?? null,
            });

            if (status === 'done') {
              set({ uploadProgress: 'Finalizing results...', uploadProgressPercent: 100 });
              clearInterval(pollInterval);
              // Small delay for smooth UX transition
              setTimeout(resolve, 600);
            } else if (status === 'error') {
              // Grace period: "not found in active queue" can be transient during the first
              // few seconds while FastAPI starts the background task. Only fail hard after 15s.
              const isTransientNotFound = (message || '').includes('not found in active queue');
              const elapsed = Date.now() - startTime;
              if (isTransientNotFound && elapsed < 15000) {
                return; // keep polling, it's just not started yet
              }
              clearInterval(pollInterval);
              reject(new Error(message || 'Pipeline processing error'));
            }
          } catch (pollErr) {
            // Non-fatal: network hiccup during polling, keep trying
            console.warn('Status poll error (retrying):', pollErr);
          }
        }, 1500);
      });

      await get().fetchDocuments();
      await get().selectDocument(uploadedDocId);

      return { status: 'success', docId: uploadedDocId };
    } catch (err: any) {
      set({ error: err.message || 'Upload failed' });
      throw err;
    } finally {
      set({ isLoading: false, uploadProgress: null, uploadProgressPercent: 0, uploadActiveStage: null });
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // WORKSPACE TRIAGE ACTIONS
  // ────────────────────────────────────────────────────────────────────
  
  resolveIssue: (id) => set((state) => {
    const newStatus: Record<string, "open" | "resolved" | "ignored"> = { ...state.issueStatus, [id]: "resolved" };
    const moduleIssues = state.getGroupedIssuesByModule()[state.selectedModule || ""] || [];
    const nextIssue = moduleIssues.find(i => newStatus[i.id] === 'open');
    
    if (state.currentDocId) {
       localStorage.setItem(`srs_clarity_state_${state.currentDocId}`, JSON.stringify({
         patchedRequirements: state.patchedRequirements,
         issueStatus: newStatus,
         patchHistory: state.patchHistory
       }));
    }
    
    return { issueStatus: newStatus, selectedIssueId: nextIssue ? nextIssue.id : null };
  }),
  
  ignoreIssue: (id) => set((state) => {
    const newStatus: Record<string, "open" | "resolved" | "ignored"> = { ...state.issueStatus, [id]: "ignored" };
    const moduleIssues = state.getGroupedIssuesByModule()[state.selectedModule || ""] || [];
    const nextIssue = moduleIssues.find(i => newStatus[i.id] === 'open');
    
    if (state.currentDocId) {
       localStorage.setItem(`srs_clarity_state_${state.currentDocId}`, JSON.stringify({
         patchedRequirements: state.patchedRequirements,
         issueStatus: newStatus,
         patchHistory: state.patchHistory
       }));
    }

    return { issueStatus: newStatus, selectedIssueId: nextIssue ? nextIssue.id : null };
  }),
  
  setSelectedIssue: (id) => set({ selectedIssueId: id }),
  
  setSelectedModule: (moduleId) => set({ selectedModule: moduleId }),
  
  applyFix: (reqId, newText) => set((state) => {
    // Find original text
    const story = state.intelligence?.user_stories.find(s => s.id === reqId);
    const oldText = state.patchedRequirements[reqId] || story?.raw_text || "";
    
    // Resolve all issues linked to this requirement
    const newStatus: Record<string, "open" | "resolved" | "ignored"> = { ...state.issueStatus };
    Object.entries(state.issueToRequirementMap).forEach(([issueId, mappedReqId]) => {
       if (mappedReqId === reqId || (state.issues?.conflicts?.find(c => c.id === issueId)?.stories?.includes(reqId))) {
           newStatus[issueId] = "resolved";
       }
    });

    const moduleIssues = state.getGroupedIssuesByModule()[state.selectedModule || ""] || [];
    const nextIssue = moduleIssues.find(i => newStatus[i.id] === 'open');

    const newPatchedRequirements = { ...state.patchedRequirements, [reqId]: newText };
    const newPatchHistory = [...state.patchHistory, { reqId, oldText, newText }];

    if (state.currentDocId) {
       localStorage.setItem(`srs_clarity_state_${state.currentDocId}`, JSON.stringify({
         patchedRequirements: newPatchedRequirements,
         issueStatus: newStatus,
         patchHistory: newPatchHistory
       }));
    }

    return {
      patchedRequirements: newPatchedRequirements,
      issueStatus: newStatus,
      patchHistory: newPatchHistory,
      hasUnsavedChanges: true,
      selectedIssueId: nextIssue ? nextIssue.id : null
    };
  }),

  resolveModule: (moduleId) => set((state) => {
    const newStatus: Record<string, "open" | "resolved" | "ignored"> = { ...state.issueStatus };
    const issues = state.getGroupedIssuesByModule()[moduleId] || [];
    issues.forEach(issue => {
      newStatus[issue.id] = "resolved";
    });
    if (state.currentDocId) {
       localStorage.setItem(`srs_clarity_state_${state.currentDocId}`, JSON.stringify({
         patchedRequirements: state.patchedRequirements,
         issueStatus: newStatus,
         patchHistory: state.patchHistory
       }));
    }

    return { issueStatus: newStatus };
  }),

  clearUnsavedChanges: () => set({ hasUnsavedChanges: false }),

  getIssueStatus: (id) => {
    return get().issueStatus[id] || "open";
  },

  getGroupedIssuesByModule: () => {
    const state = get();
    const groups: Record<string, any[]> = {};
    
    const extractModule = (id: string) => {
      const match = id.match(/-([A-Z]+)-/);
      return match ? match[1] : "GENERAL";
    };

    const addIssue = (issue: any, reqId: string) => {
      const mod = extractModule(reqId);
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(issue);
    };

    state.issues?.ambiguities?.forEach(a => addIssue({ ...a, _type: 'ambiguity' }, a.story_id));
    state.issues?.gaps?.forEach(g => addIssue({ ...g, _type: 'gap' }, g.story_id));
    state.issues?.conflicts?.forEach(c => {
      // Use the first story's module for grouping, or GENERAL
      const mod = c.stories && c.stories.length > 0 ? extractModule(c.stories[0]) : "GENERAL";
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push({ ...c, _type: 'conflict' });
    });

    return groups;
  }
}));
