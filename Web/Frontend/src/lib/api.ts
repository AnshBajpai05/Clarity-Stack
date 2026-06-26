// Safe localStorage access
const getSafeStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const SRS_API_BASE_URL = (import.meta.env.VITE_SRS_API_URL as string) || getSafeStorage('cs_api_url') || 'http://localhost:8001';
const SATELLITE_BASE_URL = `${(import.meta.env.VITE_SATELLITE_URL as string) || 'http://localhost:8003'}/api/satellite`;
import { api } from "./http";


// Demo mode - uses mock data when API is unavailable
let useDemoMode = false;

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


/* ===================== HELPERS ===================== */

function iso(msAgo: number) {
  return new Date(Date.now() - msAgo).toISOString();
}

/* ===================== MOCK DATA ===================== */

const mockProjects: Project[] = [
  {
    id: 'demo-project-1',
    name: 'AI Agent Development',

    purpose: 'Build a multi-model AI assistant that supports structured knowledge workflows.',
    success_criteria: 'Able to ingest chats, create cards, track versions, and support summaries.',
    constraints: 'MVP architecture, small team, rapid iteration.',
    owner: 'ansh',

    created_at: iso(7 * 86400000),
    updated_at: iso(2 * 86400000),
  },
  {
    id: 'demo-project-2',
    name: 'Product Roadmap Q1',

    purpose: 'Plan and validate roadmap priorities for Q1.',
    success_criteria: 'Stakeholder alignment + documented priorities.',
    constraints: 'Time-boxed, roadmap clarity required.',
    owner: 'product-team',

    created_at: iso(14 * 86400000),
    updated_at: iso(86400000),
  },
];


const mockChats: Record<string, Chat[]> = {
  'demo-project-1': [
    
  {
  id: 'demo-chat-1',
  project_id: 'demo-project-1',
  title: 'Architecture Discussion',
  source_type: 'chatgpt',

  purpose: "Discuss core system architecture",
  phase: "Design",
  description: "High-level architecture conversations + trade-offs",
  owner: "ansh",

  created_at: iso(5 * 86400000),
  updated_at: iso(86400000),
  pinned: false,
  archived: false,
},

  {
    id: 'demo-chat-1',
    project_id: 'demo-project-1',
    title: 'Architecture Discussion',
    source_type: 'chatgpt',

    purpose: "Discuss core system architecture",
    phase: "Design",
    description: "High-level architecture conversations + trade-offs",
    owner: "ansh",

    created_at: iso(5 * 86400000),
    updated_at: iso(86400000),
    pinned: false,
    archived: false,
  },

  ],
  'demo-project-2': [
  {
    id: 'demo-chat-1',
    project_id: 'demo-project-1',
    title: 'Architecture Discussion',
    source_type: 'chatgpt',

    purpose: "Discuss core system architecture",
    phase: "Design",
    description: "High-level architecture conversations + trade-offs",
    owner: "ansh",

    created_at: iso(5 * 86400000),
    updated_at: iso(86400000),
    pinned: false,
    archived: false,
  },

  ],
};

const mockMessages: Record<string, Message[]> = {
  'demo-chat-1': [
    {
      id: 'msg-1',
      chat_id: 'demo-chat-1',
      role: 'user',
      sender: 'Alex Chen',
      text: 'What architecture should we use for the new AI agent system?',
      created_at: iso(2 * 3600000),
      ingested_at: iso(2 * 3600000),
      accepted : false,
      include_in_summary : false,
      reply_group_id : 'abc',

    },
    {
      id: 'msg-2',
      chat_id: 'demo-chat-1',
      role: 'assistant',
      sender: 'Claude',
      text: 'I recommend a microservices architecture with event-driven communication...',
      created_at: iso(1.9 * 3600000),
      ingested_at: iso(1.9 * 3600000),
      accepted : false,
      include_in_summary : false,
      reply_group_id : 'abc',
    },
  ],
  'demo-chat-2': [
    {
      id: 'msg-6',
      chat_id: 'demo-chat-2',
      role: 'user',
      sender: 'Jordan',
      text: 'Standup: Finished the API integration yesterday. Today working on tests.',
      created_at: iso(20 * 3600000),
      ingested_at: iso(20 * 3600000),
      accepted : false,
      include_in_summary : false,
      reply_group_id : 'abc',
    },
  ],
  'demo-chat-3': [
    {
      id: 'msg-9',
      chat_id: 'demo-chat-3',
      role: 'user',
      sender: 'Product Manager',
      text: 'We need to prioritize features for Q1...',
      created_at: iso(48 * 3600000),
      ingested_at: iso(48 * 3600000),
      accepted : false,
      include_in_summary : false,
      reply_group_id : 'abc',
    },
  ],
};

