import {
  MessageSquare,
  Clock,
  Brain,
  Loader2
} from "lucide-react";

import { Link } from "react-router-dom";
import { Chat, generateCardFromChat } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useGenerationStore } from "@/store/generationStore";

interface ChatCardProps {
  chat: Chat;
  onDeleted?: () => void;
  onUpdated?: () => void;
  projectId?: string;
}

const sourceTypeColors: Record<string, string> = {
  chatgpt: "bg-neon-mint/20 text-neon-mint border-neon-mint/30",
  slack: "bg-neon-peach/20 text-neon-peach border-neon-peach/30",
  email: "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30",
  user: "bg-neon-violet/20 text-neon-violet border-neon-violet/30"
};

export function ChatCard({ chat, projectId }: ChatCardProps) {
  const { toast } = useToast();
  const { setLoading, isGenerating } = useGenerationStore();

  const handleGenerateCard = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!projectId) return;
    
    setLoading(chat.id, true, "Generating...");
    try {
      const result = await generateCardFromChat(projectId, chat.id);
      if (result.upToDate) {
        toast({ title: "🃏 Already up to date", description: "No new messages since the last card." });
      } else {
        const first = result.cards?.[0];
        const n = result.count ?? result.cards?.length ?? 0;
        toast({
          title: `🃏 ${n} card${n === 1 ? "" : "s"} generated`,
          description: first ? `${first.title}${first.category ? ` · ${first.category}` : ""} v${first.version}` : undefined,
        });
      }
    } catch (err: any) {
      toast({ title: "Card generation failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(chat.id, false);
    }
  };

  const sourceStyle =
    sourceTypeColors[chat.source_type] || sourceTypeColors.user;

  return (
    <Link
      to={`/projects/${chat.project_id}/chats/${chat.id}`}
      className={cn(
        "glass-panel-hover p-5 group block",
        chat.pinned && "border border-yellow-400/40 bg-yellow-400/5"
      )}
    >
      <div className="flex items-start justify-between">
        {/* LEFT */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-violet/20 to-neon-cyan/20 flex items-center justify-center border border-secondary/20">
            <MessageSquare className="w-6 h-6 text-secondary" />
          </div>

          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
              {chat.title || "Untitled Chat"}

              {/* Show ⭐ when pinned */}
              {chat.pinned && (
                <span className="text-yellow-400 text-sm">⭐</span>
              )}
            </h3>


            <div className="flex items-center gap-3 mt-2">
              <span
                className={cn(
                  "text-xs px-2 py-1 rounded-full border",
                  sourceStyle
                )}
              >
                {chat.source_type}
              </span>

              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {formatDistanceToNow(new Date(chat.created_at.endsWith("Z") ? chat.created_at : chat.created_at + "Z"), {
                    addSuffix: true
                  })}
                </span>
              </div>
            </div>

            {/* Generate Card button */}
            {projectId && (
              <button
                onClick={handleGenerateCard}
                disabled={isGenerating(chat.id)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-neon-violet/10 text-neon-violet border border-neon-violet/20 hover:bg-neon-violet/20 transition-colors disabled:opacity-50"
              >
                {isGenerating(chat.id) ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Brain className="w-3 h-3" />
                )}
                {isGenerating(chat.id) ? "Generating..." : "Generate Card"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
