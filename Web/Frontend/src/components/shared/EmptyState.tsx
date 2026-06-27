import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-5 py-16 animate-fade-in-up", className)}>
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-neon-cyan/15 to-neon-violet/15 border border-primary/25 flex items-center justify-center shadow-glow-sm">
          <Icon className="w-10 h-10 text-primary" />
        </div>
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full -z-10 animate-pulse-slow opacity-60" />
      </div>
      <div className="text-center max-w-sm mt-2">
        <h3 className="font-display font-semibold text-xl text-foreground mb-2 tracking-tight">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
