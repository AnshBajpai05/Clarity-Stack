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
    <aside data-tour="sidebar" className="fixed left-0 top-0 h-screen w-64 glass-panel border-r border-glass flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-glass/50">
        <NavLink to="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan via-neon-violet to-neon-peach flex items-center justify-center shadow-lg shadow-primary/30">
              <Sparkles className="w-5 h-5 text-background" />
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-violet opacity-0 group-hover:opacity-50 blur-xl transition-opacity" />
          </div>
          <div>
            <h1 className="font-semibold text-lg text-foreground">ClarityStack</h1>
            <p className="text-xs text-muted-foreground">Knowledge System</p>
          </div>
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30 shadow-lg shadow-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-glass/50">
        <div className="glass-panel p-4 rounded-xl">
          <p className="text-xs text-muted-foreground mb-2">
            Turn messy chats into structured knowledge.
          </p>
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-neon-violet animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-2 h-2 rounded-full bg-neon-peach animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
