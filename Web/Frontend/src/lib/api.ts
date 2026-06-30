// Safe localStorage access
const getSafeStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const SRS_API_BASE_URL = (import.meta.env.VITE_SRS_API_URL as string) || 'http://localhost:8001';
const SATELLITE_BASE_URL = `${(import.meta.env.VITE_SATELLITE_URL as string) || 'http://localhost:8003'}/api/satellite`;
import { api } from "./http";

/* ===================== TYPES ===================== */

export interface Project {
  id: string;
  name: string;

  // --- NEW BANNER FIELDS ---
  purpose: string;
  success_criteria: string;
  constraints: string;
  owner?: string | null;

  created_at: string;
  updated_at: string;
}


export interface Chat {
  id: string;
  project_id: string;
  title?: string;
  source_type?: string;
  external_chat_id?: string;

  pinned: boolean;
  archived: boolean;

  purpose: string;
  phase?: string | null;
  description?: string | null;
  owner?: string | null;

  created_at: string;
  updated_at: string;
}



export interface Message {
  id: string;
  chat_id: string;

  role: 'user' | 'assistant' | 'system' | 'moderator' | 'synthesis' | null ;
  sender: string | null;

  text: string;

  // --- true content type (format/media/category)
  type?: string | null;   

  // --- topic classification (optional NLP)
  topic?: string | null;

  // --- NEW: signal quality score ---
  signal_level?: 'high' | 'medium' | 'low' | 'noise' | null;
  synthesis_id?: string;


  include_in_summary: boolean;
  accepted: boolean;

  has_attachments?: boolean;
  attachments_json?: string | null;

  source_message_id?: string | null;

  created_at: string;
  ingested_at: string;

  reply_group_id?: string | null;
}



export interface CreateProjectPayload {
  name: string;
  purpose: string;
  success_criteria: string;
  constraints: string;
  owner?: string | null;
  visibility?: string;
}



export interface CreateChatPayload {
  title: string;
  source_type: string;

  purpose?: string;
  phase?: string;
  description?: string;
  owner?: string;
}


export interface CreateMessagePayload {
  role: 'user' | 'assistant' | 'system' | 'moderator';
  sender: string;
  text: string;
}


/* ===================== PROJECTS ===================== */

export async function getProjects(): Promise<Project[]> {
  return api<Project[]>('/projects');
}

export async function getPublicProjects(search?: string): Promise<Project[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  try {
    return await api<Project[]>(`/projects/public${params}`);
  } catch {
    return [];
  }
}

export async function searchProjects(query: { projectId: string }): Promise<Project[]> {
  const params = new URLSearchParams();
  params.append("project_id", query.projectId);
  return api<Project[]>(`/projects/search?${params.toString()}`);
}

export async function requestToJoinProject(projectId: string): Promise<{ status: string }> {
  return api<{ status: string }>(`/projects/${projectId}/join`, {
    method: "POST"
  });
}

export async function getJoinRequests(projectId: string): Promise<any[]> {
  return api<any[]>(`/projects/${projectId}/join-requests`);
}

export async function updateJoinRequest(requestId: string, status: string): Promise<any> {
  return api<any>(`/join-requests/${requestId}?status=${status}`, {
    method: "PATCH"
  });
}

