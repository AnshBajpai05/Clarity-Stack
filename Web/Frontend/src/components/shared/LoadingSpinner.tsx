import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

const DIM = { sm: 'w-4 h-4', md: 'w-10 h-10', lg: 'w-14 h-14' } as const;

export function LoadingSpinner({ className, text = 'Loading...', size = 'md' }: LoadingSpinnerProps) {
  const dim = DIM[size];

  // Compact inline spinner (e.g. inside buttons) — no text, no glow.
  if (size === 'sm') {
    return <Loader2 className={cn(dim, 'text-primary animate-spin', className)} />;
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative">
        <Loader2 className={cn(dim, 'text-primary animate-spin')} />
        <div className={cn('absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse-slow', dim)} />
      </div>
      {text && <p className="text-muted-foreground font-medium text-sm animate-pulse-slow">{text}</p>}
    </div>
  );
}
