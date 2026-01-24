import { cn } from '@/lib/utils';
import { KnowledgeCard, KnowledgeCardData } from './KnowledgeCard';
import { MessageSquare, User, Clock } from 'lucide-react';

interface ChatColumnProps {
  chatId: string;
  chatTitle: string;
  phase?: string;
  owner?: string;
  cards: KnowledgeCardData[];
  onCardClick?: (card: KnowledgeCardData) => void;
}

export function ChatColumn({ chatTitle, phase, owner, cards, onCardClick }: ChatColumnProps) {
  return (
    <div className="flex-shrink-0 w-80 flex flex-col h-full">
      {/* Chat Header - Frosted Glass */}
      <div className="glass-panel p-3 mb-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground truncate flex-1">
            {chatTitle}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {phase && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{phase}</span>
            </div>
          )}
          {owner && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>{owner}</span>
            </div>
          )}
          <span className="ml-auto">{cards.length} cards</span>
        </div>
      </div>

      {/* Cards Stack - Vertical Scroll */}
      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 space-y-3">
        {cards.map((card, index) => (
          <div
            key={card.id}
            className="animate-fade-in"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <KnowledgeCard card={card} onClick={onCardClick} />
          </div>
        ))}
        
        {cards.length === 0 && (
          <div className="glass-panel p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No cards in this chat yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
