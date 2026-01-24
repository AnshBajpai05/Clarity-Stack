const API_BASE_URL = 'http://127.0.0.1:8000';

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

  role: 'user' | 'assistant' | 'system' | 'moderator' | null;
  sender: string | null;

  text: string;

  // --- true content type (format/media/category)
  type?: string | null;   

  // --- topic classification (optional NLP)
  topic?: string | null;

  // --- NEW: signal quality score ---
  signal_level?: 'high' | 'medium' | 'low' | 'noise' | null;

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

/* ===================== API CORE ===================== */

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/* ===================== PROJECTS ===================== */

export async function getProjects(): Promise<Project[]> {
  try {
    const result = await fetchApi<Project[]>('/projects');
    useDemoMode = false;
    return result;
  } catch {
    console.log('API unavailable, using demo mode');
    useDemoMode = true;
    return [...mockProjects];
  }
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

  return fetchApi<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


/* ===================== CHATS ===================== */

export async function getChats(projectId: string): Promise<Chat[]> {
  if (useDemoMode) return mockChats[projectId] || [];
  return fetchApi<Chat[]>(`/projects/${projectId}/chats`);
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

  return fetchApi<Chat>(`/projects/${projectId}/chats`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


/* ===================== MESSAGES ===================== */

export async function getMessages(chatId: string): Promise<Message[]> {
  if (useDemoMode) {
    return [...(mockMessages[chatId] || [])].reverse(); // newest first
  }

  return fetchApi<Message[]>(`/chats/${chatId}/messages`);
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

  return fetchApi<Message>(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


/* ===================== MODE FLAG ===================== */

export function isDemoMode(): boolean {
  return useDemoMode;
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

  await fetchApi(`/chats/${chatId}`, {
    method: 'DELETE',
  });
}

export async function renameChat(chatId: string, title: string) {
  return fetchApi(`/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function togglePinChat(chatId: string, pinned: boolean) {
  return fetchApi(`/chats/${chatId}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  });
}

export async function toggleArchiveChat(chatId: string, archived: boolean) {
  return fetchApi(`/chats/${chatId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

// --- ARCHIVE CHAT ---

export async function archiveChat(chatId: string, archived: boolean) {
  return fetchApi(`/chats/${chatId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

export async function getArchivedChats(projectId: string): Promise<Chat[]> {
  return fetchApi<Chat[]>(`/projects/${projectId}/chats/archived`);
}

export async function setMessageAccepted(id: string, accepted: boolean) {
  return fetchApi(`/messages/${id}/accept`, {
    method: "POST",
    body: JSON.stringify({ accepted }),
  });
}

export async function getChat(chatId: string): Promise<Chat> {
  return fetchApi<Chat>(`/chats/${chatId}`);
}

export async function updateChat(
  chatId: string,
  payload: Partial<Chat>
): Promise<Chat> {

  return fetch(`${API_BASE_URL}/chats/${chatId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      purpose: payload.purpose ?? null,
      phase: payload.phase ?? null,
      description: payload.description ?? null,
      owner: payload.owner ?? null
    }),
  }).then(r => r.json());
}





export async function setMessageIncludeSummary(messageId: string, include: boolean) {
  return fetchApi(`/messages/${messageId}/include`, {
    method: "PATCH",
    body: JSON.stringify({ include })
  });
}

export async function askChat(chatId: string, sender: string, text: string) {
  return fetchApi(`/chats/${chatId}/ask`, {
    method: "POST",
    body: JSON.stringify({ sender, text })
  });
}

export async function getProject(projectId: string): Promise<Project> {
  return fetchApi<Project>(`/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  payload: Partial<Project>
): Promise<Project> {
  return fetchApi<Project>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAcceptedMessages(chatId: string): Promise<Message[]> {
  return fetchApi<Message[]>(`/chats/${chatId}/accepted`);
}
