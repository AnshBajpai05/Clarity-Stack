import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MessageSquare, X, ArrowDown, Split, Swords, AlertTriangle, Search, Target } from "lucide-react";

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
  getDevilsAdvocate,
  getDecisionTrace,
  getDecisionReadiness,
} from "@/lib/api";
import type { DevilsAdvocateResult, DecisionTraceItem, DecisionReadiness } from "@/lib/api";
import { api } from "@/lib/http";
import { stringToColor, getInitials } from "@/lib/colors";

import { useToast } from "@/hooks/use-toast";

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
  // §16.5 Ask-Anyway: when the conflict gate holds back an answer, stash the turn so
  // the user can re-run it with the gate relaxed (no duplicate user message).
  const [conflictRetry, setConflictRetry] = useState<{ sender: string; text: string; detail?: string } | null>(null);

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
    const backendHost = (import.meta as any).env?.VITE_BACKEND_URL
      ? new URL((import.meta as any).env.VITE_BACKEND_URL).host
      : `${window.location.hostname}:8000`;
    const wsUrl = `ws://${backendHost}/ws/chats/${chatId}`;

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
      if (!document.hidden) loadChat();  // 🔁 refresh — respects editOpen + tab visibility
    }, 4000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };

  }, [chatId, editOpen]);              // 👈 keep this — reopening closes override

  // §15.12: derive RBAC role ONCE per chat/project — not inside the 4s meta poll.
  useEffect(() => {
    const pId = chat?.project_id || projectId;
    if (!pId) return;
    let cancelled = false;
    (async () => {
      const email = localStorage.getItem('cs_email') || '';
      try {
        const proj = await getProject(pId);
        if (cancelled) return;
        if (proj.owner === email) { setMemberRole('owner'); return; }
        const members = await getProjectMembers(pId);
        if (cancelled) return;
        const me = members.find(m => m.user_email === email);
        if (me) setMemberRole(me.role as any);
      } catch { /* role stays default */ }
    })();
    return () => { cancelled = true; };
  }, [chat?.project_id, projectId]);




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
    const interval = setInterval(() => { if (!document.hidden) fetchMessages(); }, 4000);
    return () => clearInterval(interval);
  }, [fetchMessages]);


  /* ---------- SEND MESSAGE ---------- */

  const handleSendMessage = async (text: string, role: string, sender: string) => {

    if (!chatId) return;
    setIsSending(true);

    try {
      if (role === "user") {
        const res = await askChat(chatId, sender, text);
        // §16.5: the conflict gate held this answer back. The server already reset the
        // turn, so just surface an "Ask Anyway" retry instead of fetching messages.
        if (res?.status === "conflict_gate" && res?.can_retry_ask_anyway) {
          setConflictRetry({ sender, text, detail: res.detail });
          return;
        }
        // §16.8: the noise classifier filtered this message — overridable. The canned
        // note + user turn are already persisted, so show them, then offer Ask Anyway.
        if (res?.status === "noise_filtered" && res?.can_retry_ask_anyway) {
          setConflictRetry({ sender, text, detail: res.detail });
          await fetchMessages();
          scrollToBottom(true);
          return;
        }
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

  /* ---------- ASK ANYWAY (§16.5 conflict-gate override) ---------- */

  const handleAskAnyway = async () => {
    if (!chatId || !conflictRetry) return;
    const { sender, text } = conflictRetry;
    setConflictRetry(null);
    setIsSending(true);
    try {
      await askChat(chatId, sender, text, true);   // relax the conflict gate
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
                <h1 className="text-2xl font-display font-bold gradient-text tracking-tight">Chat Messages</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
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
                {/* §16.5 Ask-Anyway banner: the conflict gate held an answer back */}
                {conflictRetry && (
                  <div className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 flex items-start gap-3">
                    <Split className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-300">Answer held back</p>
                      <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                        {conflictRetry.detail || "The models surfaced a conflict the validator couldn't confirm."}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" className="h-7 bg-amber-500 hover:bg-amber-600 text-black" onClick={handleAskAnyway} disabled={isSending}>
                          Ask Anyway
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setConflictRetry(null)} disabled={isSending}>
                          Dismiss
                        </Button>
                      </div>
                    </div>
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
  const [disagreement, setDisagreement] = useState<any>(null);
  const [trace, setTrace] = useState<DecisionTraceItem[]>([]);   // §17.4 "Why this decision?"
  const [readiness, setReadiness] = useState<DecisionReadiness[]>([]);   // §17.5 Decision Readiness


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

        // Disagreement Spotlight: recompute where the ensemble diverged for THIS
        // reply group (independent of the KG — works even when the graph is empty).
        if (synthesis.reply_group_id) {
          api<any>(`/chats/${synthesis.chat_id}/synthesis/${synthesis.reply_group_id}/disagreement`)
            .then((d) => { if (isMounted) setDisagreement(d); })
            .catch(() => { if (isMounted) setDisagreement(null); });
        }

        // §17.4 "Why this decision?": edge-grounded trace per decision (semantic edges).
        getDecisionTrace(synthesis.chat_id)
          .then((t) => { if (isMounted) setTrace(t?.decisions || []); })
          .catch(() => { if (isMounted) setTrace([]); });

        // §17.5 Decision Readiness: verdict + resolve-path, fused from agreement + edges.
        getDecisionReadiness(synthesis.chat_id)
          .then((r) => { if (isMounted) setReadiness(r?.decisions || []); })
          .catch(() => { if (isMounted) setReadiness([]); });

      } catch (err) {
        console.error(err);
        if (isMounted) setGraph(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [synthesis?.chat_id, synthesis?.reply_group_id]);

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

        {/* ⑂ DISAGREEMENT SPOTLIGHT — where the ensemble actually diverged */}
        {disagreement && disagreement.n_models >= 2 && (
          <DisagreementSpotlight data={disagreement} />
        )}
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

          {/* 🎯 DECISION READINESS — the headline verdict + resolve-path (§17.5) */}
          <DecisionReadinessPanel
            decisions={(readiness || []).filter((r) => !resolvedId || r.synthesis_id === resolvedId)}
          />

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

          {/* 🔎 WHY THIS DECISION? — edge-grounded trace (§17.4) */}
          <DecisionTracePanel
            decisions={(trace || []).filter((t) => !resolvedId || t.synthesis_id === resolvedId)}
          />

          {/* ⚔ DEVIL'S ADVOCATE — red-team the decision (§17.2) */}
          <DevilsAdvocatePanel chatId={synthesis.chat_id} replyGroupId={synthesis.reply_group_id} />

          <div className="h-12" />
        </div>
      )}
    </div>
  );
}

// Colour + label per red-team category (mirrors the cockpit's evidence/conflict palette).
const CRITIQUE_META: Record<string, { label: string; cls: string }> = {
  RISK:         { label: "Risk",          cls: "text-red-300 bg-red-500/10 border-red-500/30" },
  ASSUMPTION:   { label: "Shaky Assumption", cls: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30" },
  FAILURE_MODE: { label: "Failure Mode",  cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  COUNTERPOINT: { label: "Counterpoint",  cls: "text-violet-300 bg-violet-500/10 border-violet-500/30" },
};

/**
 * Devil's Advocate — on-demand red-team of the decision. Most AI rubber-stamps; this
 * argues the other side. One paid model call, so it loads only on click. Reuses the
 * stored synthesis (no migration, no extra column).
 */
function DevilsAdvocatePanel({ chatId, replyGroupId }: { chatId?: string; replyGroupId?: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DevilsAdvocateResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!chatId || !replyGroupId) return;
    setLoading(true);
    setErr(null);
    try {
      setData(await getDevilsAdvocate(chatId, replyGroupId));
    } catch (e: any) {
      setErr(e?.message || "Could not red-team this decision.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-white/5 pt-6 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-red-400/80 flex items-center gap-2">
          <Swords className="w-3.5 h-3.5" />
          Devil's Advocate
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-red-500/40 text-red-300 hover:bg-red-500/10"
          onClick={run}
          disabled={loading || !replyGroupId}
        >
          {loading ? "Red-teaming…" : data ? "Re-run" : "Red-team this decision"}
        </Button>
      </div>

      {err && (
        <p className="text-xs text-red-400/90 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {err}
        </p>
      )}

      {!data && !loading && !err && (
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          Stress-test this decision: surface its risks, shaky assumptions, failure modes,
          and the strongest argument for a different choice.
        </p>
      )}

      {data && data.note === "no_decision" && (
        <p className="text-xs text-muted-foreground italic">No definitive decision here to challenge.</p>
      )}

      {data && data.note === "unstructured_response" && (
        <p className="text-xs text-amber-400/80">The critic responded but its answer couldn't be structured. Try Re-run.</p>
      )}

      {data && data.challenges.length > 0 && (
        <div className="space-y-2">
          {data.challenges.map((c, i) => {
            const meta = CRITIQUE_META[c.category] || { label: c.category, cls: "text-slate-300 bg-slate-500/10 border-slate-500/30" };
            return (
              <div key={i} className="rounded-lg bg-black/30 border border-white/5 p-2.5">
                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${meta.cls}`}>
                  {meta.label}
                </span>
                <p className="text-xs text-foreground/90 leading-snug mt-1.5">{c.text}</p>
              </div>
            );
          })}
          {data.model && (
            <p className="text-[9px] font-mono text-muted-foreground/50 pt-1">critic: {data.model}</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- SUBCOMPONENTS ---

// Shorten an honest model label ("groq:llama-3.1-8b-instant" / "nvidia:meta/llama-3.1-70b-instruct")
// to something compact for a chip.
function shortModel(label: string): string {
  const afterColon = label.includes(":") ? label.split(":").slice(1).join(":") : label;
  const afterSlash = afterColon.includes("/") ? afterColon.split("/").pop()! : afterColon;
  return afterSlash.length > 22 ? afterSlash.slice(0, 22) + "…" : afterSlash;
}

const CONTESTED_SECTION_COLOR: Record<string, string> = {
  FACT: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  DECISION: "text-violet-300 bg-violet-500/10 border-violet-500/30",
  CONFLICT: "text-red-300 bg-red-500/10 border-red-500/30",
  OPTION: "text-blue-300 bg-blue-500/10 border-blue-500/30",
  UNKNOWN: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  ASSUMPTION: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
  CONSTRAINT: "text-pink-300 bg-pink-500/10 border-pink-500/30",
};

/**
 * Disagreement Spotlight — the signature view. Surfaces the claims the ensemble did
 * NOT unanimously extract (contested), turning hidden model disagreement into an
 * actionable brainstorming signal. Reuses the measured-agreement engine; no extra
 * model calls. A claim with support 1/N (only one model said it) is flagged hardest.
 */
function DisagreementSpotlight({ data }: { data: any }) {
  const contested: any[] = data?.contested || [];
  const total: number = (data?.claims || []).length;
  const n: number = data?.n_models || 0;

  if (contested.length === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
        <Split className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <p className="text-[11px] text-emerald-300/90 leading-snug">
          <span className="font-semibold">Full consensus</span> — all {n} models extracted every one of the {total} claims.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.07] to-transparent overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-amber-500/15">
        <div className="flex items-center gap-2">
          <Split className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Where the AIs split</span>
        </div>
        <span className="text-[10px] font-bold text-amber-300/90 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
          {contested.length} contested / {total}
        </span>
      </div>
      <p className="px-3 pt-2 text-[10px] text-muted-foreground/70 leading-relaxed">
        Claims not extracted by every model. This is where your judgment matters most.
      </p>
      <div className="max-h-56 overflow-y-auto no-scrollbar px-3 py-2 space-y-2">
        {contested.map((c, i) => (
          <div key={i} className="rounded-lg bg-black/30 border border-white/5 p-2.5">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${CONTESTED_SECTION_COLOR[c.section] || "text-slate-300 bg-slate-500/10 border-slate-500/30"}`}>
                {c.section}
              </span>
              <span className={`text-[9px] font-bold ${c.support === 1 ? "text-red-400" : "text-amber-400"}`}>
                {c.support}/{c.n_models} models
              </span>
              {c.support === 1 && (
                <span className="text-[8px] uppercase font-bold text-red-400/80 tracking-wider">⚠ lone claim</span>
              )}
            </div>
            <p className="text-xs text-foreground/90 leading-snug mb-1.5">{c.text}</p>
            <div className="flex flex-wrap gap-1">
              {(c.models || []).map((m: string) => (
                <span key={m} className="text-[8px] font-mono text-muted-foreground/70 bg-white/5 border border-white/5 rounded px-1.5 py-0.5">
                  {shortModel(m)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Per-relation colour for the grounded "Why this decision?" trace.
const RELATION_COLOR: Record<string, string> = {
  SUPPORTS:       "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  CONTRADICTS:    "text-red-300 border-red-500/30 bg-red-500/10",
  BLOCKS:         "text-amber-300 border-amber-500/30 bg-amber-500/10",
  DEPENDS_ON:     "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
  ALTERNATIVE_OF: "text-blue-300 border-blue-500/30 bg-blue-500/10",
  REFINES:        "text-violet-300 border-violet-500/30 bg-violet-500/10",
};

/**
 * "Why this decision?" — walks the SEMANTIC KG edges (§16.2 fix) into each decision so
 * it shows only the evidence/conflicts actually linked to it, plus the shared terms that
 * justified each link. The old cross-product wired every fact to every decision; this
 * makes the reasoning auditable instead of asserted.
 */
function DecisionTracePanel({ decisions }: { decisions: DecisionTraceItem[] }) {
  if (!decisions || decisions.length === 0) return null;
  return (
    <div className="border-t border-white/5 pt-6 mt-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80 mb-3 flex items-center gap-2">
        <Search className="w-3.5 h-3.5" /> Why this decision?
      </h4>
      <div className="space-y-4">
        {decisions.map((d) => (
          <div key={d.decision_id} className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-sm font-medium text-foreground/90 mb-2">{d.decision}</p>
            {d.links.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 italic">
                No evidence is lexically linked to this decision — surfaced on its own.
              </p>
            ) : (
              <div className="space-y-1.5">
                {d.links.map((l, i) => {
                  const cls = RELATION_COLOR[l.relation] || "text-slate-300 border-slate-500/30 bg-slate-500/10";
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${cls}`}>
                        {l.phrase}
                      </span>
                      <div className="min-w-0">
                        <span className="text-foreground/85">{l.content}</span>
                        {l.shared_terms.length > 0 && (
                          <span className="ml-1.5 text-[9px] font-mono text-muted-foreground/50">
                            ↪ {l.shared_terms.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Verdict styling per readiness band.
const BAND_META: Record<string, { label: string; ring: string; text: string; bar: string }> = {
  ready:       { label: "Ready",       ring: "border-emerald-500/40 bg-emerald-500/[0.07]", text: "text-emerald-300", bar: "bg-emerald-500" },
  forming:     { label: "Forming",     ring: "border-amber-500/40 bg-amber-500/[0.07]",     text: "text-amber-300",   bar: "bg-amber-500" },
  exploratory: { label: "Exploratory", ring: "border-red-500/40 bg-red-500/[0.07]",         text: "text-red-300",     bar: "bg-red-500" },
};
const RESOLVE_KIND_META: Record<string, string> = {
  BLOCKS:      "text-amber-300 bg-amber-500/10 border-amber-500/30",
  CONTRADICTS: "text-red-300 bg-red-500/10 border-red-500/30",
  DEPENDS_ON:  "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
};

/**
 * Decision Readiness (§17.5) — the capstone. Fuses measured inter-model agreement
 * (§10.3) with the semantic KG edges (§17.4) into one verdict per decision —
 * Exploratory / Forming / Ready — plus the cheapest *resolve-path*: the specific open
 * questions, conflicts, and unvalidated assumptions to clear, each tagged with the
 * readiness it would unlock. Answers the product's core question: "act on this yet?"
 */
function DecisionReadinessPanel({ decisions }: { decisions: DecisionReadiness[] }) {
  if (!decisions || decisions.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary/90">
        <Target className="w-3.5 h-3.5" /> Decision Readiness
      </div>
      {decisions.map((d) => {
        const meta = BAND_META[d.band] || BAND_META.exploratory;
        const pct = Math.round(d.readiness * 100);
        return (
          <div key={d.decision_id} className={`rounded-xl border ${meta.ring} p-4`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-medium text-foreground/90 leading-snug">{d.decision}</p>
              <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${meta.ring} ${meta.text}`}>
                {meta.label}
              </span>
            </div>

            {/* readiness bar */}
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full ${meta.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-xs font-bold ${meta.text}`}>{pct}%</span>
            </div>

            {/* evidence summary */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/80 mb-2">
              <span>agreement {d.agreement == null ? "n/a" : `${Math.round(d.agreement * 100)}%`}</span>
              <span className="text-emerald-400/80">{d.evidence.support} support</span>
              {d.evidence.conflict > 0 && <span className="text-red-400/80">{d.evidence.conflict} conflict</span>}
              {d.evidence.blocker > 0 && <span className="text-amber-400/80">{d.evidence.blocker} open</span>}
              {d.evidence.depends_on > 0 && <span className="text-cyan-400/80">{d.evidence.depends_on} assumption</span>}
            </div>

            {/* resolve-path */}
            {d.resolve_path.length === 0 ? (
              <p className="text-[11px] text-emerald-300/90">Nothing blocking — no open questions, conflicts, or unvalidated assumptions linked.</p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold">
                  Resolve {d.n_to_resolve} to raise readiness
                </p>
                {d.resolve_path.map((s, i) => {
                  const cls = RESOLVE_KIND_META[s.kind] || "text-slate-300 bg-slate-500/10 border-slate-500/30";
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${cls}`}>
                        {s.action}
                      </span>
                      <span className="text-foreground/85 min-w-0">{s.content}</span>
                      <span className="shrink-0 text-[9px] font-mono text-muted-foreground/50">+{Math.round(s.unlocks * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
    </div>
  );
}
