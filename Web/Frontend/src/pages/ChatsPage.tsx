import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus, MessageSquare, ArrowLeft, FolderKanban, Info } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { ChatCard } from '@/components/chats/ChatCard';
import { CreateChatModal } from '@/components/chats/CreateChatModal';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';

import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from "date-fns";


import {
  getChats,
  createChat,
  getArchivedChats,
  deleteChat,
  Chat,
  isDemoMode,
  togglePinChat,
  getProject,
  Project,
  updateProject,
  renameChat,
  toggleArchiveChat
} from '@/lib/api';

import { useToast } from '@/hooks/use-toast';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

function utcToIst(dateStr?: string) {
  if (!dateStr) return "Not set";

  const utc = dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(utc));
}

function safeFormat(dateStr?: string | null) {
  if (!dateStr) return "Not updated yet";

  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Not updated yet";

    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "Not updated yet";
  }
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





// ===================================================
// 🔥 EDIT PROJECT BANNER MODAL
// ===================================================
function EditProjectBannerModal({
  isOpen,
  onClose,
  project,
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSave: (values: Partial<Project>) => void;
}) {

  const [purpose, setPurpose] = useState(project.purpose);
  const [success, setSuccess] = useState(project.success_criteria);
  const [constraints, setConstraints] = useState(project.constraints);
  const [owner, setOwner] = useState(project.owner ?? "");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="glass-panel p-6 rounded-xl w-[560px] space-y-4">

        <h2 className="text-lg font-semibold">Edit Project Context</h2>

        <textarea
          className="w-full p-2 bg-background/40 rounded"
          rows={3}
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          placeholder="Project purpose"
        />

        <textarea
          className="w-full p-2 bg-background/40 rounded"
          rows={3}
          value={success}
          onChange={e => setSuccess(e.target.value)}
          placeholder="Success criteria"
        />

        <textarea
          className="w-full p-2 bg-background/40 rounded"
          rows={3}
          value={constraints}
          onChange={e => setConstraints(e.target.value)}
          placeholder="Constraints"
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
            onClick={() => onSave({
              purpose,
              success_criteria: success,
              constraints,
              owner
            })}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}



// ===================================================
// 🔥 MAIN PAGE
// ===================================================
export default function ChatsPage() {

  const { projectId } = useParams<{ projectId: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState(false);

  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { toast } = useToast();
  const demoMode = isDemoMode();

  


  // Load project
  useEffect(() => {
    if (!projectId) return;

    async function loadProject() {
      try {
        const data = await getProject(projectId);
        setProject(data);
      } catch {
        console.warn("Could not load project details");
      }
    }

    loadProject();
  }, [projectId]);



  async function handleUpdateProject(values: Partial<Project>) {
    if (!projectId) return;

    try {
      const updated = await updateProject(projectId, values);
      setProject(updated);
      setEditing(false);

      toast({
        title: "Project updated",
        description: "Project context has been updated."
      });

    } catch {
      toast({
        title: "Update failed",
        description: "Could not save project details",
        variant: "destructive"
      });
    }
  }



  const handleDeleteChat = async (chatId: string) => {
    if (!confirm("Are you sure you want to delete this chat?")) return;

    try {
      await deleteChat(chatId);
      toast({ title: "Chat deleted" });
      fetchChats();

    } catch {
      toast({
        title: "Error deleting chat",
        variant: "destructive"
      });
    }
  };



  const fetchChats = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await (
        showArchived
          ? getArchivedChats(projectId)
          : getChats(projectId)
      );

      setChats(data);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch chats");

    } finally {
      setIsLoading(false);
    }

  }, [projectId, showArchived]);



  useEffect(() => {
    fetchChats();
  }, [fetchChats]);



