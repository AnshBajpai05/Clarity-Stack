import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { GlareCard } from "@/components/ui/glare-card";

// ── helpers ───────────────────────────────────────────────────────────────────
const ACCENT_COLORS = ["#7c3aed","#4f46e5","#2563eb","#0891b2","#059669","#d97706","#dc2626","#db2777"];
const colorFor = (str) => ACCENT_COLORS[(str || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENT_COLORS.length];

const getInitials = (name = "") => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.trim().slice(0, 2).toUpperCase() || "??";
};

const timeAgo = (iso) => {
    if (!iso) return "";
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)    return "just now";
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// ── component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
    const navigate = useNavigate();

    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [search, setSearch]         = useState("");
    const [showModal, setShowModal]   = useState(false); // new-workspace modal

    // User identity — use localStorage from ClarityStack
    const fullName    = localStorage.getItem('cs_nickname') || "User";
    const userEmail   = localStorage.getItem('cs_email') || "";
    const initials    = getInitials(fullName);
    const avatarColor = colorFor(userEmail || fullName);
    const firstName   = fullName.split(" ")[0];

    useEffect(() => { fetchWorkspaces(); }, []);

    const fetchWorkspaces = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const base = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
            const res  = await fetch(`${base}/workspaces`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setWorkspaces(await res.json());
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const deleteWorkspace = async (e, id) => {
        e.preventDefault();
        if (!window.confirm("Permanently delete this workspace?")) return;
        const token = localStorage.getItem('token');
        const base = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
        const res  = await fetch(`${base}/workspace/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setWorkspaces((p) => p.filter((w) => w.id !== id));
    };

    const filtered = workspaces.filter((w) =>
        (w.name || w.id).toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
            {/* ── Navbar ─────────────────────────────────────────────────── */}
            <nav className="h-[58px] bg-background/50 border-b border-border px-8 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/projects')}
                        className="flex items-center gap-1.5 bg-transparent border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 px-3 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors"
                    >
                        ← Back to Projects
                    </button>
                    <span className="text-[20px] font-display font-bold text-neon-violet tracking-tight">Clarity</span>
                </div>
                <div className="flex items-center gap-5">
                    <span className="text-xs text-muted-foreground flex items-center"><span className="text-neon-mint mr-1.5">●</span>Online</span>
                    <div className="flex items-center gap-2.5">
                        <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0" style={{ backgroundColor: avatarColor }}>
                            {initials}
                        </div>
                        <span className="text-sm font-semibold text-foreground">{fullName}</span>
                    </div>
                </div>
            </nav>

            {/* ── Hero ───────────────────────────────────────────────────── */}
            <div className="bg-[radial-gradient(ellipse_at_60%_0%,_hsl(var(--primary)/0.15)_0%,_transparent_60%)] border-b border-border/50 pt-20 pb-16 flex justify-center items-center">
                <div className="text-center max-w-[600px] animate-fade-in-up">
                    <h1 className="text-4xl font-display font-bold text-foreground mb-3 tracking-tight">
                        Hello, <span className="text-neon-violet">{firstName}</span> 👋
                    </h1>
                    <p className="text-base text-muted-foreground mb-8 leading-relaxed">Your collaborative workspace hub. Create, edit, and share in real time.</p>
                    <button onClick={() => setShowModal(true)} className="px-7 py-3 bg-primary text-primary-foreground border-none rounded-xl text-sm font-bold cursor-pointer shadow-[0_4px_20px_rgba(124,58,237,0.4)] hover:-translate-y-0.5 transition-transform">
                        + New Workspace
                    </button>
                </div>
            </div>

            {/* ── Content ────────────────────────────────────────────────── */}
            <main className="max-w-[1100px] w-full mx-auto px-6 py-8 pb-16 flex-1">
                {/* Stats + search row */}
                <div className="flex items-center gap-3 mb-7 flex-wrap animate-fade-in-up stagger-1">
                    <StatCard label="Total Workspaces" value={workspaces.length} icon="🗂️" />
                    <StatCard label="Active Now"        value={workspaces.filter(w => w.active_users > 0).length} icon="🟢" />
                    <StatCard label="Total Sections"    value={workspaces.reduce((a,w) => a + (w.section_count||0), 0)} icon="📄" />
                    <div className="ml-auto flex items-center">
                        <div className="flex items-center glass-panel border-border/50 rounded-xl px-3.5 py-2">
                            <span className="text-muted-foreground text-sm mr-2">⌕</span>
                            <input
                                className="bg-transparent border-none outline-none text-foreground text-[13px] w-[200px]"
                                placeholder="Search workspaces…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Section header */}
                <div className="flex items-center justify-between mb-4 animate-fade-in-up stagger-2">
                    <span className="text-[13px] text-muted-foreground font-semibold uppercase tracking-wider">Recent Workspaces</span>
                    <span className="text-xs text-muted-foreground">{filtered.length} workspace{filtered.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="text-center p-20 border border-dashed border-border rounded-xl flex flex-col items-center gap-2">
                        <span className="text-3xl">⏳</span>
                        <p className="text-muted-foreground">Loading…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center p-20 border border-dashed border-border rounded-xl flex flex-col items-center gap-3">
                        <span className="text-5xl">📁</span>
                        <p className="text-muted-foreground mt-3">{search ? "No matches found." : "No workspaces yet."}</p>
                        {!search && <button onClick={() => setShowModal(true)} className="px-7 py-3 bg-primary text-primary-foreground border-none rounded-xl text-sm font-bold cursor-pointer shadow-[0_4px_20px_rgba(124,58,237,0.4)] hover:-translate-y-0.5 transition-transform mt-2">Create your first workspace</button>}
                    </div>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[18px] animate-fade-in-up stagger-3">
                        {filtered.map((ws) => (
                            <WorkspaceCard key={ws.id} ws={ws} onDelete={deleteWorkspace} />
                        ))}
                    </div>
                )}
            </main>

            {/* ── New Workspace Modal ─────────────────────────────────────── */}
            {showModal && (
                <NewWorkspaceModal
                    onClose={() => setShowModal(false)}
                    onCreated={(id) => navigate(`/editor/workspace/${id}`)}
                />
            )}
        </div>
    );
}

// ── New Workspace Modal ───────────────────────────────────────────────────────
function NewWorkspaceModal({ onClose, onCreated }) {
    const [name, setName]         = useState("");
    const [isPublic, setIsPublic] = useState(true);
    const [creating, setCreating] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const create = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setCreating(true);
        try {
            const token = localStorage.getItem('token');
            const base = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
            const res  = await fetch(`${base}/workspace`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: name.trim(), is_public: isPublic }),
            });
            if (res.ok) { const d = await res.json(); onCreated(d.room_id); }
        } catch { setCreating(false); }
    };

    return (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-[100] backdrop-blur-sm" onClick={onClose}>
            <div className="glass-panel border-border/50 rounded-2xl p-7 w-[420px] shadow-[0_25px_60px_rgba(0,0,0,0.6)] animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <span className="text-lg font-display font-bold text-foreground tracking-tight">New Workspace</span>
                    <button onClick={onClose} className="bg-transparent border-none text-muted-foreground hover:text-foreground cursor-pointer text-lg">✕</button>
                </div>

                <form onSubmit={create} className="flex flex-col gap-[18px]">
                    <div>
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Workspace Name</label>
                        <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product Roadmap Q3" className="w-full px-3.5 py-2.5 bg-muted/50 border border-border rounded-lg text-foreground text-sm outline-none focus:border-primary transition-colors" required />
                    </div>

                    <div>
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Visibility</label>
                        <div className="flex gap-2.5 mt-2">
                            {[true, false].map((pub) => (
                                <button
                                    type="button" key={pub}
                                    onClick={() => setIsPublic(pub)}
                                    className={`flex-1 p-2.5 rounded-lg border text-[13px] font-semibold cursor-pointer transition-colors ${isPublic === pub ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/50'}`}
                                >
                                    {pub ? "🌐 Public" : "🔒 Private"}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">
                            {isPublic ? "Anyone with the link can view and edit." : "Only you can edit this workspace."}
                        </p>
                    </div>

                    <button type="submit" disabled={creating || !name.trim()} className={`px-3 py-3.5 bg-primary text-primary-foreground border-none rounded-xl text-sm font-bold cursor-pointer transition-opacity ${(creating || !name.trim()) ? 'opacity-60' : 'opacity-100 hover:-translate-y-0.5 shadow-glow-sm'}`}>
                        {creating ? "Creating…" : "Create Workspace →"}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ── Workspace Card ────────────────────────────────────────────────────────────
function WorkspaceCard({ ws, onDelete }) {
    const [hov, setHov] = useState(false);
    const accent        = colorFor(ws.id);

    return (
        <Link to={`/editor/workspace/${ws.id}`} className="no-underline block group"
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
            <GlareCard containerClassName={`w-full aspect-auto transition-all duration-300 ${hov ? 'shadow-floating -translate-y-1' : ''}`} className="bg-card/90">
            <div className="p-5 relative overflow-hidden h-full">
                {/* Top accent bar */}
                <div className="h-[3px] rounded-t-sm absolute top-0 left-0 right-0" style={{ backgroundColor: accent }} />

                <div className="flex justify-between items-start mb-4 pt-1.5">
                    <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-lg border" style={{ backgroundColor: accent + "15", borderColor: accent + "30" }}>
                        📝
                    </div>
                    <div className="flex gap-2 items-center">
                        {ws.active_users > 0 && (
                            <span className="text-[10px] bg-neon-mint/10 text-neon-mint px-2 py-0.5 rounded-full font-bold border border-neon-mint/30">
                                ● {ws.active_users} live
                            </span>
                        )}
                        <button
                            onClick={(e) => onDelete(e, ws.id)}
                            className="bg-transparent border-none cursor-pointer text-muted-foreground text-sm px-1.5 py-0.5 rounded hover:text-destructive transition-colors"
                        >✕</button>
                    </div>
                </div>

                <div className="font-display font-semibold text-[15px] text-foreground mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis tracking-tight">
                    {ws.name || `Workspace ${ws.id}`}
                </div>
                <div className="text-xs text-muted-foreground italic whitespace-nowrap overflow-hidden text-ellipsis mb-[18px] min-h-[18px]">
                    {ws.preview ? `"${ws.preview}…"` : "Empty workspace"}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-border">
                    <span className="text-[11px] text-muted-foreground">{ws.section_count} section{ws.section_count !== 1 ? "s" : ""}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{timeAgo(ws.created_at)}</span>
                </div>
            </div>
            </GlareCard>
        </Link>
    );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }) {
    return (
        <div className="glass-panel border-border/50 rounded-xl px-5 py-3.5 flex items-center gap-3">
            <span className="text-[22px]">{icon}</span>
            <div>
                <div className="text-[22px] font-display font-bold text-foreground leading-none tracking-tight">{value}</div>
                <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">{label}</div>
            </div>
        </div>
    );
}


