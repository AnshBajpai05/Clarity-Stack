import {
  Message,
  setMessageAccepted,
  setMessageIncludeSummary
} from "@/lib/api";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { User, Bot, Shield, Megaphone, Star, Pin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";




interface MessageBubbleProps {
  message: Message;
  onRefresh?: () => void;
  dim?: boolean;
  onClick?: () => void;   // 🧠 ADD THIS

}
const roleConfig: any = {
  user: {
    icon: User,
    bgColor:
      "bg-gradient-to-br from-cyan-400/15 via-sky-500/10 to-blue-600/5 backdrop-blur-2xl",
    borderColor:
      "border border-cyan-300/30 ring-1 ring-white/10 shadow-[0_0_40px_-12px_rgba(34,211,238,0.45)]",
    avatarBg:
      "bg-gradient-to-br from-cyan-300/50 to-sky-400/30 backdrop-blur-lg",
    avatarText: "text-cyan-50 drop-shadow-[0_0_10px_rgba(34,211,238,0.9)]"
  },

  assistant: {
    icon: Bot,
    bgColor:
      "bg-gradient-to-br from-violet-400/15 via-indigo-500/10 to-fuchsia-600/5 backdrop-blur-2xl",
    borderColor:
      "border border-violet-300/30 ring-1 ring-white/10 shadow-[0_0_40px_-12px_rgba(139,92,246,0.5)]",
    avatarBg:
      "bg-gradient-to-br from-violet-400/50 to-fuchsia-400/30 backdrop-blur-lg",
    avatarText: "text-violet-50 drop-shadow-[0_0_10px_rgba(139,92,246,0.9)]"
  },

  synthesis: {
    icon: Star,
    bgColor:
      "bg-gradient-to-br from-emerald-400/18 via-teal-500/12 to-cyan-600/6 backdrop-blur-2xl",
    borderColor:
      "border border-emerald-300/35 ring-1 ring-white/10 shadow-[0_0_45px_-12px_rgba(16,185,129,0.55)]",
    avatarBg:
      "bg-gradient-to-br from-emerald-300/55 to-teal-400/35 backdrop-blur-lg",
    avatarText: "text-emerald-50 drop-shadow-[0_0_10px_rgba(16,185,129,1)]"
  },

  system: {
    icon: Shield,
    bgColor:
      "bg-gradient-to-br from-slate-400/15 via-zinc-500/10 to-neutral-600/5 backdrop-blur-2xl",
    borderColor:
      "border border-slate-300/30 ring-1 ring-white/10 shadow-[0_0_35px_-12px_rgba(148,163,184,0.45)]",
    avatarBg:
      "bg-gradient-to-br from-slate-300/45 to-zinc-400/25 backdrop-blur-lg",
    avatarText: "text-slate-50 drop-shadow-[0_0_8px_rgba(226,232,240,0.9)]"
  },

  moderator: {
    icon: Megaphone,
    bgColor:
      "bg-gradient-to-br from-pink-400/18 via-rose-500/12 to-red-600/6 backdrop-blur-2xl",
    borderColor:
      "border border-pink-300/35 ring-1 ring-white/10 shadow-[0_0_45px_-12px_rgba(244,63,94,0.55)]",
    avatarBg:
      "bg-gradient-to-br from-pink-400/55 to-rose-400/35 backdrop-blur-lg",
    avatarText: "text-pink-50 drop-shadow-[0_0_10px_rgba(244,63,94,1)]"
  }
};

export function MessageBubble({ message, onRefresh, dim, onClick }: MessageBubbleProps) {
  const { toast } = useToast();

  const config = roleConfig[message.role] || roleConfig.user;
  const Icon = config.icon;
  const isUser = message.role === "user";

  const timestamp = message.created_at
    ? format(new Date(message.created_at + "Z"), "MMM d, yyyy — h:mm a")
    : "";

  const handleAccept = async () => {
    try {
      await setMessageAccepted(message.id, !message.accepted);
      toast({
        title: !message.accepted ? "Accepted" : "Un-accepted",
        description: !message.accepted
          ? "Marked as best answer ⭐"
          : "Message removed as accepted"
      });
      onRefresh?.();
    } catch {
      toast({
        title: "Update failed",
        description: "Could not change accepted state",
        variant: "destructive"
      });
    }
  };

  const handleSummaryToggle = async () => {
    try {
      await setMessageIncludeSummary(
        message.id,
        !message.include_in_summary
      );
      toast({
        title: message.include_in_summary
          ? "Removed from summary"
          : "Added to summary"
      });
      onRefresh?.();
    } catch {
      toast({
        title: "Update failed",
        description: "Could not update summary state",
        variant: "destructive"
      });
    }
  };

  return (
      <div
        onClick={onClick}
        className={cn(
          "flex gap-3 animate-fade-in",
          isUser ? "flex-row-reverse" : "flex-row",
          onClick && "cursor-pointer"
        )}
      >

      <div
        className={cn(
          "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
          config.avatarBg
        )}
      >
        <Icon className={cn("w-5 h-5", config.avatarText)} />
      </div>

      <div className="flex flex-col max-w-[70%]">

      <div
        onClick={onClick}
        className={cn(
          "px-4 py-3 rounded-2xl border transition-all",
          config.bgColor,
          config.borderColor,
          isUser ? "rounded-tr-sm" : "rounded-tl-sm",
          (dim || (isUser && message.signal_level === "noise")) && "opacity-50",
          onClick && "cursor-pointer hover:ring-2 hover:ring-primary/40"
        )}
      >

          <p className="text-foreground whitespace-pre-wrap">
            {message.text}
          </p>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 mt-1.5 px-2",
            isUser ? "flex-row-reverse" : "flex-row"
          )}
        >
          <span className={cn("text-xs font-medium", config.avatarText)}>
            {message.sender}
          </span>

          <span className="text-xs text-muted-foreground">
            • {timestamp}
          </span>

          {isUser && message.signal_level && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`rounded-full px-2 py-0.5 border border-white/10 backdrop-blur text-[10px] ${
                    message.signal_level === "high"
                      ? "bg-green-500/20 text-green-300"
                      : message.signal_level === "medium"
                      ? "bg-yellow-500/20 text-yellow-300"
                      : message.signal_level === "low"
                      ? "bg-orange-500/20 text-orange-300"
                      : "bg-slate-500/20 text-slate-300"
                  }`}
                >
                  Signal: {message.signal_level}
                </span>
              </TooltipTrigger>

              <TooltipContent className="text-xs max-w-xs leading-relaxed">
                {message.signal_level === "high" && "High — Strong project-relevant context"}
                {message.signal_level === "medium" && "Medium — Contains useful context"}
                {message.signal_level === "low" && "Low — Weak project relevance"}
                {message.signal_level === "noise" && "Noise — Likely irrelevant or off-topic"}
              </TooltipContent>
            </Tooltip>
          )}

            {/* ⭐ — assistants only (no summary pin) */}
            {message.role === "assistant" && message.sender !== "synthesis" && (
              <button
                onClick={handleAccept}
                className={cn(
                  "text-xs flex items-center gap-1 px-2 py-1 rounded border",
                  message.accepted
                    ? "bg-yellow-400 text-black border-yellow-500"
                    : "bg-muted text-foreground border-muted-foreground/20"
                )}
              >
                <Star className="w-3 h-3" />
                {message.accepted ? "Accepted" : "Accept"}
              </button>
            )}

            {/* 📌 synthesis — ONLY place where summary is allowed */}
            {(message.role === "synthesis" || message.sender === "synthesis") && (
              <button
                onClick={handleSummaryToggle}
                className={cn(
                  "text-xs flex items-center gap-1 px-2 py-1 rounded border",
                  message.include_in_summary
                    ? "bg-sky-400 text-black border-sky-500"
                    : "bg-muted text-foreground border-muted-foreground/20"
                )}
              >
                <Pin className="w-3 h-3" />
                {message.include_in_summary ? "In Summary" : "Add to Summary"}
              </button>
            )}

        </div>
      </div>
    </div>
  );
}
