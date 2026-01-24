import { FolderKanban, ChevronRight, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Project } from '@/lib/api';
import { formatDistanceToNow } from "date-fns";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
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
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
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
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  );
}