const handleCreateChat = async (
  title: string,
  sourceType: string,
  context: {
    purpose?: string;
    phase?: string;
    description?: string;
    owner?: string;
  }
) => {
  if (!projectId) return;

  setIsCreating(true);

  try {
    await createChat(projectId, {
      title,
      source_type: sourceType,

      purpose: context.purpose,
      phase: context.phase,
      description: context.description,
      owner: context.owner
    });

    toast({ title: "Chat created" });
    setIsModalOpen(false);
    fetchChats();

  } catch (err) {
    toast({
      title: "Failed to create chat",
      variant: "destructive",
    });
  } finally {
    setIsCreating(false);
  }
};



  return (
    <MainLayout>

      {demoMode && !isLoading && (
        <div className="mb-6 glass-panel p-4 border-neon-peach/30 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neon-peach/20 flex items-center justify-center">
              <Info className="w-4 h-4 text-neon-peach" />
            </div>
            <div>
              <p className="text-sm font-medium text-neon-peach">Demo Mode</p>
              <p className="text-xs text-muted-foreground">
                Backend unavailable. Using sample data.
              </p>
            </div>
          </div>
        </div>
      )}



      <div className="mb-8">

        <Link
          to="/projects"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-violet to-neon-cyan flex items-center justify-center">
            <FolderKanban className="w-5 h-5 text-background" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Project Chats</h1>
        </div>

        <p className="text-muted-foreground">
          View and manage chat conversations in this project.
        </p>

        <div className="mt-4">
          <Button
            variant="outline"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "⬅ Back to Active Chats" : "📂 View Archived Chats"}
          </Button>
        </div>
      </div>
{project && (
  <div className="relative mb-8">

    {/* 🌈 Soft neon aura */}
    <div
      className="
        absolute -inset-2
        bg-gradient-to-r from-neon-violet/25 via-neon-cyan/20 to-neon-peach/25
        blur-2xl rounded-2xl
        opacity-70
        pointer-events-none
        transition-all duration-500
        group-hover:opacity-100
        [animation:pulse_63s_ease-in-out_infinite]
        @keyframes pulse{
          0%,100%{opacity:.85}
          50%{opacity:1}
        }
      "
    />


    {/* 💎 Main card */}
    <div
      className="
        group relative
        glass-panel p-6 rounded-xl border border-primary/30
        shadow-[0_0_25px_rgba(168,85,247,0.25)]
        hover:shadow-[0_0_40px_rgba(168,85,247,0.45)]
        transition-all duration-300
      "
    >

      {/* Header row */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold tracking-wide">
          PROJECT CONTEXT
        </h2>

        <Button
          variant="outline"
          size="sm"
          className="border-primary/30 hover:border-primary/60 hover:bg-primary/5"
          onClick={() => setEditing(true)}
        >
          Edit Project Context
        </Button>
      </div>

      {/* Content */}
      <div className="space-y-2 text-sm leading-relaxed">

        <p>
          <span className="font-medium text-muted-foreground">Purpose:</span>{" "}
          {project.purpose}
        </p>

        <p>
          <span className="font-medium text-muted-foreground">Success Criteria:</span>{" "}
          {project.success_criteria}
        </p>

        <p>
          <span className="font-medium text-muted-foreground">Constraints:</span>{" "}
          {project.constraints}
        </p>

        {project.owner && (
          <p>
            <span className="font-medium text-muted-foreground">Owner:</span>{" "}
            {project.owner}
          </p>
        )}
      </div>

      {/* Timestamp — pinned to bottom right */}
      {project?.updated_at && (
        <div className="absolute bottom-3 right-4 text-xs text-muted-foreground">
          Last updated: {formatIST(project.updated_at)}
        </div>
      )}

    </div>
  </div>
)}

{/* --- Satellite Service Navigation --- */}
{project && (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
    <Link to={`/projects/${project.id}/kg`} className="glass-panel p-4 rounded-xl border border-neon-cyan/30 hover:border-neon-cyan transition-colors flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-lg bg-neon-cyan/20 flex items-center justify-center group-hover:bg-neon-cyan/30 transition-colors">
        <span className="text-neon-cyan font-bold text-xl">⎈</span>
      </div>
      <div>
        <h3 className="font-semibold text-slate-200">Knowledge Graph</h3>
        <p className="text-xs text-muted-foreground">Interactive Subgraphs</p>
      </div>
    </Link>
    
    <Link to={`/projects/${project.id}/delta`} className="glass-panel p-4 rounded-xl border border-neon-peach/30 hover:border-neon-peach transition-colors flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-lg bg-neon-peach/20 flex items-center justify-center group-hover:bg-neon-peach/30 transition-colors">
        <span className="text-neon-peach font-bold text-xl">∆</span>
      </div>
      <div>
        <h3 className="font-semibold text-slate-200">Delta Engine</h3>
        <p className="text-xs text-muted-foreground">Time-series tracking</p>
      </div>
    </Link>
    
    <Link to={`/projects/${project.id}/cards`} className="glass-panel p-4 rounded-xl border border-neon-violet/30 hover:border-neon-violet transition-colors flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-lg bg-neon-violet/20 flex items-center justify-center group-hover:bg-neon-violet/30 transition-colors">
        <span className="text-neon-violet font-bold text-xl">🃏</span>
      </div>
      <div>
        <h3 className="font-semibold text-slate-200">Temporal Cards</h3>
        <p className="text-xs text-muted-foreground">AI Chained Summaries</p>
      </div>
    </Link>
  </div>
)}

      {isLoading ? (
        <LoadingSpinner className="py-20" text="Loading chats..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchChats} />
      ) : chats.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No chats yet"
          description="Create your first chat to start recording conversations."
          action={
            <Button variant="neon" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Chat
            </Button>
          }
        />
      ) : (

        <div className="space-y-4">
          {chats.map((chat) => (
            <div key={chat.id} className="relative">

              <ChatCard chat={chat} onDeleted={fetchChats} projectId={projectId} />

              <div className="absolute right-4 top-4">
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-2 rounded-md hover:bg-muted/40">
                    ⋮
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end">

                    <DropdownMenuItem
                      onClick={async (e) => {
                        e.preventDefault();
                        await togglePinChat(chat.id, !chat.pinned);
                        fetchChats();
                      }}
                    >
                      {chat.pinned ? "⭐ Unpin Chat" : "⭐ Pin Chat"}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={async () => {
                        await toggleArchiveChat(chat.id, !chat.archived);
                        fetchChats();
                      }}
                    >
                      {chat.archived ? "♻ Unarchive Chat" : "📂 Archive Chat"}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={async () => {
                        const newTitle = prompt("Enter new chat name:", chat.title || "");
                        if (!newTitle?.trim()) return;
                        await renameChat(chat.id, newTitle.trim());
                        fetchChats();
                      }}
                    >
                      ✏ Rename Chat
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="text-red-500"
                      onClick={() => handleDeleteChat(chat.id)}
                    >
                      🗑 Delete Chat
                    </DropdownMenuItem>

                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}



      {chats.length > 0 && (
        <Button
          variant="default"
          size="lg"
          className="fixed bottom-8 right-8 shadow-2xl shadow-primary/30 animate-glow"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus className="w-5 h-5" />
          New Chat
        </Button>
      )}



      <CreateChatModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateChat}
        isLoading={isCreating}
      />



      {project && (
        <EditProjectBannerModal
          isOpen={editing}
          onClose={() => setEditing(false)}
          project={project}
          onSave={handleUpdateProject}
        />
      )}

    </MainLayout>
  );
}
