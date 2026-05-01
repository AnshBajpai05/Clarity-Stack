import { FolderKanban, ChevronRight, Clock, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Project } from '@/lib/api';
import { formatDistanceToNow } from "date-fns";
import { useState } from 'react';

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
    <Link
      to={`/projects/${project.id}/chats`}
      className="glass-panel-hover p-5 group block"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-violet/20 flex items-center justify-center border border-primary/20 group-hover:border-primary/40 transition-colors">
            <FolderKanban className="w-6 h-6 text-primary" />
          </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {project.name}
              </h3>
              <div className="flex flex-col gap-1 mt-2">
                <div className="flex items-center gap-2 text-xs font-mono text-primary/80 bg-primary/5 border border-primary/10 px-2 py-1 rounded-md w-fit">
                  <span className="font-semibold uppercase tracking-wider text-[10px] opacity-70">Project ID:</span>
                  <span>{project.id}</span>
                  <button 
                    onClick={handleCopy}
                    className="ml-1 p-1 hover:bg-primary/20 rounded transition-colors text-primary"
                    title="Copy Project ID"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    {formatDistanceToNow(
                      new Date(project.created_at + "Z"),
                      { addSuffix: true }
                    )}
                  </span>
                </div>
              </div>
            </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  );
}
