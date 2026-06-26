import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

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
        <div style={s.page}>
            {/* ── Navbar ─────────────────────────────────────────────────── */}
            <nav style={s.nav}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <button
                        onClick={() => navigate('/projects')}
                        style={{ display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "1px solid #334155", color: "#cbd5e1", padding: "6px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                    >
                        ← Back to Projects
                    </button>
                    <span style={s.brand}>Clarity</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <span style={s.navOnline}><span style={{ color: "#22c55e", marginRight: "6px" }}>●</span>Online</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "13px", flexShrink: 0 }}>
                            {initials}
                        </div>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#e5e7eb" }}>{fullName}</span>
                    </div>
                </div>
            </nav>

            {/* ── Hero ───────────────────────────────────────────────────── */}
            <div style={s.hero}>
                <div style={{ textAlign: "center", maxWidth: "600px" }}>
                    <h1 style={s.heroTitle}>
                        Hello, <span style={{ color: "#a78bfa" }}>{firstName}</span> 👋
                    </h1>
                    <p style={s.heroSub}>Your collaborative workspace hub. Create, edit, and share in real time.</p>
                    <button onClick={() => setShowModal(true)} style={s.heroBtn}>+ New Workspace</button>
                </div>
            </div>

            {/* ── Content ────────────────────────────────────────────────── */}
            <main style={s.main}>
                {/* Stats + search row */}
                <div style={s.statsRow}>
                    <StatCard label="Total Workspaces" value={workspaces.length} icon="🗂️" />
                    <StatCard label="Active Now"        value={workspaces.filter(w => w.active_users > 0).length} icon="🟢" />
                    <StatCard label="Total Sections"    value={workspaces.reduce((a,w) => a + (w.section_count||0), 0)} icon="📄" />
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                        <div style={s.searchWrap}>
                            <span style={{ color: "#6b7280", fontSize: "14px", marginRight: "8px" }}>⌕</span>
                            <input
                                style={s.searchInput}
                                placeholder="Search workspaces…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Section header */}
                <div style={s.sectionHdr}>
                    <span style={s.sectionHdrLabel}>Recent Workspaces</span>
                    <span style={{ fontSize: "12px", color: "#4b5563" }}>{filtered.length} workspace{filtered.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Grid */}
                {loading ? (
                    <div style={s.empty}><span style={{ fontSize: "32px" }}>⏳</span><p style={{ color: "#6b7280" }}>Loading…</p></div>
                ) : filtered.length === 0 ? (
                    <div style={s.empty}>
                        <span style={{ fontSize: "48px" }}>📁</span>
                        <p style={{ color: "#9ca3af", marginTop: "12px" }}>{search ? "No matches found." : "No workspaces yet."}</p>
                        {!search && <button onClick={() => setShowModal(true)} style={s.heroBtn}>Create your first workspace</button>}
                    </div>
                ) : (
                    <div style={s.grid}>
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

            <style>{`* { box-sizing: border-box; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
        <div style={m.overlay} onClick={onClose}>
            <div style={m.modal} onClick={(e) => e.stopPropagation()}>
                <div style={m.mHeader}>
                    <span style={m.mTitle}>New Workspace</span>
                    <button onClick={onClose} style={m.closeBtn}>✕</button>
                </div>

                <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div>
                        <label style={m.label}>Workspace Name</label>
                        <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product Roadmap Q3" style={m.input} required />
                    </div>

                    <div>
                        <label style={m.label}>Visibility</label>
                        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                            {[true, false].map((pub) => (
                                <button
                                    type="button" key={pub}
                                    onClick={() => setIsPublic(pub)}
                                    style={{ flex: 1, padding: "10px", borderRadius: "8px", border: `1px solid ${isPublic === pub ? "#7c3aed" : "#1f2937"}`, backgroundColor: isPublic === pub ? "#1e1040" : "#111827", color: isPublic === pub ? "#a78bfa" : "#6b7280", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
                                >
                                    {pub ? "🌐 Public" : "🔒 Private"}
                                </button>
                            ))}
                        </div>
                        <p style={{ fontSize: "11px", color: "#4b5563", marginTop: "8px" }}>
                            {isPublic ? "Anyone with the link can view and edit." : "Only you can edit this workspace."}
                        </p>
                    </div>

                    <button type="submit" disabled={creating || !name.trim()} style={{ ...m.submitBtn, opacity: (creating || !name.trim()) ? 0.6 : 1 }}>
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
        <Link to={`/editor/workspace/${ws.id}`} style={{ textDecoration: "none" }}
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
            <div style={{ ...c.card, borderColor: hov ? accent : "#1f2937", boxShadow: hov ? `0 0 0 1px ${accent}44, 0 8px 32px rgba(0,0,0,0.4)` : "0 2px 8px rgba(0,0,0,0.3)", transform: hov ? "translateY(-2px)" : "none" }}>
                {/* Top accent bar */}
                <div style={{ height: "3px", borderRadius: "4px 4px 0 0", backgroundColor: accent, position: "absolute", top: 0, left: 0, right: 0 }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", paddingTop: "6px" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", backgroundColor: accent + "22", border: `1px solid ${accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
                        📝
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {ws.active_users > 0 && (
                            <span style={{ fontSize: "10px", backgroundColor: "#052e16", color: "#22c55e", padding: "2px 8px", borderRadius: "999px", fontWeight: 700, border: "1px solid #15803d" }}>
                                ● {ws.active_users} live
                            </span>
                        )}
                        <button
                            onClick={(e) => onDelete(e, ws.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", fontSize: "14px", padding: "2px 5px", borderRadius: "4px", lineHeight: 1 }}
                            onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                            onMouseLeave={(e) => e.currentTarget.style.color = "#374151"}
                        >✕</button>
                    </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: "15px", color: "#f9fafb", marginBottom: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ws.name || `Workspace ${ws.id}`}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "18px", minHeight: "18px" }}>
                    {ws.preview ? `"${ws.preview}…"` : "Empty workspace"}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #1f2937" }}>
                    <span style={{ fontSize: "11px", color: "#4b5563" }}>{ws.section_count} section{ws.section_count !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "monospace" }}>{timeAgo(ws.created_at)}</span>
                </div>
            </div>
        </Link>
    );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }) {
    return (
        <div style={{ backgroundColor: "#0d1117", border: "1px solid #1f2937", borderRadius: "10px", padding: "14px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "22px" }}>{icon}</span>
            <div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "#f9fafb", lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>{label}</div>
            </div>
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
    page:     { minHeight: "100vh", backgroundColor: "#080c14", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#f9fafb" },
    nav:      { backgroundColor: "#0d1117", borderBottom: "1px solid #1f2937", padding: "0 32px", height: "58px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 },
    brand:    { fontSize: "20px", fontWeight: 900, color: "#a78bfa", letterSpacing: "-0.5px" },
    navOnline:{ fontSize: "12px", color: "#6b7280", display: "flex", alignItems: "center" },
    signOutBtn:{ padding: "6px 14px", backgroundColor: "transparent", border: "1px solid #1f2937", borderRadius: "7px", color: "#9ca3af", cursor: "pointer", fontSize: "12px", fontWeight: 500 },

    hero:     { background: "radial-gradient(ellipse at 60% 0%, #1e1040 0%, #080c14 60%)", borderBottom: "1px solid #1a1f2e", padding: "80px 32px 64px", display: "flex", justifyContent: "center", alignItems: "center" },
    heroTitle:{ fontSize: "40px", fontWeight: 900, color: "#f9fafb", margin: "0 0 12px", letterSpacing: "-1px" },
    heroSub:  { fontSize: "16px", color: "#9ca3af", margin: "0 0 32px", lineHeight: 1.6 },
    heroBtn:  { padding: "13px 28px", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "white", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(124,58,237,0.4)" },

    main:     { maxWidth: "1100px", margin: "0 auto", padding: "32px 24px 60px" },
    statsRow: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px", flexWrap: "wrap" },
    sectionHdr: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" },
    sectionHdrLabel: { fontSize: "13px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" },

    searchWrap:  { display: "flex", alignItems: "center", backgroundColor: "#0d1117", border: "1px solid #1f2937", borderRadius: "9px", padding: "8px 14px" },
    searchInput: { background: "transparent", border: "none", outline: "none", color: "#f9fafb", fontSize: "13px", width: "200px" },

    grid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "18px" },
    empty:    { textAlign: "center", padding: "80px 20px", border: "1px dashed #1f2937", borderRadius: "14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" },
};

const c = {
    card: { backgroundColor: "#0d1117", border: "1px solid #1f2937", borderRadius: "13px", padding: "20px", position: "relative", overflow: "hidden", transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s", cursor: "pointer" },
};

const m = {
    overlay:   { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)" },
    modal:     { backgroundColor: "#0d1117", border: "1px solid #1f2937", borderRadius: "16px", padding: "28px", width: "420px", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" },
    mHeader:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
    mTitle:    { fontSize: "18px", fontWeight: 800, color: "#f9fafb" },
    closeBtn:  { background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "18px" },
    label:     { fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "8px" },
    input:     { width: "100%", padding: "11px 14px", backgroundColor: "#111827", border: "1px solid #1f2937", borderRadius: "8px", color: "#f9fafb", fontSize: "14px", outline: "none" },
    submitBtn: { padding: "13px", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "white", border: "none", borderRadius: "9px", fontSize: "14px", fontWeight: 700, cursor: "pointer" },
};
