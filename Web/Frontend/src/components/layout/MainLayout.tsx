import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: ReactNode;
  fullWidth?: boolean;
  wide?: boolean;
}

export function MainLayout({ children, fullWidth = false, wide = false }: MainLayoutProps) {
  return (
    <div className="h-screen w-screen relative overflow-hidden bg-background">
      {/* Background orbs — deeper blur, more subtle */}
      <div className="glow-orb w-[28rem] h-[28rem] bg-neon-violet top-20 -left-48 fixed" />
      <div className="glow-orb w-[24rem] h-[24rem] bg-neon-cyan bottom-20 right-10 fixed" />
      <div className="glow-orb w-[20rem] h-[20rem] bg-neon-peach top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fixed opacity-[0.06]" />
      
      {!fullWidth && <Sidebar />}
      
      <main className={cn(
        "flex flex-col h-screen overflow-y-auto scrollbar-thin transition-[margin] duration-slow ease-smooth",
        fullWidth ? "ml-0 w-screen" : "ml-64 p-6"
      )}>
        <div className={cn(
          "flex-1 flex flex-col min-h-0",
          (!fullWidth && !wide) && "max-w-6xl mx-auto w-full animate-fade-in",
          (fullWidth || wide) && "h-full w-full"
        )}>
          {children}
        </div>
      </main>
    </div>
  );
}
