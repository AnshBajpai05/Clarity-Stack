import { useState, useEffect, useCallback } from 'react';
import {
  Users, Activity, Inbox, Trash2, Shield, X,
  ChevronDown, Crown, UserCheck, Eye, UserMinus,
  Check, XIcon, Loader2, AlertTriangle, UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  getProjectMembers, updateMemberRole, removeMember,
  getJoinRequests, updateJoinRequest, inviteToProject,
  getActivityLogs, deleteProject,
  ProjectMember, ActivityLog
} from '@/lib/api';

/* ── helpers ───────────────────────────────────────────── */
const ACCENT = ['#7c3aed','#4f46e5','#2563eb','#0891b2','#059669','#d97706','#dc2626','#db2777'];
const colorFor = (s='') => ACCENT[s.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % ACCENT.length];
const initials = (email='') => email.split('@')[0].slice(0,2).toUpperCase();
const roleIcon = (role: string) => {
  if (role==='owner') return <Crown className="w-3.5 h-3.5 text-yellow-400" />;
  if (role==='pm')    return <Shield className="w-3.5 h-3.5 text-violet-400" />;
  if (role==='viewer')return <Eye className="w-3.5 h-3.5 text-slate-400" />;
  return <UserCheck className="w-3.5 h-3.5 text-cyan-400" />;
};
const roleBadge: Record<string,string> = {
  owner:  'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  pm:     'bg-violet-400/10 text-violet-400 border-violet-400/30',
  member: 'bg-cyan-400/10   text-cyan-400   border-cyan-400/30',
  viewer: 'bg-slate-400/10  text-slate-400  border-slate-400/30',
};
const ACTION_LABELS: Record<string,{label:string;color:string}> = {
  user_joined:       {label:'Joined',         color:'text-green-400'},
  user_removed:      {label:'Removed',        color:'text-red-400'},
  request_approved:  {label:'Request Approved',color:'text-blue-400'},
  role_changed:      {label:'Role Changed',   color:'text-violet-400'},
  knowledge_updated: {label:'Knowledge Updated',color:'text-cyan-400'},
};
function fmtDate(iso:string){
  try{ return new Date(iso.endsWith('Z')?iso:`${iso}Z`).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}); }
  catch{ return iso; }
}

/* ── types ─────────────────────────────────────────────── */
interface JoinReq{ id:string; user_email:string; status:string; }
type Tab = 'members'|'requests'|'activity'|'danger';

interface Props {
  projectId: string;
  projectName: string;
  currentUserEmail: string;
  currentUserRole: 'owner'|'pm'|'member'|'viewer';
  onClose: ()=>void;
  onProjectDeleted: ()=>void;
}