export async function inviteToProject(projectId: string, userEmail: string): Promise<any> {
  return api<any>(`/projects/${projectId}/invite`, {
    method: "POST",
    body: JSON.stringify({ user_email: userEmail }),
    headers: { "Content-Type": "application/json" }
  });
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  // No demo-mode fakery on writes: if the backend is unreachable this must fail
  // loudly, never return synthetic success (§3.1 — silent data loss).
  return api<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


export async function deleteProject(projectId: string): Promise<void> {
  await api<void>(`/projects/${projectId}`, { method: 'DELETE' });
}

/* ===================== MEMBERS ===================== */

export interface ProjectMember {
  id: string;
  project_id: string;
  user_email: string;
  role: 'owner' | 'pm' | 'member' | 'viewer';
}

export interface ActivityLog {
  id: string;
  actor_email: string;
  action: string;
  details?: string;
  created_at: string;
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return api<ProjectMember[]>(`/projects/${projectId}/members`);
}

export async function updateMemberRole(projectId: string, userEmail: string, role: string): Promise<any> {
  return api<any>(`/projects/${projectId}/members/${encodeURIComponent(userEmail)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(projectId: string, userEmail: string): Promise<any> {
  return api<any>(`/projects/${projectId}/members/${encodeURIComponent(userEmail)}`, {
    method: 'DELETE',
  });
}

export async function getActivityLogs(projectId: string): Promise<ActivityLog[]> {
  return api<ActivityLog[]>(`/projects/${projectId}/activity`);
}

/* ===================== CHATS ===================== */


export async function getChats(projectId: string): Promise<Chat[]> {
  return api<Chat[]>(`/projects/${projectId}/chats`);
}
export async function createChat(
  projectId: string,
  payload: {
    title: string;
    source_type: string;
    purpose?: string;
    phase?: string;
    description?: string;
    owner?: string;
  }
): Promise<Chat> {

  // No demo-mode fakery on writes (§3.1).
  return api<Chat>(`/projects/${projectId}/chats`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


/* ===================== MESSAGES ===================== */

export async function getMessages(chatId: string): Promise<Message[]> {
  return api<Message[]>(`/chats/${chatId}/messages`);
}
export async function createMessage(chatId: string, payload: CreateMessagePayload): Promise<Message> {
  // No demo-mode fakery on writes (§3.1).
  return api<Message>(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


/* ===================== AUTH HELPERS ===================== */

/** Return the logged-in user's email from localStorage (for display only). Security is enforced by httpOnly cookies. */
export function getCurrentUserEmail(): string | null {
  return getSafeStorage("cs_email");
}


// 🚨 ADD THIS — Delete Chat
export async function deleteChat(chatId: string): Promise<void> {
  // No demo-mode fakery on writes (§3.1).
  await api(`/chats/${chatId}`, {
    method: 'DELETE',
  });
}

export async function renameChat(chatId: string, title: string) {
  return api(`/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function togglePinChat(chatId: string, pinned: boolean) {
  return api(`/chats/${chatId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  });
}

export async function toggleArchiveChat(chatId: string, archived: boolean) {
  return api(`/chats/${chatId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

// --- ARCHIVE CHAT ---

export async function archiveChat(chatId: string, archived: boolean) {
  return api(`/chats/${chatId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

export async function getArchivedChats(projectId: string): Promise<Chat[]> {
  return api<Chat[]>(`/projects/${projectId}/chats/archived`);
}

export async function setMessageAccepted(id: string, accepted: boolean) {
  return api(`/messages/${id}/accept`, {
    method: "POST",
    body: JSON.stringify({ accepted }),
  });
}

export async function getChat(chatId: string): Promise<Chat> {
  return api<Chat>(`/chats/${chatId}`);
}

export async function updateChat(
  chatId: string,
  payload: Partial<Chat>
): Promise<Chat> {
  return api<Chat>(`/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({
      purpose: payload.purpose ?? null,
      phase: payload.phase ?? null,
      description: payload.description ?? null,
      owner: payload.owner ?? null
    }),
  });
}





export async function setMessageIncludeSummary(messageId: string, include: boolean) {
  return api(`/messages/${messageId}/include`, {
    method: "PATCH",
    body: JSON.stringify({ include })
  });
}

export async function askChat(chatId: string, sender: string, text: string, askAnyway = false) {
  // §16.5 ask_anyway: relax the conservative CONFLICT gate on an explicit retry so a
  // valid answer isn't held back. Default false keeps the gate on.
  return api<any>(`/chats/${chatId}/ask`, {
    method: "POST",
    body: JSON.stringify({ sender, text, ask_anyway: askAnyway }),
  });
}

export async function getProject(projectId: string): Promise<Project> {
  return api<Project>(`/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  payload: Partial<Project>
): Promise<Project> {
  return api<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAcceptedMessages(chatId: string): Promise<Message[]> {
  return api<Message[]>(`/chats/${chatId}/accepted`);
}


/* ===================== SYNTHESIS ===================== */

export interface Synthesis {
  id: string;
  chat_id: string;
  reply_group_id: string;
  content: string;
  model_used?: string | null;
}

/** Get all syntheses for a chat */
export async function getChatSyntheses(chatId: string): Promise<Synthesis[]> {
  return api<Synthesis[]>(`/chats/${chatId}/synthesis`);
}

/** Get synthesis for one reply group */
export async function getSynthesisForGroup(
  chatId: string,
  replyGroupId: string
): Promise<Synthesis> {
  return api<Synthesis>(`/chats/${chatId}/synthesis/${replyGroupId}`);
}

/** Force regeneration */
export async function generateSynthesis(
  chatId: string,
  replyGroupId: string
): Promise<Synthesis> {
  return api<Synthesis>(`/chats/${chatId}/synthesis/generate`, {
    method: "POST",
    body: JSON.stringify({ reply_group_id: replyGroupId }),
  });
}

/* ===================== DISAGREEMENT SPOTLIGHT ===================== */

export interface ClaimAnalysis {
  section: string;
  text: string;
  models: string[];
  support: number;
  n_models: number;
  contested: boolean;
  agreement: number | null;
}

export interface DisagreementResult {
  n_models: number;
  models: string[];
  overall: { score: number | null; level: string };
  claims: ClaimAnalysis[];
  contested: ClaimAnalysis[];
}

/** Where the ensemble diverged for one reply group (recomputed from stored blocks). */
export async function getDisagreement(
  chatId: string,
  replyGroupId: string
): Promise<DisagreementResult> {
  return api<DisagreementResult>(`/chats/${chatId}/synthesis/${replyGroupId}/disagreement`);
}

/* ===================== DEVIL'S ADVOCATE (§17.2) ===================== */

export interface DevilsAdvocateChallenge {
  category: 'RISK' | 'ASSUMPTION' | 'FAILURE_MODE' | 'COUNTERPOINT';
  text: string;
}

export interface DevilsAdvocateResult {
  decision: string[];
  challenges: DevilsAdvocateChallenge[];
  model: string | null;
  n_challenges: number;
  note?: 'no_decision' | 'unstructured_response' | null;
}

/** On-demand red-team of a decision. Triggers one paid LLM call (members-only). */
export async function getDevilsAdvocate(
  chatId: string,
  replyGroupId: string
): Promise<DevilsAdvocateResult> {
  return api<DevilsAdvocateResult>(`/chats/${chatId}/synthesis/${replyGroupId}/devils-advocate`);
}

/* ===================== WHY THIS DECISION? — grounded trace (§17.4) ===================== */

export interface DecisionLink {
  relation: string;
  phrase: string;
  section: string;
  content: string;
  node_id: string;
  shared_terms: string[];
}

export interface DecisionTraceItem {
  decision_id: string;
  synthesis_id: string | null;
  decision: string;
  confidence: number | null;
  links: DecisionLink[];
  n_links: number;
}

/** Edge-grounded "why" for each decision in a chat (no model call). */
export async function getDecisionTrace(chatId: string): Promise<{ decisions: DecisionTraceItem[] }> {
  return api<{ decisions: DecisionTraceItem[] }>(`/chats/${chatId}/decision-trace`);
}

/* ===================== DECISION READINESS (§17.5) ===================== */

export interface ResolveStep {
  kind: 'BLOCKS' | 'CONTRADICTS' | 'DEPENDS_ON';
  action: string;
  content: string;
  node_id: string | null;
  unlocks: number;
}

export interface DecisionReadiness {
  decision_id: string;
  synthesis_id: string | null;
  decision: string;
  readiness: number;          // 0..1
  band: 'ready' | 'forming' | 'exploratory';
  agreement: number | null;   // measured inter-model agreement (§10.3)
  evidence: { support: number; conflict: number; blocker: number; depends_on: number };
  resolve_path: ResolveStep[];
  n_to_resolve: number;
}

/** Per-decision readiness verdict + cheapest resolve-path (no model call). */
export async function getDecisionReadiness(chatId: string): Promise<{ decisions: DecisionReadiness[] }> {
  return api<{ decisions: DecisionReadiness[] }>(`/chats/${chatId}/decision-readiness`);
}

/* ===================== SATELLITE SERVICE ===================== */

async function fetchSatellite<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // §1.7 Delegate to api() for Core auth endpoints; use direct fetch for Satellite.
  // On 401, we attempt a silent refresh via api() for consistency.
  const { getCookie } = await import("./http");
  const csrfToken = getCookie("csrf_token");
  
  const response = await fetch(`${SATELLITE_BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include", // auto-send httpOnly cookies
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    // §1.7 Silent Refresh: on 401, trigger a refresh via the core api() and retry.
    if (response.status === 401) {
      try {
        const { api } = await import("./http");
        // This triggers the silent refresh in http.ts
        await api("/api/auth/refresh", { method: "POST" });
        // Retry Satellite request after refresh
        return fetchSatellite<T>(endpoint, options);
      } catch {
        window.location.href = "/login";
        throw new Error("Session expired. Please log in again.");
      }
    }

    let errorData;
    try {
      errorData = await response.json();
    } catch {
      const text = await response.text();
      errorData = { message: text };
    }

    const err = new Error(errorData.message || `Satellite Error: ${response.status}`);
    (err as any).status = response.status;
    (err as any).data = errorData;
    throw err;
  }

  return response.json();
}

// -- Knowledge Graph --
export async function getKnowledgeGraph(projectId: string) {
  return fetchSatellite<any>(`/kg/${projectId}`);
}

export async function snapshotKnowledgeGraph(projectId: string) {
  return fetchSatellite<any>(`/kg/${projectId}/snapshot`, { method: "POST" });
}

export async function getKnowledgeGraphFocus(projectId: string, nodeId: string) {
  return fetchSatellite<any>(`/kg/${projectId}/focus/${nodeId}`);
}

// -- Deltas --
export async function getDeltas(projectId: string) {
  return fetchSatellite<any[]>(`/delta/${projectId}`);
}

export async function computeDelta(projectId: string) {
  return fetchSatellite<any>(`/delta/${projectId}/compute`, { method: "POST" });
}

export async function getLatestDelta(projectId: string) {
  return fetchSatellite<any>(`/delta/${projectId}/latest`);
}

// -- Temporal Cards --
export async function getTemporalCards(projectId: string) {
  return fetchSatellite<any[]>(`/cards/${projectId}`);
}

export async function generateTemporalCard(projectId: string) {
  return fetchSatellite<any>(`/cards/${projectId}/generate`, { method: "POST" });
}

// §15.14: generate a card from a SPECIFIC delta (the one the user selected), not the latest.
export async function generateCardFromDeltaId(projectId: string, deltaId: string) {
  return fetchSatellite<any>(`/cards/${projectId}/generate/delta/${deltaId}`, { method: "POST" });
}

export async function generateCardFromChat(projectId: string, chatId: string, label?: string) {
  return fetchSatellite<any>(`/cards/${projectId}/generate/chat/${chatId}`, {
    method: "POST",
    body: JSON.stringify(label ? { label } : {}),
  });
}

export async function generateCardByLabel(projectId: string, label: string) {
  return fetchSatellite<any>(`/cards/${projectId}/generate/label/${label}`, { method: "POST" });
}

export async function autoGenerateCards(projectId: string, force = false) {
  return fetchSatellite<any>(`/cards/${projectId}/auto-generate`, { 
    method: "POST",
    body: JSON.stringify({ force })
  });
}

export async function getCardsByLabel(projectId: string, label: string) {
  return fetchSatellite<any[]>(`/cards/${projectId}/label/${label}`);
}

export async function getExpiredCards(projectId: string) {
  return fetchSatellite<any[]>(`/cards/${projectId}/expired`);
}

export async function refreshCard(projectId: string, cardId: string) {
  return fetchSatellite<any>(`/cards/${projectId}/${cardId}/refresh`, { method: "POST" });
}

export async function applyKGUpdates(projectId: string, cardId: string) {
  return fetchSatellite<any>(`/cards/${projectId}/${cardId}/update-kg`, { method: "POST" });
}

export async function deleteTemporalCard(cardId: string) {
  return fetchSatellite<any>(`/cards/${cardId}`, { method: "DELETE" });
}

export async function editCard(
  projectId: string,
  cardId: string,
  payload: { title: string; summary: string; version?: number }
) {
  return fetchSatellite<any>(`/cards/${projectId}/${cardId}/edit`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getCardHistory(projectId: string, cardId: string) {
  return fetchSatellite<any[]>(`/cards/${projectId}/history/${cardId}`);
}

// -- Export (README, UML, PPT) --
export async function exportReadme(projectId: string) {
  return fetchSatellite<{content: string}>(`/export/${projectId}/readme`);
}

export async function exportUml(projectId: string) {
  return fetchSatellite<{content: string}>(`/export/${projectId}/uml`);
}

export async function exportPpt(projectId: string) {
  return fetchSatellite<{content: string}>(`/export/${projectId}/ppt`);
}

// -- Discovery & Social --
export async function getFollowing() {
  return fetchSatellite<string[]>(`/discovery/following`);
}

export async function followProject(projectId: string) {
  return fetchSatellite<any>(`/discovery/follow/${projectId}`, { method: "POST" });
}

export async function unfollowProject(projectId: string) {
  return fetchSatellite<any>(`/discovery/unfollow/${projectId}`, { method: "DELETE" });
}

export async function getDiscoveryFeed() {
  return fetchSatellite<any[]>(`/discovery/feed`);
}

// -- Collaborative Editor API --
const EDITOR_BASE_URL = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;

export async function createEditorWorkspace(name: string, sections?: any[]) {
  const { getCookie } = await import("./http");
  const csrfToken = getCookie("csrf_token");
  const res = await fetch(`${EDITOR_BASE_URL}/workspace`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
    },
    body: JSON.stringify({ name, sections, is_public: true })
  });
  if (!res.ok) throw new Error('Failed to create editor workspace');
  return res.json();
}

export async function generateUML(content: string, type: 'usecase' | 'activity' | 'dfd') {
  return fetchSatellite<{ mermaid: string }>(`/generate/uml`, {
    method: 'POST',
    body: JSON.stringify({ content, type })
  });
}

// -- Join Flow --
export async function sendJoinEmail(projectId: string) {
  return fetchSatellite<any>(`/join/${projectId}/email`, { method: "POST" });
}
