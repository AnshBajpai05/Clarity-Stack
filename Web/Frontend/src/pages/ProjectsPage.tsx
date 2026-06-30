import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, Sparkles, Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';

import {
  getProjects,
  createProject,
  Project,
  CreateProjectPayload
} from '@/lib/api';

import { useToast } from '@/hooks/use-toast';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (payload: CreateProjectPayload) => {
    setIsCreating(true);

    try {
      await createProject(payload);

      toast({
        title: 'Project created',
        description: `"${payload.name}" has been created successfully.`,
      });

      setIsModalOpen(false);
      fetchProjects();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create project',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-8 flex justify-between items-center animate-fade-in-up">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-violet flex items-center justify-center shadow-glow-sm">
              <Sparkles className="w-5 h-5 text-background" />
            </div>
            <h1 className="text-3xl font-display font-bold gradient-text tracking-tight">
              {localStorage.getItem('cs_nickname') ? `Hello, ${localStorage.getItem('cs_nickname')}` : 'Projects'}
            </h1>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Manage your knowledge projects and chat histories.
          </p>
        </div>
        <Button variant="outline" data-tour="discover-projects" onClick={() => navigate('/projects/search')}>
          <Search className="w-4 h-4" />
          Discover Projects
        </Button>
      </div>

      {/* Content */}
      <div className="animate-fade-in-up stagger-1">
        {isLoading ? (
          <LoadingSpinner className="py-20" text="Loading projects..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchProjects} />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project to start organizing your knowledge."
            action={
              <Button variant="neon" data-tour="new-project" onClick={() => setIsModalOpen(true)}>
                <Plus className="w-4 h-4" />
                Create Project
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {projects.map((project, idx) => (
              <div key={project.id} data-tour={idx === 0 ? "project-card" : undefined} className={`animate-fade-in-up stagger-${(idx % 5) + 1}`}>
                <ProjectCard project={project} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Button */}
      {projects.length > 0 && (
        <Button
          variant="default"
          size="lg"
          data-tour="new-project"
          className="fixed bottom-8 right-8 shadow-elevated hover:shadow-glow transition-all duration-normal ease-spring z-40 rounded-full pr-5 pl-4"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus className="w-5 h-5" />
          New Project
        </Button>
      )}

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateProject}
        isLoading={isCreating}
      />
    </MainLayout>
  );
}
