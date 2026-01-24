import {
  MessageSquare,
  Clock,
  MoreVertical,
  Star,
  Archive,
  Trash2
} from "lucide-react";

import { Link } from "react-router-dom";
import { Chat, deleteChat, togglePinChat } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";

interface ChatCardProps {
  chat: Chat;
  onDeleted?: () => void;
  onUpdated?: () => void;   // <-- tell parent to refresh
}

const sourceTypeColors: Record<string, string> = {
  chatgpt: "bg-neon-mint/20 text-neon-mint border-neon-mint/30",
  slack: "bg-neon-peach/20 text-neon-peach border-neon-peach/30",
  email: "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30",
  user: "bg-neon-violet/20 text-neon-violet border-neon-violet/30"
};

export function ChatCard({ chat, onDeleted, onUpdated }: ChatCardProps) {
  const { toast } = useToast();
  const sourceStyle =
    sourceTypeColors[chat.source_type] || sourceTypeColors.user;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !confirm(
        `Delete chat "${chat.title || "Untitled"}"? This cannot be undone.`
      )
    ) {
      return;
    }

    await deleteChat(chat.id);
    onDeleted?.();
  };

  const handlePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    await togglePinChat(chat.id, !chat.pinned);

    toast({
      title: chat.pinned ? "Chat unpinned" : "Chat pinned"
    });

    onUpdated?.();
  };

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
                  {formatDistanceToNow(new Date(chat.created_at + "Z"), {
                    addSuffix: true
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
