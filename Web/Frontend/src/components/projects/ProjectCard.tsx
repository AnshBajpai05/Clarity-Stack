import { FolderKanban, ChevronRight, Clock, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Project } from '@/lib/api';
import { formatDistanceToNow } from "date-fns";
import { useState } from 'react';
import { GlareCard } from '@/components/ui/glare-card';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(project.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <GlareCard containerClassName="w-full aspect-auto" className="bg-card/90">
    <Link
      to={`/projects/${project.id}/chats`}
      className="p-6 group block h-full"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-violet/20 flex items-center justify-center border border-primary/20 group-hover:border-primary/40 group-hover:shadow-glow-sm transition-[color,background-color,border-color,box-shadow,transform] duration-normal ease-smooth">
            <FolderKanban className="w-7 h-7 text-primary transition-[color] duration-normal group-hover:text-primary-foreground group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] mix-blend-screen" />
          </div>
            <div>
              <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-primary transition-[color] duration-fast">
                {project.name}
              </h3>
              <div className="flex flex-col gap-2 mt-2.5">
                <div className="flex items-center gap-2 text-xs font-mono text-primary/80 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-md w-fit">
                  <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70">Project ID:</span>
                  <span>{project.id}</span>
                  <button 
                    onClick={handleCopy}
                    className="ml-1 p-1 hover:bg-primary/25 rounded transition-[color,background-color] duration-fast ease-smooth text-primary"
                    title="Copy Project ID"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-neon-mint" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4 opacity-70" />
                  <span>
                    {formatDistanceToNow(
                      new Date(project.created_at.endsWith("Z") ? project.created_at : project.created_at + "Z"),
                      { addSuffix: true }
                    )}
                  </span>
                </div>
              </div>
            </div>
        </div>
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent group-hover:bg-primary/10 transition-[background-color] duration-normal ease-smooth">
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-[color,transform] duration-normal ease-smooth" />
        </div>
      </div>
    </Link>
    </GlareCard>
  );
}
