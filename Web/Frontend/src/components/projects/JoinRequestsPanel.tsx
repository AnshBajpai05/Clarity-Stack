import { useEffect, useState } from 'react';
import { Check, X, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getJoinRequests, updateJoinRequest } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { stringToColor, getInitials } from '@/lib/colors';

interface JoinRequest {
  id: string;
  user_email: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface Props {
  projectId: string;
  isOwnerOrPm: boolean;
}

export function JoinRequestsPanel({ projectId, isOwnerOrPm }: Props) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  useEffect(() => {
    if (!isOwnerOrPm) return;
    fetchRequests();
    const interval = setInterval(fetchRequests, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, [projectId, isOwnerOrPm]);

  async function fetchRequests() {
    try {
      const data = await getJoinRequests(projectId);
      setRequests(data);
    } catch {
      // silently fail — user might not be PM
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(requestId: string, status: 'accepted' | 'rejected') {
    try {
      await updateJoinRequest(requestId, status);
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r));
      toast({
        title: status === 'accepted' ? '✅ Request Approved' : '❌ Request Rejected',
        description: status === 'accepted'
          ? 'The user has been added as a project member.'
          : 'The join request has been rejected.',
      });
    } catch {
      toast({ title: 'Failed to update request', variant: 'destructive' });
    }
  }

  if (!isOwnerOrPm || loading) return null;

  return (
    <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Join Requests</span>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-pulse">
              {pendingCount}
            </span>
          )}
        </div>
      </div>

      {/* Request list */}
      <div className="divide-y divide-white/5">
        {requests.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">
            No join requests yet.
          </p>
        ) : (
          requests.map(req => {
            const color = stringToColor(req.user_email);
            const initials = getInitials(req.user_email);
            return (
              <div key={req.id} className="flex items-center gap-3 p-3">
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>

                {/* Email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{req.user_email}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{req.status}</p>
                </div>

                {/* Actions */}
                {req.status === 'pending' ? (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 hover:bg-emerald-500/20 hover:text-emerald-400"
                      onClick={() => handleDecision(req.id, 'accepted')}
                      title="Approve"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 hover:bg-red-500/20 hover:text-red-400"
                      onClick={() => handleDecision(req.id, 'rejected')}
                      title="Reject"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    req.status === 'accepted'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {req.status}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
