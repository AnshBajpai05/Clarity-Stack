import { KnowledgeCardData, CardType, ConfidenceLevel } from './KnowledgeCard';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  Lightbulb, 
  FileText, 
  Code, 
  AlertTriangle, 
  HelpCircle,
  ExternalLink,
  Pencil,
  Calendar,
  Clock,
  Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';

const typeConfig: Record<CardType, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  decision: { icon: CheckCircle, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', label: 'Decision' },
  insight: { icon: Lightbulb, color: 'text-neon-violet', bg: 'bg-neon-violet/10', label: 'Insight' },
  action: { icon: FileText, color: 'text-neon-peach', bg: 'bg-neon-peach/10', label: 'Action' },
  reference: { icon: Code, color: 'text-neon-mint', bg: 'bg-neon-mint/10', label: 'Reference' },
  risk: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Risk' },
  unknown: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted/20', label: 'Unknown' },
};

const confidenceColors: Record<ConfidenceLevel, string> = {
  high: 'text-neon-mint bg-neon-mint/10',
  medium: 'text-neon-peach bg-neon-peach/10',
  low: 'text-destructive bg-destructive/10',
};

interface CardDetailDrawerProps {
  card: KnowledgeCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardDetailDrawer({ card, open, onOpenChange }: CardDetailDrawerProps) {
  if (!card) return null;

  const config = typeConfig[card.type];
  const Icon = config.icon;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <div className="overflow-y-auto scrollbar-thin">
          <DrawerHeader className="text-left">
            {/* Type Badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className={cn(
                "inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full",
                config.bg,
                config.color
              )}>
                <Icon className="w-4 h-4" />
                {config.label}
              </span>
              <span className={cn(
                "text-sm px-3 py-1 rounded-full",
                confidenceColors[card.confidence]
              )}>
                {card.confidence.charAt(0).toUpperCase() + card.confidence.slice(1)} Confidence
              </span>
              <span className="text-sm px-3 py-1 rounded-full bg-muted text-muted-foreground font-mono">
                {card.version}
              </span>
            </div>

            <DrawerTitle className="text-xl">{card.title}</DrawerTitle>
            <DrawerDescription className="text-muted-foreground">
              from {card.chat_title}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-6">
            {/* Summary */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Summary</h4>
              <p className="text-muted-foreground leading-relaxed">
                {card.summary}
              </p>
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-foreground">Tags</h4>
              </div>
              <div className="flex gap-2 flex-wrap">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-sm px-3 py-1 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors cursor-default"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Timestamps */}
            <div className="glass-panel p-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Created:</span>
                <span className="text-foreground">{formatDate(card.created_at)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Updated:</span>
                <span className="text-foreground">{formatDate(card.updated_at)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="neon" className="flex-1 gap-2">
                <ExternalLink className="w-4 h-4" />
                Open Chat
              </Button>
              <Button variant="glass" className="gap-2">
                <Pencil className="w-4 h-4" />
                Edit
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
