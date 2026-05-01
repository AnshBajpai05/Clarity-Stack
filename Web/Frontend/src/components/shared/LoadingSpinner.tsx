import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  text?: string;
}

export function LoadingSpinner({ className, text = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <div className="absolute inset-0 w-10 h-10 rounded-full bg-primary/20 blur-xl animate-pulse" />
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
    </div>
  );
}
