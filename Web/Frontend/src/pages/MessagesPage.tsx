import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MessageSquare } from "lucide-react";

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
  getChats          // ✅ REQUIRED FOR FALLBACK
} from "@/lib/api";

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

  const { chatId } = useParams<{ projectId: string; chatId: string }>();

  const [chat, setChat] = useState<Chat | null>(null);   // 🆕 CHAT META
  const [editOpen, setEditOpen] = useState(false);       // 🆕 EDIT MODAL

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const [activeSynthesis, setActiveSynthesis] = useState<Message | null>(null);

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

          {/* LEFT — TITLE */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-peach to-neon-violet flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-background" />
            </div>

            <div>
              <h1 className="text-2xl font-bold gradient-text">Chat Messages</h1>
              <p className="text-sm text-muted-foreground">
                Messages are immutable and preserved as ground truth.
              </p>
            </div>
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

        <Button
          variant="outline"
          size="sm"
          className="border-primary/40 hover:border-primary/70 hover:bg-primary/10"
          onClick={() => setEditOpen(true)}
        >
          Edit Chat Context
        </Button>
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
                    />
                  );
                })

              )}

              <div ref={bottomRef} />
            </div>

            <div className="flex-shrink-0">
              <MessageInput onSubmit={handleSendMessage} isLoading={isSending} />
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
}function KnowledgeInspector({
  synthesis,
  onClose
}: {
  synthesis: any;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<any>(null);

    useEffect(() => {
      if (!synthesis?.chat_id) return;   // ← this was the bug

      setLoading(true);
      fetch(`/api/reasoning/chat/${synthesis.chat_id}`)
        .then(r => r.json())
        .then(data => setGraph(data))
        .catch(console.error)
        .finally(() => setLoading(false));
    }, [synthesis?.chat_id]);


    

  if (loading || !graph) {
    return (
      <div className="fixed right-0 top-0 h-full w-[420px] bg-black/70 backdrop-blur-xl border-l border-primary/30 z-[9999] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const decision = graph.decision?.filter((n: any) => n.synthesis_id === synthesis.synthesis_id);
  const supports = graph.supports?.filter((n: any) => n.synthesis_id === synthesis.synthesis_id);
  const conflicts = graph.conflicts?.filter((n: any) => n.synthesis_id === synthesis.synthesis_id);
  const blockers = graph.blockers?.filter((n: any) => n.synthesis_id === synthesis.synthesis_id);
  const alternatives = graph.alternatives?.filter((n: any) => n.synthesis_id === synthesis.synthesis_id);

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-black/80 backdrop-blur-xl border-l border-primary/30 z-[9999] overflow-y-auto">

      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center z-[10000]"
      >
        ✕
      </button>

      <div className="p-4 pt-12 space-y-5 text-sm">
        <RelationSection title="Decision" items={decision} />
        <RelationSection title="Supporting Evidence" items={supports} />
        <RelationSection title="Conflicts / Tradeoffs" items={conflicts} />
        <RelationSection title="Unknowns / Risks" items={blockers} />
        <RelationSection title="Alternatives Considered" items={alternatives} />
      </div>
    </div>
  );
}


function RelationSection({
  title,
  items
}: {
  title: string;
  items: any[];
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide opacity-60">{title}</div>
      <ul className="space-y-1 pl-3">
        {items.map((item, idx) => (
          <li key={item.id || idx} className="text-sm leading-snug">
            • {item.content}
          </li>
        ))}
      </ul>
    </div>
  );
}
