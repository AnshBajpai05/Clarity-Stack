import { useState, useEffect, useCallback } from 'react';
import { Plus, FolderKanban, Sparkles, Info, Search } from 'lucide-react';
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
  CreateProjectPayload,
  isDemoMode
} from '@/lib/api';

import { useToast } from '@/hooks/use-toast';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const { toast } = useToast();

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

  const demoMode = isDemoMode();

  return (
    <MainLayout>
      {/* Demo Mode Banner */}
      {demoMode && !isLoading && (
        <div className="mb-6 glass-panel p-4 border-neon-peach/30 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neon-peach/20 flex items-center justify-center">
              <Info className="w-4 h-4 text-neon-peach" />
            </div>
            <div>
              <p className="text-sm font-medium text-neon-peach">Demo Mode</p>
              <p className="text-xs text-muted-foreground">
                Backend unavailable. Using sample data. Connect to
                <code className="px-1 py-0.5 rounded bg-muted text-foreground">
                  http://127.0.0.1:8000
                </code>
                for live data.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-violet flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-background" />
            </div>
            <h1 className="text-3xl font-bold gradient-text">Projects</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your knowledge projects and chat histories.
          </p>
        </div>
        <Button variant="outline" className="border-purple-500/50 hover:bg-purple-600/20" onClick={() => window.location.href = '/projects/search'}>
          <Search className="w-4 h-4 mr-2" />
          Discover Projects
        </Button>
      </div>

      {/* Content */}
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
            <Button variant="neon" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Project
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {/* Floating Button */}
      {projects.length > 0 && (
        <Button
          variant="default"
          size="lg"
          className="fixed bottom-8 right-8 shadow-2xl shadow-primary/30 animate-glow"
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
