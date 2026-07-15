import { NavLink, useLocation } from 'react-router-dom';
import { FolderKanban, Layers, Settings, Sparkles, Globe, FileSearch, Edit3, GitMerge, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/discovery', icon: Globe, label: 'Discovery Hub' },
  { to: '/project-search', icon: UserPlus, label: 'Join Project' },
  { to: '/srs/dashboard', icon: FileSearch, label: 'Analyse SRS Document' },
  { to: '/editor/dashboard', icon: Edit3, label: 'Collab Editor' },
  { to: '/uml/dashboard', icon: GitMerge, label: 'UML-Clarity' },
  { to: '/cards', icon: Layers, label: 'Global Cards' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside
      data-tour="sidebar"
      className="fixed left-0 top-0 h-screen w-64 glass-panel border-r border-border/30 flex flex-col z-50"
    >
      {/* Logo */}
      <div className="p-6 border-b border-border/20">
        <NavLink to="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan via-neon-violet to-neon-peach flex items-center justify-center shadow-elevated group-hover:shadow-glow transition-[box-shadow] duration-slow ease-smooth">
              <Sparkles className="w-5 h-5 text-background" />
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-violet opacity-0 group-hover:opacity-40 blur-xl transition-opacity duration-slow" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-foreground tracking-tight">ClarityStack</h1>
            <p className="text-xs text-muted-foreground">Knowledge System</p>
          </div>
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center gap-3 px-4 py-2.5 rounded-xl transition-[color,background-color,border-color,box-shadow,transform] duration-normal ease-smooth",
                isActive
                  ? "bg-primary/12 text-primary border border-primary/25 shadow-glow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary shadow-glow-sm" />
              )}
              <Icon className={cn("w-[18px] h-[18px] transition-[color] duration-fast", isActive ? "text-primary" : "group-hover:text-foreground")} />
              <span className="font-medium text-[13px]">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border/20">
        <div className="glass-panel p-4 rounded-xl">
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            <span className="text-neon-peach select-none" aria-hidden="true">~ </span>
            Turn messy chats into structured knowledge.
            <span className="text-neon-peach select-none" aria-hidden="true"> ~</span>
          </p>
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-neon-violet animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-2 h-2 rounded-full bg-neon-peach animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
