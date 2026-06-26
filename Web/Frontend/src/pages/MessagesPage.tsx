import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MessageSquare, X, ArrowDown } from "lucide-react";

import { MainLayout } from "@/components/layout/MainLayout";
import { MessageBubble } from "@/components/messages/MessageBubble";
import { MessageInput } from "@/components/messages/MessageInput";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";


import {
  Message,
  Chat,
  getMessages,
  createMessage,
  askChat,
  getChat,
  updateChat,
  getChats,          // ✅ REQUIRED FOR FALLBACK
  getProject,
  getProjectMembers,
} from "@/lib/api";
import { api } from "@/lib/http";
import { stringToColor, getInitials } from "@/lib/colors";

import { useToast } from "@/hooks/use-toast";

function utcToIst(dateStr?: string) {
  if (!dateStr) return "Not set";

  const utc = dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(utc));
}


function formatIST(dateStr?: string | null) {
  if (!dateStr) return "Not updated yet";

  try {
    // ⭐ ensure the string is valid ISO + NOT double-Z appended
    const normalized = dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`;

    const d = new Date(normalized);
    if (isNaN(d.getTime())) return "Not updated yet";

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata"
    }).format(d);
  } catch {
    return "Not updated yet";
  }
}



export default function MessagesPage() {

  const { projectId, chatId } = useParams<{ projectId: string; chatId: string }>();

  const [chat, setChat] = useState<Chat | null>(null);   // 🆕 CHAT META
  const [editOpen, setEditOpen] = useState(false);       // 🆕 EDIT MODAL
  const [memberRole, setMemberRole] = useState<'owner'|'pm'|'member'|'viewer'>('member');
  const isViewer = memberRole === 'viewer';

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const [activeSynthesis, setActiveSynthesis] = useState<Message | null>(null);

  // ── Real-Time Presence (WebSocket) ─────────────────────────────────────
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!chatId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const backendHost = (import.meta as any).env?.VITE_BACKEND_URL
      ? new URL((import.meta as any).env.VITE_BACKEND_URL).host
      : `${window.location.hostname}:8000`;
    const wsUrl = `ws://${backendHost}/ws/chats/${chatId}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'presence_sync') {
          setActiveUsers(msg.users || []);
        } else if (msg.type === 'user_joined') {
          setActiveUsers(prev => prev.includes(msg.user) ? prev : [...prev, msg.user]);
        } else if (msg.type === 'user_left') {
          setActiveUsers(prev => prev.filter(u => u !== msg.user));
          setTypingUsers(prev => prev.filter(u => u !== msg.user));
        } else if (msg.type === 'typing_start') {
          setTypingUsers(prev => prev.includes(msg.user) ? prev : [...prev, msg.user]);
          // Auto-clear typing indicator after 3s if no stop received
          if (typingTimers.current[msg.user]) clearTimeout(typingTimers.current[msg.user]);
          typingTimers.current[msg.user] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== msg.user));
          }, 3000);
        } else if (msg.type === 'typing_stop') {
          if (typingTimers.current[msg.user]) clearTimeout(typingTimers.current[msg.user]);
          setTypingUsers(prev => prev.filter(u => u !== msg.user));
        }
      } catch {}
    };

    ws.onerror = () => console.warn('[WS] Chat presence connection error');

    return () => {
      ws.close();
      wsRef.current = null;
      Object.values(typingTimers.current).forEach(clearTimeout);
    };
  }, [chatId]);

  const sendTypingEvent = useCallback((typing: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: typing ? 'typing_start' : 'typing_stop' }));
    }
  }, []);
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeSynthesis) {
      console.log("Clicked synthesis:", activeSynthesis.id);
    }
  }, [activeSynthesis]);




  /* ---------- LOAD CHAT META ---------- */

  /* ---------- LOAD CHAT META ---------- */
  useEffect(() => {
    let isCancelled = false;

    async function loadChat() {
      if (!chatId) return;
      if (editOpen) return;     // ⛔ DO NOT refresh while editing

      try {
        const data = await getChat(chatId);
        if (!isCancelled) setChat(prev =>
          JSON.stringify(prev) === JSON.stringify(data)
            ? prev          // ⚡ avoid useless re-renders
            : data
        );
        
        // Derive role
        const currentUserEmail = localStorage.getItem('cs_email') || '';
        try {
          const pId = data.project_id || projectId;
          if (pId) {
            const proj = await getProject(pId);
            if (proj.owner === currentUserEmail) {
              if (!isCancelled) setMemberRole('owner');
            } else {
              const members = await getProjectMembers(pId);
              const me = members.find(m => m.user_email === currentUserEmail);
              if (me && !isCancelled) setMemberRole(me.role as any);
            }
          }
        } catch {}

        return;
      } catch {
        console.warn("Direct chat fetch failed — falling back");
      }

      try {
        const parts = window.location.pathname.split("/");
        const projectId = parts[2];
        if (!projectId) return;

        const list = await getChats(projectId);
        const found = list.find(c => c.id === chatId);

        if (found && !isCancelled) {
          setChat(prev =>
            JSON.stringify(prev) === JSON.stringify(found)
              ? prev
              : found
          );
        }

      } catch {
        console.warn("Could not load chat details");
      }
    }

    loadChat();                        // 🔹 run once immediately

    const interval = setInterval(() => {
      loadChat();                      // 🔁 refresh — BUT respects editOpen
    }, 4000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };

  }, [chatId, editOpen]);              // 👈 keep this — reopening closes override




  /* ---------- SCROLL HELPERS ---------- */

  const scrollToBottom = (smooth = false) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto"
    });
  };

  const userIsNearBottom = () => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };


  /* ---------- FETCH MESSAGES ---------- */

  const fetchMessages = useCallback(async () => {
    if (!chatId) return;

    try {
      const data = await getMessages(chatId);

      setMessages(data.reverse());
      setError(null);
      setIsLoading(false);

    } catch (err) {

      console.warn("Polling failed — will retry", err);

      // Only show UI error on FIRST load
      setIsLoading(false);

      // ❗ DO NOT CLEAR MESSAGES
      // ❗ DO NOT setError unless nothing has ever loaded
      setError(prev =>
        messages.length === 0
          ? (err instanceof Error ? err.message : "Failed to fetch messages")
          : prev
      );
    }
  }, [chatId, messages.length]);



  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);


  /* ---------- SCROLL ---------- */

  useLayoutEffect(() => {
    if (!isLoading && messages.length > 0) {
      scrollToBottom(false);
    }
  }, [isLoading, messages.length]);


  useEffect(() => {
    if (userIsNearBottom()) {
      scrollToBottom(true);
    }
  }, [messages]);


  useEffect(() => {
    const interval = setInterval(fetchMessages, 4000);
    return () => clearInterval(interval);
  }, [fetchMessages]);


  /* ---------- SEND MESSAGE ---------- */

  const handleSendMessage = async (text: string, role: string, sender: string) => {

    if (!chatId) return;
    setIsSending(true);

    try {
      if (role === "user") {
        await askChat(chatId, sender, text);
      } else {
        await createMessage(chatId, { text, role: role as any, sender });
      }

      await fetchMessages();
      scrollToBottom(true);

    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to send message",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };



  /* ---------- SAVE BANNER ---------- */

  async function handleSaveBanner(values: Partial<Chat>) {
    if (!chatId) return;

    try {
      await updateChat(chatId, values);

      const fresh = await getChat(chatId);   // reload true state
      setChat(fresh);

      setEditOpen(false);

      toast({
        title: "Chat updated",
        description: "Chat context saved successfully."
      });

    } catch {
      toast({
        title: "Update failed",
        description: "Could not save chat details",
        variant: "destructive"
      });
    }
  }

  /* ---------- UI ---------- */

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">

        {/* HEADER + INLINE CONTEXT */}
        <div className="mb-6 flex-shrink-0">
          {chat ? (
            <Link
              to={`/projects/${chat.project_id}/chats`}
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Chats
            </Link>
          ) : (
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Link>
          )}


          <div className="flex items-start justify-between gap-4 flex-wrap">

          {/* LEFT — TITLE + PRESENCE BAR */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-peach to-neon-violet flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-background" />
              </div>

              <div>
                <h1 className="text-2xl font-bold gradient-text">Chat Messages</h1>
                <p className="text-sm text-muted-foreground">
                  Messages are immutable and preserved as ground truth.
                </p>
              </div>

              {/* 👥 Active user avatars */}
              {activeUsers.length > 0 && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="flex -space-x-2">
                    {activeUsers.slice(0, 5).map(email => (
                      <Tooltip key={email}>
                        <TooltipTrigger asChild>
                          <div
                            className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold text-white cursor-default select-none"
                            style={{ backgroundColor: stringToColor(email) }}
                          >
                            {getInitials(email)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">{email}</TooltipContent>
                      </Tooltip>
                    ))}
                    {activeUsers.length > 5 && (
                      <div className="w-7 h-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold">
                        +{activeUsers.length - 5}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground ml-1">
                    {activeUsers.length} online
                  </span>
                </div>
              )}
            </div>
            {chat && (
              <div className="relative glass-panel px-4 py-3 rounded-xl border border-primary/20">

                {/* Soft Glow Aura */}
                <div
                  className="
        absolute -inset-1
        bg-gradient-to-r from-neon-cyan/20 via-neon-violet/15 to-neon-peach/20
        blur-xl rounded-2xl opacity-60 pointer-events-none
        [animation:pulse_7s_ease-in-out_infinite]
        @keyframes pulse{0%,100%{opacity:.45}50%{opacity:.9}}
      "
                />

                <details className="group relative">

                  {/* --- SUMMARY ROW --- */}
                  <summary
                    className="
          flex items-center gap-3 cursor-pointer list-none
          rounded-lg px-2 py-1
          transition hover:bg-primary/5
          whitespace-nowrap overflow-hidden
        "
                  >

                    <span className="uppercase tracking-wider text-[10px] text-muted-foreground">
                      CHAT CONTEXT
                    </span>

                    {/* Purpose */}
                    <span className="text-sm text-foreground/90 max-w-[28ch] truncate">
                      <span className="font-medium text-muted-foreground">Purpose:</span>{" "}
                      {chat.purpose || "Not set"}
                    </span>

                    <span className="text-muted-foreground/60 flex-shrink-0">•</span>

                    {/* Phase */}
                    <span className="text-sm text-foreground/90 max-w-[14ch] truncate">
                      <span className="font-medium text-muted-foreground">Phase:</span>{" "}
                      {chat.phase || "Not set"}
                    </span>

                    <span className="text-muted-foreground/60 flex-shrink-0">•</span>

                    {/* Owner */}
                    <span className="text-sm text-foreground/90 max-w-[14ch] truncate">
                      <span className="font-medium text-muted-foreground">Owner:</span>{" "}
                      {chat.owner || "Unassigned"}
                    </span>

                    {/* ▼ Arrow */}
                    <span
                      className="
            ml-1 text-xs opacity-70
            transition-transform duration-300
            group-open:rotate-180 group-open:opacity-100
          "
                    >
                      ▼
                    </span>
                  </summary>

                  {/* --- EXPANDED BODY --- */}
                  <div
                    className="
          mt-3 space-y-3 leading-relaxed text-sm
          animate-in fade-in slide-in-from-top-2 duration-300
        "
                  >

                    <p>
                      <span className="font-medium text-muted-foreground">
                        Description:
                      </span>{" "}
                      {chat.description || "No description yet."}
                    </p>

                    {!isViewer && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-primary/40 hover:border-primary/70 hover:bg-primary/10"
                        onClick={() => setEditOpen(true)}
                      >
                        Edit Chat Context
                      </Button>
                    )}
                  </div>
                </details>

                {/* --- Last Updated --- */}
                {chat?.updated_at && (
                  <p className="text-xs text-muted-foreground mt-2 text-right">
                    Last updated: {formatIST(chat.updated_at)}
                  </p>
                )}
              </div>
            )}



          </div>
        </div>



        {/* CHAT BODY */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {isLoading ? (
            <LoadingSpinner className="flex-1" text="Loading messages..." />

          ) : error ? (
            <ErrorState message={error} onRetry={fetchMessages} />

          ) : (
            <>
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto scrollbar-thin glass-panel p-6 mb-4 space-y-6"
              >

                {messages.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="No messages yet"
                    description="Start the conversation by adding a message below."
                    className="py-8"
                  />
                ) : (

                  messages.map(msg => {

                    if (msg.role === "synthesis" && msg.sender === "synthesis") {
                      return (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          dim={!msg.include_in_summary}
                          onClick={() => setActiveSynthesis(msg)}   // 🧠 NEW
                          isViewer={isViewer}
                          onRefresh={fetchMessages}
                        />
                      );
                    }

                    const dim =
                      msg.role === "assistant" &&
                      msg.sender !== "synthesis" &&
                      !msg.accepted;

                    return (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        dim={!!dim}
                        isViewer={isViewer}
                        onRefresh={fetchMessages}
                      />
                    );
                  })

                )}

                <div ref={bottomRef} />
              </div>

              <div className="flex-shrink-0">
                {/* ⏳ Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2">
                    {typingUsers.slice(0, 3).map(email => (
                      <div key={email} className="flex items-center gap-1.5">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ backgroundColor: stringToColor(email) }}
                        >
                          {getInitials(email)}
                        </div>
                        <span className="text-xs text-muted-foreground">{email.split('@')[0]}</span>
                      </div>
                    ))}
                    <div className="flex gap-0.5 items-center ml-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground italic">typing...</span>
                  </div>
                )}
                {!isViewer ? (
                  <MessageInput onSubmit={handleSendMessage} isLoading={isSending} onTyping={sendTypingEvent} />
                ) : (
                  <div className="p-4 text-center bg-white/5 border-t border-white/10">
                    <p className="text-sm text-slate-400">You are a viewer in this project and cannot send messages.</p>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>


      {/* EDIT MODAL */}
      {chat && editOpen && (
        <EditChatBannerModal
          chat={chat}
          onClose={() => setEditOpen(false)}
          onSave={handleSaveBanner}
        />
      )}

      {activeSynthesis && (
        <KnowledgeInspector
          synthesis={activeSynthesis}
          onClose={() => setActiveSynthesis(null)}
        />
      )}

    </MainLayout>



  );
}



/* ---------- MODAL ---------- */

function EditChatBannerModal({
  chat,
  onClose,
  onSave
}: {
  chat: Chat;
  onClose: () => void;
  onSave: (values: Partial<Chat>) => void;
}) {

  const [purpose, setPurpose] = useState(chat.purpose ?? "");
  const [phase, setPhase] = useState(chat.phase ?? "");
  const [description, setDescription] = useState(chat.description ?? "");
  const [owner, setOwner] = useState(chat.owner ?? "");

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="glass-panel p-6 rounded-xl w-[560px] space-y-4">

        <h2 className="text-lg font-semibold">Edit Chat Context</h2>

        <textarea
          className="w-full p-2 bg-background/40 rounded"
          rows={2}
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          placeholder="Purpose"
        />

        <input
          className="w-full p-2 bg-background/40 rounded"
          value={phase}
          onChange={e => setPhase(e.target.value)}
          placeholder="Phase"
        />

        <textarea
          className="w-full p-2 bg-background/40 rounded"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description"
        />

        <input
          className="w-full p-2 bg-background/40 rounded"
          value={owner}
          onChange={e => setOwner(e.target.value)}
          placeholder="Owner"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>

          <Button
            variant="neon"
            onClick={() =>
              onSave({
                purpose,
                phase,
                description,
                owner
              })
            }
          >
            Save
          </Button>
        </div>

      </div>
    </div>
  );
}

function KnowledgeInspector({
  synthesis,
  onClose
}: {
  synthesis: any;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<any>(null);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [temporalMode, setTemporalMode] = useState<'current' | 'history' | 'drift'>('current');


  useEffect(() => {
    if (!synthesis?.chat_id) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    async function loadData() {
      try {
        const [graphRes] = await Promise.all([
          api<any>(`/api/reasoning/chat/${synthesis.chat_id}`)
        ]);

        const synthesisList = await api<any[]>(`/chats/${synthesis.chat_id}/synthesis`)
          .catch(() => []);

        if (!isMounted) return;

        setGraph(graphRes);

        let paramId = synthesis.synthesis_id;
        if (!paramId && synthesis.reply_group_id) {
          const found = synthesisList.find((s: any) => s.reply_group_id === synthesis.reply_group_id);
          if (found) paramId = found.id;
        }
        setResolvedId(paramId);

      } catch (err) {
        console.error(err);
        if (isMounted) setGraph(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [synthesis?.chat_id]);

  // Helper: Deduplicate & Filter
  const getNodes = (list: any[]) => {
    if (!list || !resolvedId) return [];
    const filtered = list.filter((n: any) => n.synthesis_id === resolvedId);
    const seen = new Set();
    return filtered.filter((n: any) => {
      const key = n.id || n.content;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const decisions = getNodes(graph?.decision);
  const supportNodes = getNodes(graph?.supports);
  const conflictNodes = getNodes(graph?.conflicts);
  const riskNodes = getNodes(graph?.blockers);
  const alternatives = getNodes(graph?.alternatives);

  // --- METRICS ENGINE ---
  const calculateMetrics = () => {
    // 1. Support Force (0-100)
    const supportScore = Math.min(100, supportNodes.reduce((acc: number, n: any) => acc + (n.confidence || 1) * 20, 0));

    // 2. Opposition Force (0-100)
    const conflictScore = Math.min(100, conflictNodes.reduce((acc: number, n: any) => acc + (n.confidence || 1) * 25, 0));

    // 3. Uncertainty Mass (0-100)
    const riskScore = Math.min(100, riskNodes.reduce((acc: number, n: any) => acc + (n.confidence || 1) * 15, 0));

    return { supportScore, conflictScore, riskScore };
  };

  const metrics = calculateMetrics();

  return (
    <div data-tour="synthesis-pane" className="fixed right-0 top-0 h-full w-[600px] bg-background/95 backdrop-blur-3xl border-l border-primary/20 z-[9999] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

      {/* HEADER: Decision Cockpit */}
      <div className="p-6 border-b border-white/10 bg-black/20">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Decision Cockpit
            </h2>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground opacity-70">
              ID: {resolvedId?.slice(0, 8) || 'Scanning...'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* 🕒 TEMPORAL TOGGLE */}
            <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/5">
              {(['current', 'history', 'drift'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setTemporalMode(mode)}
                  className={`
                            px-2 py-1 text-[10px] uppercase font-bold rounded-md transition-all
                            ${temporalMode === mode ? 'bg-white/10 text-white shadow-sm' : 'text-muted-foreground hover:text-white/70'}
                        `}
                >
                  {mode}
                </button>
              ))}
            </div>

            <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/10 rounded-full">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* 3-GAUGE METRICS */}
        <div className="grid grid-cols-3 gap-2">
          <MetricGauge label="Support" score={metrics.supportScore} color="bg-emerald-500" />
          <MetricGauge label="Opposition" score={metrics.conflictScore} color="bg-red-500" />
          <MetricGauge label="Uncertainty" score={metrics.riskScore} color="bg-amber-500" />
        </div>
      </div>

      {/* CAUSAL MAP : The "Thinking Surface" */}
      {(loading) ? (
        <div className="flex-1 flex items-center justify-center animate-pulse text-muted-foreground">
          <LoadingSpinner />
        </div>
      ) : (!graph || !resolvedId) ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>No reasoning trace found.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar bg-gradient-to-b from-transparent to-black/40">

          {/* LAYER 1: FOUNDATION (Evidence) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400/80 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Incoming Evidence
            </div>
            <div className="grid grid-cols-2 gap-3">
              {supportNodes.map((n: any, i: number) => (
                <NodeCard key={i} node={n} type="support" />
              ))}
              {supportNodes.length === 0 && <span className="text-xs text-muted-foreground italic col-span-2">No direct evidence cited.</span>}
            </div>
          </div>
          {/* Visual Connector Down */}
          <div className="flex justify-center -mb-2 opacity-30">
            <ArrowDown className="w-6 h-6 text-emerald-500 animate-pulse" />
          </div>

          {/* LAYER 2: THE CORE (Decision) */}
          <div className="relative p-1 rounded-xl bg-gradient-to-b from-emerald-500/20 via-primary/10 to-transparent">
            {/* 🔗 CROSS-LINK CUE */}
            <div className="absolute -top-10 left-4 text-[10px] text-muted-foreground/50 rotate-[-5deg] border border-white/5 rounded px-2 py-1">
              ↳ Depends on Synthesis #3
            </div>

            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-3 px-3 py-1 bg-black border border-emerald-500/50 rounded-full text-[10px] uppercase font-bold text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]">
              The Decision
            </div>

            <div className="bg-black/40 border border-primary/20 backdrop-blur-sm rounded-xl p-6 text-center shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              {decisions.map((n: any, i: number) => (
                <p key={i} className="text-xl font-medium leading-relaxed text-foreground/90">
                  {n.content}
                </p>
              ))}
              {decisions.length === 0 && <span className="text-sm text-muted-foreground">No definitive conclusion.</span>}
            </div>
          </div>

          {/* LAYER 3: THE PRESSURE (Conflicts & Risks) */}
          <div className="grid grid-cols-2 gap-6 relative">
            {/* Visual Connector Up/Split */}
            <div className="absolute left-1/2 -top-6 -translate-x-1/2 w-px h-8 bg-gradient-to-b from-primary/30 to-transparent"></div>

            {/* Left: Conflicts Pushing Back */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400/80 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Usage Friction
              </div>
              <div className="space-y-2">
                {conflictNodes.map((n: any, i: number) => (
                  <NodeCard key={i} node={n} type="conflict" />
                ))}
              </div>
            </div>

            {/* Right: Uncertainty & Risks */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400/80 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Uncertainties
              </div>
              <div className="space-y-2">
                {riskNodes.map((n: any, i: number) => (
                  <NodeCard key={i} node={n} type="risk" />
                ))}
              </div>
            </div>
          </div>

          {/* LAYER 4: LATERAL OPTIONS (Alternatives) */}
          {alternatives.length > 0 && (
            <div className="border-t border-white/5 pt-6 mt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400/80 mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Discarded Alternatives
              </h4>
              <div className="flex flex-wrap gap-2">
                {alternatives.map((n: any, i: number) => (
                  <NodeCard key={i} node={n} type="alternative" />
                ))}
              </div>
            </div>
          )}


          <div className="h-12" />
        </div>
      )}
    </div>
  );
}

// --- SUBCOMPONENTS ---

function MetricGauge({ label, score, color }: { label: string, score: number, color: string }) {
  return (
    <div className="bg-white/5 rounded p-2 text-center border border-white/5">
      <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">{label}</div>
      <div className="text-lg font-bold leading-none mb-1">{score.toFixed(0)}%</div>
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function NodeCard({ node, type }: { node: any, type: 'support' | 'conflict' | 'risk' | 'alternative' }) {
  const confidence = node.confidence ?? 1.0;

  // VISUAL WEIGHT LOGIC
  const opacityClass = confidence > 0.8 ? 'opacity-100' : confidence > 0.5 ? 'opacity-80' : 'opacity-50';
  const borderWeight = confidence > 0.9 ? 'border-l-4' : 'border-l-2';

  let colors = "";
  if (type === 'support') colors = "border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10";
  if (type === 'conflict') colors = "border-red-500/50 bg-red-500/5 hover:bg-red-500/10";
  if (type === 'risk') colors = "border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10";
  if (type === 'alternative') colors = "border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10";

  return (
    <div className={`
            relative p-3 rounded-md border border-white/10 ${borderWeight} ${colors} ${opacityClass}
            transition-all duration-200 hover:scale-[1.02] cursor-default group
        `}>
      <p className="text-sm leading-snug mb-1">{node.content}</p>

      {/* ACTION HOOKS - Operational */}
      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="text-[9px] uppercase tracking-wider font-bold bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-white/80 transition-colors">
          Validate
        </button>
        <button className="text-[9px] uppercase tracking-wider font-bold bg-primary/20 hover:bg-primary/30 px-2 py-0.5 rounded text-primary-foreground transition-colors">
          + Task
        </button>
      </div>
    </div>
  );
}
