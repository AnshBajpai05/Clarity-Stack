import { Search, Filter, CheckCircle, Lightbulb, FileText, Code, AlertTriangle, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CardType } from './KnowledgeCard';
import { cn } from '@/lib/utils';

const filterButtons: { type: CardType | null; label: string; icon: typeof Filter }[] = [
  { type: null, label: 'All', icon: Filter },
  { type: 'decision', label: 'Decision', icon: CheckCircle },
  { type: 'insight', label: 'Insight', icon: Lightbulb },
  { type: 'action', label: 'Action', icon: FileText },
  { type: 'reference', label: 'Reference', icon: Code },
  { type: 'risk', label: 'Risk', icon: AlertTriangle },
  { type: 'unknown', label: 'Unknown', icon: HelpCircle },
];

interface CardFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedType: CardType | null;
  onTypeChange: (type: CardType | null) => void;
}

export function CardFilterBar({
  searchQuery,
  onSearchChange,
  selectedType,
  onTypeChange,
}: CardFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 bg-muted/50 border-glass focus:border-primary"
        />
      </div>

      {/* Type Filters */}
      <div className="flex gap-2 flex-wrap">
        {filterButtons.map(({ type, label, icon: Icon }) => (
          <Button
            key={label}
            variant={selectedType === type ? 'neon' : 'glass'}
            size="sm"
            onClick={() => onTypeChange(type)}
            className={cn(
              "gap-1.5 transition-all",
              selectedType === type && "shadow-[0_0_15px_hsl(var(--primary)/0.3)]"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
