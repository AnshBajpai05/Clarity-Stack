import { cn } from '@/lib/utils';
import { ChevronDown, Folder, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export interface Project {
  id: string;
  name: string;
}

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string | null) => void;
}

export function ProjectSelector({ projects, selectedProjectId, onSelect }: ProjectSelectorProps) {
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="glass" className="gap-2 min-w-[180px] justify-between">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-primary" />
            <span className="truncate">
              {selectedProject?.name || 'All Projects'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 glass-panel border-glass">
        <DropdownMenuItem
          onClick={() => onSelect(null)}
          className={cn(
            "flex items-center gap-2 cursor-pointer",
            !selectedProjectId && "bg-primary/10"
          )}
        >
          <Folder className="w-4 h-4" />
          <span className="flex-1">All Projects</span>
          {!selectedProjectId && <Check className="w-4 h-4 text-primary" />}
        </DropdownMenuItem>
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => onSelect(project.id)}
            className={cn(
              "flex items-center gap-2 cursor-pointer",
              selectedProjectId === project.id && "bg-primary/10"
            )}
          >
            <Folder className="w-4 h-4" />
            <span className="flex-1 truncate">{project.name}</span>
            {selectedProjectId === project.id && <Check className="w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