/* ===================== PROJECTS ===================== */

export async function getProjects(): Promise<Project[]> {
  try {
    const result = await api<Project[]>('/projects');
    useDemoMode = false;
    return result;
  } catch {
    console.log('API unavailable, using demo mode');
    useDemoMode = true;
    return [...mockProjects];
  }
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
  if (useDemoMode) return [];
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
  if (useDemoMode) {
    const now = new Date().toISOString();

    const newProject: Project = {
      id: `demo-project-${Date.now()}`,
      name: payload.name,

      purpose: payload.purpose || 'Project purpose not yet defined.',
      success_criteria: payload.success_criteria || 'Success criteria not yet defined.',
      constraints: payload.constraints || 'No constraints specified.',
      owner: payload.owner ?? null,

      created_at: now,
      updated_at: now,
    };

    mockProjects.push(newProject);
    mockChats[newProject.id] = [];
    return newProject;
  }

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
  if (useDemoMode) return mockChats[projectId] || [];
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

  if (useDemoMode) {
    const now = new Date().toISOString();

    const newChat: Chat = {
      id: `demo-chat-${Date.now()}`,
      project_id: projectId,
      title: payload.title,
      source_type: payload.source_type,

      purpose: payload.purpose || "Chat purpose not yet defined.",
      phase: payload.phase ?? null,
      description: payload.description ?? null,
      owner: payload.owner ?? null,

      created_at: now,
      updated_at: now,
      pinned: false,
      archived: false,
      external_chat_id: undefined,
    };

    mockChats[projectId] ??= [];
    mockChats[projectId].push(newChat);
    mockMessages[newChat.id] = [];

    return newChat;
  }

  return api<Chat>(`/projects/${projectId}/chats`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


/* ===================== MESSAGES ===================== */

export async function getMessages(chatId: string): Promise<Message[]> {
  if (useDemoMode) {
    return [...(mockMessages[chatId] || [])].reverse(); // newest first
  }

  return api<Message[]>(`/chats/${chatId}/messages`);
}
export async function createMessage(chatId: string, payload: CreateMessagePayload): Promise<Message> {
  if (useDemoMode) {
    const now = new Date().toISOString();

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      chat_id: chatId,

      role: payload.role ?? 'user',
      sender: payload.sender ?? null,

      text: payload.text,

      type: null,
      topic: null,

      include_in_summary: true,
      accepted: false,

      has_attachments: false,
      attachments_json: null,

      source_message_id: null,

      created_at: now,
      ingested_at: now,

      reply_group_id: null,

      signal_level: 'high',   // 👈 ADD THIS (default like DB)
    };

    mockMessages[chatId] ??= [];
    mockMessages[chatId].push(newMessage);

    return newMessage;
  }

  return api<Message>(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


/* ===================== MODE FLAG ===================== */

export function isDemoMode(): boolean {
  return useDemoMode;
}

/* ===================== AUTH HELPERS ===================== */

/** Decode the JWT from localStorage and return the logged-in user's email, or null. */
export function getCurrentUserEmail(): string | null {
  try {
    const token = getSafeStorage("token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}


// 🚨 ADD THIS — Delete Chat
export async function deleteChat(chatId: string): Promise<void> {
  if (useDemoMode) {
    // remove from demo store
    for (const projectId in mockChats) {
      mockChats[projectId] = mockChats[projectId].filter(c => c.id !== chatId);
    }
    delete mockMessages[chatId];
    return;
  }

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

export async function askChat(chatId: string, sender: string, text: string) {
  return api<any>(`/chats/${chatId}/ask`, {
    method: "POST",
    body: JSON.stringify({ sender, text }),
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

/* ===================== SATELLITE SERVICE ===================== */

async function fetchSatellite<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getSafeStorage("token");
  const response = await fetch(`${SATELLITE_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : "",
      ...options?.headers,
    },
  });

  if (!response.ok) {
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
  const token = localStorage.getItem('token');
  const res = await fetch(`${EDITOR_BASE_URL}/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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
