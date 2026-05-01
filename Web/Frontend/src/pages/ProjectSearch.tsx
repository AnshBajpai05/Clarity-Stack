import React, { useState } from 'react';
import { Search, FolderKanban, LogIn, Sparkles } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { searchProjects, requestToJoinProject, Project } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export default function ProjectSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await searchProjects({ projectId: query });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (projectId: string) => {
    try {
      await requestToJoinProject(projectId);
      toast({
        title: 'Request sent',
        description: 'Your request to join the project has been sent to the Project Manager.',
      });
    } catch (err) {
      toast({
        title: 'Failed to send request',
        description: err instanceof Error ? err.message : 'You might already have a pending request or are already a member.',
        variant: 'destructive',
      });
    }
  };

  return (
    <MainLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-purple to-neon-pink flex items-center justify-center">
            <Search className="w-5 h-5 text-background" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">Join Project</h1>
        </div>
        <p className="text-muted-foreground">
          Enter a specific project ID to request access and join a team.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8 glass-panel p-6 border border-white/5 space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Enter exact project ID (e.g. d241f66a...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <Button type="submit" variant="neon" size="lg" disabled={!query.trim() || isLoading}>
            Search
          </Button>
        </div>
      </form>

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner className="py-20" text="Searching projects..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => handleSearch} />
      ) : results.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Results ({results.length})</h2>
          {results.map((project) => (
            <div key={project.id} className="relative group">
              <ProjectCard project={project} />
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-purple-600/20 hover:bg-purple-600 border-purple-500/50"
                  onClick={() => handleJoin(project.id)}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Request to Join
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : query && !isLoading ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects found"
          description={`We couldn't find a project matching this ID. Please check the ID and try again.`}
        />
      ) : null}
    </MainLayout>
  );
}
