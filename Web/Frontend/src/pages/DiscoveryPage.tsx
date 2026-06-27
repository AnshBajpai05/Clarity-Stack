import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { getDiscoveryFeed, getFollowing, followProject, unfollowProject, sendJoinEmail, getPublicProjects, getCurrentUserEmail } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Globe, Heart, Send, Activity, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function DiscoveryPage() {
  const { toast } = useToast();

  const [feed, setFeed] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [publicProjects, setPublicProjects] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Public projects load independently — never crashes the page
      const projects = await getPublicProjects();
      setPublicProjects(projects);
    } catch {
      toast({ title: "Failed to load public projects", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }

    // Satellite calls are non-fatal — they can fail without breaking Discovery
    try {
      const [feedData, follows] = await Promise.all([
        getDiscoveryFeed(),
        getFollowing(),
      ]);
      setFeed(feedData);
      setFollowingIds(follows);
    } catch {
      // Satellite service unavailable — feed/follow silently disabled
      console.warn("Satellite service unavailable — feed and follow features disabled.");
    }
  }, [toast]);

  // Debounced server-side search for public projects
  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await getPublicProjects(searchQuery || undefined);
        setPublicProjects(results);
      } catch {
        // silently ignore search errors
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleFollow = async (projectId: string) => {
    setIsActioning(projectId);
    try {
      if (followingIds.includes(projectId)) {
        await unfollowProject(projectId);
        setFollowingIds(prev => prev.filter(id => id !== projectId));
        toast({ title: "Unfollowed project" });
      } else {
        await followProject(projectId);
        setFollowingIds(prev => [...prev, projectId]);
        toast({ title: "Followed project" });
      }
      // Reload feed
      const feedData = await getDiscoveryFeed();
      setFeed(feedData);
    } catch (err) {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setIsActioning(null);
    }
  };

  const handleRequestJoin = async (projectId: string) => {
    setIsActioning(`join-${projectId}`);
    try {
      await sendJoinEmail(projectId);
      toast({ 
        title: "Join Request Sent", 
        description: "An email has been sent to the Project Manager." 
      });
    } catch (err: any) {
      toast({ title: "Failed to send request", description: err.message, variant: "destructive" });
    } finally {
      setIsActioning(null);
    }
  };

  // publicProjects are already filtered server-side, but exclude the logged-in user's own projects
  const currentUserEmail = getCurrentUserEmail();
  const discoverableProjects = publicProjects.filter(
    (p) => !currentUserEmail || p.owner !== currentUserEmail
  );

  return (
    <MainLayout>
      <div className="flex flex-col h-full max-w-6xl mx-auto w-full gap-6 pb-12">
        {/* Header */}
        <div className="flex justify-between items-center glass-panel p-6 rounded-2xl animate-fade-in-up">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-violet flex items-center justify-center shadow-glow-sm">
              <Globe className="w-6 h-6 text-background" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold gradient-text tracking-tight">Discovery Hub</h1>
              <p className="text-muted-foreground leading-relaxed">Find projects, follow updates, and request access</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COL: Feed */}
          <div className="lg:col-span-2 space-y-4 animate-fade-in-up stagger-1">
            <h2 className="text-lg font-display font-semibold flex items-center gap-2 mb-4 tracking-tight">
              <Activity className="w-5 h-5 text-neon-cyan" />
              Activity Feed from Followed Projects
            </h2>
            
            {isLoading ? (
              <LoadingSpinner text="Loading feed..." />
            ) : feed.length === 0 ? (
              <div className="glass-panel rounded-xl p-8 text-center text-muted-foreground">
                <Info className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No recent activity found in your network.</p>
                <p className="text-sm">Follow some projects to see their updates here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {feed.map((item, idx) => {
                  const proj = publicProjects.find(p => p.id === item.projectId);
                  return (
                    <div key={item._id} className={`glass-panel-hover p-5 rounded-xl transition-all animate-fade-in-up stagger-${(idx % 5) + 1}`}>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-display font-semibold text-foreground">
                          {proj ? proj.name : `Project ${item.projectId.substring(0,8)}`}
                        </h4>
                        <span className="text-xs text-muted-foreground">{new Date(item.computedAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                        Graph Delta Computed: <span className="text-neon-mint">+{item.totalAdded} Additions</span>, <span className="text-neon-peach">-{item.totalRemoved} Removals</span>
                      </p>
                      
                      {item.totalAdded > 0 && (
                        <div className="text-xs bg-background/50 p-3 rounded border border-border">
                          <p className="font-semibold text-muted-foreground mb-1">New Intelligence Added:</p>
                          <ul className="space-y-1">
                            {item.addedNodes.slice(0, 3).map((n:any, i:number) => (
                              <li key={i} className="truncate">
                                <span className="text-neon-cyan mr-1">[{n.section}]</span> {n.content}
                              </li>
                            ))}
                            {item.addedNodes.length > 3 && <li>...and {item.addedNodes.length - 3} more</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT COL: Search & Discover */}
          <div className="space-y-6 animate-fade-in-up stagger-2">
            <div className="glass-panel p-5 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-semibold tracking-tight">Explore Projects</h2>
                <span className="text-xs bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30 px-2 py-0.5 rounded-full">
                  {discoverableProjects.length} public
                </span>
              </div>
              <Input 
                placeholder="Search public projects..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-4 bg-background/50 border-border"
              />
              
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {isSearching && (
                  <p className="text-center text-muted-foreground text-sm py-2">Searching...</p>
                )}
                {!isSearching && discoverableProjects.map(proj => {
                  const isFollowing = followingIds.includes(proj.id);
                  return (
                    <div key={proj.id} className="glass-card p-4 flex flex-col gap-3 transition-colors hover:border-primary/40">
                      <div>
                        <h4 className="font-display font-medium text-foreground truncate">{proj.name}</h4>
                        <p className="text-xs text-muted-foreground truncate">{proj.purpose}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant={isFollowing ? "outline" : "secondary"}
                          size="sm" 
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleToggleFollow(proj.id)}
                          disabled={isActioning === proj.id}
                        >
                          <Heart className={`w-3.5 h-3.5 mr-1.5 ${isFollowing ? 'fill-neon-peach text-neon-peach' : ''}`} />
                          {isFollowing ? 'Following' : 'Follow'}
                        </Button>
                        <Button 
                          variant="neon" 
                          size="sm" 
                          className="flex-1 h-8 text-xs"
                          onClick={() => handleRequestJoin(proj.id)}
                          disabled={isActioning === `join-${proj.id}`}
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          Join Req
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {!isSearching && discoverableProjects.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">
                    {searchQuery ? `No public projects match "${searchQuery}"` : "No public projects yet. Create one and set it to Public!"}
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
