import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { getDiscoveryFeed, getFollowing, followProject, unfollowProject, sendJoinEmail, getProjects } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Globe, Heart, Send, Activity, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function DiscoveryPage() {
  const { toast } = useToast();

  const [feed, setFeed] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState<string | null>(null); // projectId currently being acted upon

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [feedData, follows, projects] = await Promise.all([
        getDiscoveryFeed(),
        getFollowing(),
        getProjects() // Getting all available projects for the search/discovery
      ]);
      setFeed(feedData);
      setFollowingIds(follows);
      setAllProjects(projects);
    } catch (err) {
      toast({ title: "Failed to load discovery data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

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

  // Filter projects not owned by current user (for discovery)
  const discoverableProjects = allProjects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.id.includes(searchQuery)
  );

  return (
    <MainLayout>
      <div className="flex flex-col h-full max-w-6xl mx-auto w-full gap-6 pb-12">
        {/* Header */}
        <div className="flex justify-between items-center bg-card/40 border border-border p-6 rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-blue flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">Discovery Hub</h1>
              <p className="text-muted-foreground">Find projects, follow updates, and request access</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COL: Feed */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-neon-blue" />
              Activity Feed from Followed Projects
            </h2>
            
            {isLoading ? (
              <LoadingSpinner text="Loading feed..." />
            ) : feed.length === 0 ? (
              <div className="bg-card/30 border border-border rounded-xl p-8 text-center text-muted-foreground">
                <Info className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No recent activity found in your network.</p>
                <p className="text-sm">Follow some projects to see their updates here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {feed.map((item) => {
                  const proj = allProjects.find(p => p.id === item.projectId);
                  return (
                    <div key={item._id} className="bg-card/50 border border-border rounded-xl p-5 hover:border-neon-cyan/30 transition-all">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-slate-200">
                          {proj ? proj.name : `Project ${item.projectId.substring(0,8)}`}
                        </h4>
                        <span className="text-xs text-muted-foreground">{new Date(item.computedAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-slate-400 mb-4">
                        Graph Delta Computed: <span className="text-neon-green">+{item.totalAdded} Additions</span>, <span className="text-neon-peach">-{item.totalRemoved} Removals</span>
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
          <div className="space-y-6">
            <div className="bg-card/40 border border-border rounded-xl p-5 backdrop-blur-md">
              <h2 className="text-lg font-semibold mb-4">Explore Projects</h2>
              <Input 
                placeholder="Search by name or ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-4 bg-background/50 border-border"
              />
              
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {discoverableProjects.map(proj => {
                  const isFollowing = followingIds.includes(proj.id);
                  return (
                    <div key={proj.id} className="bg-background/80 border border-border p-4 rounded-lg flex flex-col gap-3">
                      <div>
                        <h4 className="font-medium truncate">{proj.name}</h4>
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
                {discoverableProjects.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">No matching projects found.</p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
