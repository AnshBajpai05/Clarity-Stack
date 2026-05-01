import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background orbs */}
      <div className="glow-orb w-96 h-96 bg-neon-violet top-20 -left-48 fixed" />
      <div className="glow-orb w-80 h-80 bg-neon-cyan bottom-20 right-10 fixed" />
      <div className="glow-orb w-64 h-64 bg-neon-peach top-1/2 left-1/3 fixed" />
      
      <Sidebar />
      
      <main className="ml-64 min-h-screen p-8">
        <div className="max-w-6xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