/* ── main component ─────────────────────────────────────── */
export function ProjectSettingsPanel({ projectId, projectName, currentUserEmail, currentUserRole, onClose, onProjectDeleted }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('members');

  /* members */
  const [members,  setMembers]  = useState<ProjectMember[]>([]);
  const [loadingM, setLoadingM] = useState(true);

  /* join requests */
  const [requests,  setRequests]  = useState<JoinReq[]>([]);
  const [loadingR,  setLoadingR]  = useState(false);

  /* activity */
  const [logs,     setLogs]     = useState<ActivityLog[]>([]);
  const [loadingL, setLoadingL] = useState(false);

  /* invite */
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting,    setInviting]    = useState(false);

  /* delete */
  const [confirmName,  setConfirmName]  = useState('');
  const [deleting,     setDeleting]     = useState(false);

  const isPrivileged = currentUserRole === 'owner' || currentUserRole === 'pm';

  /* fetch members */
  const fetchMembers = useCallback(async()=>{
    setLoadingM(true);
    try{ setMembers(await getProjectMembers(projectId)); }
    catch{ toast({title:'Could not load members',variant:'destructive'}); }
    finally{ setLoadingM(false); }
  },[projectId]);

  /* fetch requests */
  const fetchRequests = useCallback(async()=>{
    if(!isPrivileged) return;
    setLoadingR(true);
    try{ setRequests(await getJoinRequests(projectId)); }
    catch{ setRequests([]); }
    finally{ setLoadingR(false); }
  },[projectId, isPrivileged]);

  /* fetch activity */
  const fetchLogs = useCallback(async()=>{
    if(!isPrivileged) return;
    setLoadingL(true);
    try{ setLogs(await getActivityLogs(projectId)); }
    catch{ setLogs([]); }
    finally{ setLoadingL(false); }
  },[projectId, isPrivileged]);

  useEffect(()=>{ fetchMembers(); },[fetchMembers]);
  useEffect(()=>{ if(tab==='requests') fetchRequests(); },[tab,fetchRequests]);
  useEffect(()=>{ if(tab==='activity') fetchLogs(); },[tab,fetchLogs]);

  /* handlers */
  async function handleRoleChange(email:string, role:string){
    try{
      await updateMemberRole(projectId, email, role);
      toast({title:`Role updated to ${role}`});
      fetchMembers();
    }catch(e:any){ toast({title:e.message??'Failed',variant:'destructive'}); }
  }

  async function handleRemove(email:string){
    if(!confirm(`Remove ${email} from project?`)) return;
    try{
      await removeMember(projectId, email);
      toast({title:'Member removed'});
      fetchMembers();
    }catch(e:any){ toast({title:e.message??'Failed',variant:'destructive'}); }
  }

  async function handleApprove(reqId:string, status:'accepted'|'rejected'){
    try{
      await updateJoinRequest(reqId, status);
      toast({title: status==='accepted'?'Request approved':'Request rejected'});
      fetchRequests();
      if(status==='accepted') fetchMembers();
    }catch(e:any){ toast({title:e.message??'Failed',variant:'destructive'}); }
  }

  async function handleInvite(){
    if(!inviteEmail.trim()) return;
    setInviting(true);
    try{
      await inviteToProject(projectId, inviteEmail.trim());
      toast({title:`${inviteEmail} invited`});
      setInviteEmail('');
      fetchMembers();
    }catch(e:any){ toast({title:e.message??'Failed',variant:'destructive'}); }
    finally{ setInviting(false); }
  }

  async function handleDelete(){
    if(confirmName !== projectName){
      toast({title:'Project name does not match',variant:'destructive'});
      return;
    }
    setDeleting(true);
    try{
      await deleteProject(projectId);
      toast({title:'Project deleted'});
      onProjectDeleted();
    }catch(e:any){ toast({title:e.message??'Delete failed',variant:'destructive'}); }
    finally{ setDeleting(false); }
  }

  const pendingCount = requests.filter(r=>r.status==='pending').length;

  /* ── render ─────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 overflow-hidden"
        style={{background:'linear-gradient(135deg,#0f0c1a,#14102a,#0b0f2a)'}}
        onClick={e=>e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">Project Settings</h2>
            <p className="text-sm text-slate-400 mt-0.5 truncate max-w-xs">{projectName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 pb-0 shrink-0 border-b border-white/10">
          {([
            {key:'members',  icon:Users,    label:'Members'},
            {key:'requests', icon:Inbox,    label:'Requests', badge: pendingCount||undefined},
            {key:'activity', icon:Activity, label:'Activity'},
            {key:'danger',   icon:Trash2,   label:'Danger Zone'},
          ] as const).map(t=>(
            isPrivileged || t.key==='members' ? (
              <button
                key={t.key}
                onClick={()=>setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
                  tab===t.key
                    ? t.key==='danger'
                      ? 'text-red-400 border-b-2 border-red-400 -mb-px bg-red-400/5'
                      : 'text-violet-400 border-b-2 border-violet-400 -mb-px bg-violet-400/5'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <t.icon className="w-4 h-4"/>
                {t.label}
                {t.badge ? (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{t.badge}</span>
                ) : null}
              </button>
            ) : null
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── MEMBERS TAB ─────────────────────────────── */}
          {tab==='members' && (
            <div className="space-y-4">
              {/* invite row — owner/pm only */}
              {isPrivileged && (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e=>setInviteEmail(e.target.value)}
                    placeholder="Invite by email..."
                    onKeyDown={e=>e.key==='Enter'&&handleInvite()}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  />
                  <Button size="sm" variant="neon" onClick={handleInvite} disabled={inviting||!inviteEmail.trim()}>
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin"/> : <UserPlus className="w-4 h-4"/>}
                    Invite
                  </Button>
                </div>
              )}

              {/* member list */}
              {loadingM ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-400"/></div>
              ) : members.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No members found.</p>
              ) : (
                <div className="space-y-2">
                  {members.map(m=>(
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                      {/* avatar */}
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{background: colorFor(m.user_email)}}>
                        {initials(m.user_email)}
                      </div>

                      {/* email + role badge */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{m.user_email}</p>
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border mt-0.5 ${roleBadge[m.role]||roleBadge.member}`}>
                          {roleIcon(m.role)} {m.role}
                        </span>
                      </div>

                      {/* actions — owner/pm can manage other members */}
                      {isPrivileged && m.role !== 'owner' && m.user_email !== currentUserEmail && (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* role select */}
                          <div className="relative">
                            <select
                              value={m.role}
                              onChange={e=>handleRoleChange(m.user_email, e.target.value)}
                              className="bg-white/5 border border-white/10 text-slate-300 text-xs rounded-lg pl-2 pr-6 py-1.5 appearance-none cursor-pointer focus:outline-none focus:border-violet-500"
                            >
                              <option value="pm">Project Manager</option>
                              <option value="member">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-2 pointer-events-none"/>
                          </div>
                          {/* remove */}
                          <button
                            onClick={()=>handleRemove(m.user_email)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                            title="Remove member"
                          >
                            <UserMinus className="w-4 h-4"/>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── JOIN REQUESTS TAB ───────────────────────── */}
          {tab==='requests' && (
            <div className="space-y-3">
              {loadingR ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-400"/></div>
              ) : requests.length===0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No join requests yet.</p>
              ) : (
                requests.map(r=>(
                  <div key={r.id} className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{background:colorFor(r.user_email)}}>
                      {initials(r.user_email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{r.user_email}</p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        r.status==='pending'  ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' :
                        r.status==='accepted' ? 'bg-green-400/10  text-green-400  border-green-400/30'  :
                        'bg-red-400/10 text-red-400 border-red-400/30'
                      }`}>{r.status}</span>
                    </div>
                    {r.status==='pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={()=>handleApprove(r.id,'accepted')}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5"/> Approve
                        </button>
                        <button
                          onClick={()=>handleApprove(r.id,'rejected')}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
                        >
                          <XIcon className="w-3.5 h-3.5"/> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── ACTIVITY TAB ────────────────────────────── */}
          {tab==='activity' && (
            <div className="space-y-2">
              {loadingL ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-400"/></div>
              ) : logs.length===0 ? (
                <p className="text-slate-500 text-sm text-center py-8">No activity recorded yet.</p>
              ) : (
                logs.map(log=>{
                  const meta = ACTION_LABELS[log.action] ?? {label:log.action, color:'text-slate-300'};
                  return (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5"
                        style={{background:colorFor(log.actor_email)}}>
                        {initials(log.actor_email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          <span className="font-medium">{log.actor_email.split('@')[0]}</span>
                          {' · '}
                          <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
                        </p>
                        {log.details && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{log.details}</p>}
                        <p className="text-[11px] text-slate-500 mt-1">{fmtDate(log.created_at)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── DANGER ZONE TAB ─────────────────────────── */}
          {tab==='danger' && (
            <div className="space-y-4">
              {currentUserRole !== 'owner' ? (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0"/>
                  <p className="text-sm text-red-300">Only the project <strong>owner</strong> can delete this project.</p>
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-red-500/5 border border-red-500/30 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5"/>
                    <div>
                      <p className="text-sm font-semibold text-red-400">Delete Project</p>
                      <p className="text-xs text-slate-400 mt-1">
                        This will permanently delete <strong className="text-white">{projectName}</strong> and all its chats, messages, knowledge nodes, and members. This action <em>cannot</em> be undone.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Type <strong className="text-white">{projectName}</strong> to confirm:</label>
                    <input
                      type="text"
                      value={confirmName}
                      onChange={e=>setConfirmName(e.target.value)}
                      placeholder={projectName}
                      className="w-full bg-black/30 border border-red-500/40 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={confirmName !== projectName || deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Trash2 className="w-4 h-4 mr-2"/>}
                    Permanently Delete Project
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
