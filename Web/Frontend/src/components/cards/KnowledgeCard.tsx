import { cn } from '@/lib/utils';
import { CheckCircle, Lightbulb, FileText, Code, AlertTriangle, HelpCircle, Pencil } from 'lucide-react';

export type CardType = 'decision' | 'insight' | 'action' | 'reference' | 'risk' | 'unknown';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface KnowledgeCardData {
  id: string;
  chat_id: string;
  chat_title: string;
  project_id: string;
  type: CardType;
  title: string;
  summary: string;
  tags: string[];
  confidence: ConfidenceLevel;
  version: string;
  created_at: string;
  updated_at: string;
}

const typeConfig: Record<CardType, { icon: typeof CheckCircle; color: string; bg: string; border: string; label: string }> = {
  decision: {
    icon: CheckCircle,
    color: 'text-neon-cyan',
    bg: 'bg-neon-cyan/10',
    border: 'border-neon-cyan/30',
    label: 'Decision',
  },
  insight: {
    icon: Lightbulb,
    color: 'text-neon-violet',
    bg: 'bg-neon-violet/10',
    border: 'border-neon-violet/30',
    label: 'Insight',
  },
  action: {
    icon: FileText,
    color: 'text-neon-peach',
    bg: 'bg-neon-peach/10',
    border: 'border-neon-peach/30',
    label: 'Action',
  },
  reference: {
    icon: Code,
    color: 'text-neon-mint',
    bg: 'bg-neon-mint/10',
    border: 'border-neon-mint/30',
    label: 'Reference',
  },
  risk: {
    icon: AlertTriangle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    label: 'Risk',
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-muted-foreground',
    bg: 'bg-muted/20',
    border: 'border-muted/30',
    label: 'Unknown',
  },
};

const confidenceColors: Record<ConfidenceLevel, string> = {
  high: 'text-neon-mint',
  medium: 'text-neon-peach',
  low: 'text-destructive',
};

interface KnowledgeCardProps {
  card: KnowledgeCardData;
  onClick?: (card: KnowledgeCardData) => void;
}

export function KnowledgeCard({ card, onClick }: KnowledgeCardProps) {
  const config = typeConfig[card.type];
  const Icon = config.icon;

  return (
    <div
      onClick={() => onClick?.(card)}
      className={cn(
        "glass-panel-hover p-4 cursor-pointer group relative",
        "animate-fade-in w-full"
      )}
    >
      {/* Edit button */}
      <button
        className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
        onClick={(e) => {
          e.stopPropagation();
          // Future edit functionality
        }}
      >
        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {/* Type badge and source */}
      <div className="flex items-center gap-2 mb-2 pr-8">
        <span className={cn(
          "text-xs px-2 py-0.5 rounded-full border font-medium",
          config.bg,
          config.border,
          config.color
        )}>
          {config.label}
        </span>
        <span className="text-xs text-muted-foreground truncate">
          from {card.chat_title}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-foreground mb-2 text-sm leading-tight">
        {card.title}
      </h3>

      {/* Summary */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
        {card.summary}
      </p>

      {/* Tags */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {card.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground"
          >
            #{tag}
          </span>
        ))}
        {card.tags.length > 3 && (
          <span className="text-xs text-muted-foreground">+{card.tags.length - 3}</span>
        )}
      </div>

      {/* Footer - Confidence & Version */}
      <div className="flex items-center justify-between text-xs">
        <span className={cn("font-medium", confidenceColors[card.confidence])}>
          Confidence: {card.confidence.charAt(0).toUpperCase() + card.confidence.slice(1)}
        </span>
        <span className="text-muted-foreground font-mono">
          {card.version}
        </span>
      </div>
    </div>
  );
}
