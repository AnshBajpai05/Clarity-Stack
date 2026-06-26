import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { socket } from "./socket";
import { generateUML } from "@/lib/api";
import { toast } from "sonner";

function Workspace() {
    const { id } = useParams();
    
    // Replace AuthContext with ClarityStack standard auth
    const token = localStorage.getItem("token");
    const currentUserEmail = localStorage.getItem("cs_email");

    const [sections, setSections] = useState([]);
    const [connected, setConnected] = useState(false);
    const [userCount, setUserCount] = useState(0);
    const [copied, setCopied] = useState(false);
    const [snapshotMsg, setSnapshotMsg] = useState("");
    const [readOnly, setReadOnly] = useState(false);
    const [activityLogs, setActivityLogs] = useState([]);
    const [showActivityPanel, setShowActivityPanel] = useState(false);
    const [darkMode, setDarkMode] = useState(false);
    const [focusedSection, setFocusedSection] = useState(null);

    const debounceTimers = useRef({});
    const activityTimer = useRef({});

    // ── theme tokens ──────────────────────────────────────────────────────────
    const t = darkMode ? dark : light;

    useEffect(() => {
        const fetchWorkspaceMeta = async () => {
            const baseUrl = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
            try {
                const res = await fetch(`${baseUrl}/workspace/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    const ownerId = data.owner_id;
                    const isPublic = data.is_public !== false; // default true

                    // Lock read-only ONLY when: private AND has an owner AND user is NOT the owner
                    if (!isPublic && ownerId !== null && ownerId !== undefined && currentUserEmail !== ownerId) {
                        setReadOnly(true);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch workspace meta:", err);
            }
        };
        fetchWorkspaceMeta();
    }, [id, token, currentUserEmail]);

    const fetchActivityLogs = useCallback(async () => {
        if (!token) return;
        try {
            const baseUrl = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
            const res = await fetch(`${baseUrl}/activity/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setActivityLogs(await res.json());
        } catch (err) {
            console.error("Failed to fetch activity logs", err);
        }
    }, [id, token]);

    useEffect(() => {
        if (showActivityPanel) fetchActivityLogs();
    }, [showActivityPanel, fetchActivityLogs]);

    const emitSectionChange = useCallback(
        (sectionId, content) => {
            if (readOnly) return;
            clearTimeout(debounceTimers.current[sectionId]);
            debounceTimers.current[sectionId] = setTimeout(() => {
                socket.emit("section_change", { room: id, sectionId, content });
            }, 300);
        },
        [id, readOnly]
    );

    useEffect(() => {
        if (!id) return;
        socket.connect();
        socket.on("connect", () => { setConnected(true); socket.emit("join", id); });
        socket.on("load-sections", (data) => setSections(data));
        socket.on("section_update", ({ sectionId, content }) =>
            setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, content } : s)))
        );
        socket.on("section_title_update", ({ sectionId, title }) =>
            setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, title } : s)))
        );
        socket.on("section_added", (newSection) =>
            setSections((prev) => prev.find((s) => s.id === newSection.id) ? prev : [...prev, newSection])
        );
        socket.on("section_deleted", ({ sectionId }) =>
            setSections((prev) => prev.filter((s) => s.id !== sectionId))
        );
        socket.on("sections_reordered", (newSections) => setSections(newSections));
        socket.on("user-count", (count) => setUserCount(count));
        socket.on("disconnect", () => setConnected(false));

        return () => {
            ["connect","load-sections","section_update","section_title_update",
             "section_added","section_deleted","sections_reordered","user-count","disconnect"]
                .forEach((e) => socket.off(e));
            socket.disconnect();
        };
    }, [id]);

    // ── Activity logging ─────────────────────────────────────────────────────
    const logActivity = async (action, content, cursorPosition = 0) => {
        if (!token) return;
        try {
            const baseUrl = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
            await fetch(`${baseUrl}/activity`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ workspace_id: id, action, content_preview: content.slice(-30), cursor_position: cursorPosition }),
            });
        } catch (err) { /* silent */ }
    };

    // ── Section actions ──────────────────────────────────────────────────────
    const handleContentChange = (sectionId, value, selectionStart = 0) => {
        if (readOnly) return;
        setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, content: value } : s)));
        emitSectionChange(sectionId, value);
        clearTimeout(activityTimer.current[sectionId]);
        activityTimer.current[sectionId] = setTimeout(() => logActivity("edit_content", value, selectionStart), 2000);
    };

    const handleTitleChange = (sectionId, value) => {
        if (readOnly) return;
        setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, title: value } : s)));
        socket.emit("section_title_change", { room: id, sectionId, title: value });
        clearTimeout(activityTimer.current[`title_${sectionId}`]);
        activityTimer.current[`title_${sectionId}`] = setTimeout(() => logActivity("edit_title", value, value.length), 2000);
    };

    const moveSection = (index, direction) => {
        if (readOnly) return;
        const newSections = [...sections];
        const target = index + direction;
        if (target < 0 || target >= newSections.length) return;
        [newSections[index], newSections[target]] = [newSections[target], newSections[index]];
        setSections(newSections);
        socket.emit("reorder_sections", { room: id, sections: newSections });
    };

    const addSection = () => { if (!readOnly) socket.emit("add_section", { room: id }); };

    const deleteSection = (sectionId) => {
        if (readOnly || sections.length <= 1) return;
        socket.emit("delete_section", { room: id, sectionId });
    };

    // ── Clipboard helpers ────────────────────────────────────────────────────
    const copyToClipboard = (text) => {
        if (navigator.clipboard) { navigator.clipboard.writeText(text); }
        else {
            const ta = document.createElement("textarea");
            ta.value = text; ta.style.position = "fixed";
            document.body.appendChild(ta); ta.select();
            document.execCommand("copy"); document.body.removeChild(ta);
        }
    };

    const copyLink = () => { copyToClipboard(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    const createSnapshot = async () => {
        const content = sections.map((s) => `=== ${s.title} ===\n${s.content}`).join("\n\n");
        try {
            const baseUrl = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
            const res = await fetch(`${baseUrl}/snapshot`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, workspace_id: id }),
            });
            if (res.ok) {
                const data = await res.json();
                copyToClipboard(`${window.location.origin}/editor/snapshot/${data.snapshot_id}`);
                setSnapshotMsg("✅ Snapshot created & link copied!");
            } else { setSnapshotMsg("❌ Failed to create snapshot"); }
        } catch (err) { setSnapshotMsg("❌ " + err.message); }
        setTimeout(() => setSnapshotMsg(""), 3000);
    };

    const createSectionSnapshot = async (section) => {
        try {
            const baseUrl = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;
            const res = await fetch(`${baseUrl}/snapshot`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: section.content, workspace_id: id }),
            });
            if (res.ok) {
                const data = await res.json();
                copyToClipboard(`${window.location.origin}/editor/snapshot/${data.snapshot_id}`);
                setSnapshotMsg(`✅ Snapshot for '${section.title}' copied!`);
            }
        } catch (err) { setSnapshotMsg("❌ " + err.message); }
        setTimeout(() => setSnapshotMsg(""), 3000);
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    const wordCount = (text) => text.trim() ? text.trim().split(/\s+/).length : 0;
    // const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const timeAgo = (iso) => {
        const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
    };
    const scrollToEdit = (log) => {
        const tas = document.getElementsByTagName("textarea");
        if (tas.length > 0) {
            tas[0].focus();
            try { tas[0].setSelectionRange(log.cursor_position, log.cursor_position); } catch (_) {}
            tas[0].scrollTop = Math.floor((log.cursor_position || 0) / 80) * 24;
        }
    };

    const lastLog = activityLogs[0] || null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ minHeight: "100vh", backgroundColor: t.pageBg, fontFamily: "'Inter', 'Segoe UI', sans-serif", display: "flex", overflow: "hidden", transition: "background 0.3s" }}>

            {/* ── Main content ─────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", marginRight: showActivityPanel ? "320px" : "0", transition: "margin-right 0.3s" }}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <header style={{ backgroundColor: t.headerBg, borderBottom: `1px solid ${t.border}`, padding: "0 28px", height: "58px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(10px)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <span style={{ fontSize: "20px", fontWeight: 800, color: t.accent, letterSpacing: "-0.5px" }}>Clarity</span>
                        <span style={{ fontSize: "12px", color: t.muted, backgroundColor: t.badgeBg, padding: "2px 10px", borderRadius: "999px", fontFamily: "monospace" }}>{id}</span>
                        {readOnly && <span style={{ fontSize: "11px", color: "#e67e22", backgroundColor: "#fef3cd", padding: "2px 8px", borderRadius: "999px", fontWeight: 700 }}>VIEW ONLY</span>}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        {lastLog && (
                            <span style={{ fontSize: "12px", color: t.muted, fontStyle: "italic" }}>
                                Last edit · {timeAgo(lastLog.created_at)}
                            </span>
                        )}
                        <span style={{ fontSize: "13px", color: t.secondary }}>
                            {userCount} {userCount === 1 ? "person" : "people"} editing
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", backgroundColor: connected ? "#d4f7e7" : "#fde8ec", color: connected ? "#1a7f58" : "#c0392b" }}>
                            {connected ? "● Live" : "○ Offline"}
                        </span>
                        <button onClick={() => setDarkMode(!darkMode)} style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: "8px", padding: "4px 10px", cursor: "pointer", fontSize: "15px", color: t.text }} title="Toggle dark mode">
                            {darkMode ? "☀️" : "🌙"}
                        </button>
                    </div>
                </header>

                {/* ── Toolbar ────────────────────────────────────────────── */}
                <div style={{ backgroundColor: t.toolbarBg, borderBottom: `1px solid ${t.border}`, padding: "8px 28px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <Link to="/editor/dashboard" style={{ ...btn(t.muted, t), textDecoration: "none" }}>← Dashboard</Link>
                    {!readOnly && (
                        <button onClick={addSection} style={btn("#17a2b8", t)}>+ Add Section</button>
                    )}
                    <button onClick={copyLink} style={btn(t.accent, t)}>{copied ? "✓ Copied" : "Copy Link"}</button>
                    <button onClick={createSnapshot} style={btn("#27ae60", t)}>📸 Snapshot</button>
                    <button onClick={() => { setShowActivityPanel(!showActivityPanel); if (!showActivityPanel) fetchActivityLogs(); }} style={btn("#8e44ad", t)}>
                        {showActivityPanel ? "Hide History" : "📜 History"}
                    </button>

                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button 
                            className="peer"
                            style={{ ...btn("#a78bfa", t), border: '2px solid #7c3aed' }}
                        >
                            ✨ AI Diagram ▾
                        </button>
                        <div className="hidden peer-hover:flex hover:flex flex-col absolute top-full left-0 bg-[#16192a] border border-[#2a2d4a] rounded-lg shadow-xl z-[100] min-w-[150px] p-1 mt-1">
                            <button onClick={() => handleGenerateUML('usecase')} className="text-left px-3 py-2 text-xs hover:bg-[#7c3aed]/20 text-white rounded transition-colors">Use Case</button>
                            <button onClick={() => handleGenerateUML('activity')} className="text-left px-3 py-2 text-xs hover:bg-[#7c3aed]/20 text-white rounded transition-colors">Activity</button>
                            <button onClick={() => handleGenerateUML('dfd')} className="text-left px-3 py-2 text-xs hover:bg-[#7c3aed]/20 text-white rounded transition-colors">DFD</button>
                        </div>
                    </div>
                    {snapshotMsg && (
                        <span style={{ fontSize: "12px", fontWeight: 600, color: snapshotMsg.startsWith("✅") ? "#27ae60" : "#e74c3c", marginLeft: "8px" }}>{snapshotMsg}</span>
                    )}
                </div>

                {/* ── Sections ───────────────────────────────────────────── */}
                <div style={{ flex: 1, overflowY: "auto", padding: "28px", maxWidth: "820px", width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
                    {sections.map((section, index) => {
                        const wc = wordCount(section.content);
                        const isFocused = focusedSection === section.id;
                        return (
                            <div key={section.id} style={{ backgroundColor: t.cardBg, borderRadius: "14px", border: `1px solid ${isFocused ? t.accent : t.border}`, marginBottom: "20px", boxShadow: isFocused ? `0 0 0 3px ${t.accentFade}` : `0 2px 10px ${t.shadow}`, overflow: "hidden", transition: "border-color 0.2s, box-shadow 0.2s" }}>

                                {/* Section header */}
                                <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", backgroundColor: t.sectionHeaderBg, borderBottom: `1px solid ${t.border}`, gap: "8px" }}>
                                    {/* Reorder buttons */}
                                    {!readOnly && (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginRight: "6px" }}>
                                            <button onClick={() => moveSection(index, -1)} disabled={index === 0} style={{ background: "none", border: "none", cursor: index === 0 ? "not-allowed" : "pointer", color: index === 0 ? t.muted : t.secondary, fontSize: "11px", lineHeight: 1, padding: "1px 4px", borderRadius: "3px" }} title="Move Up">▲</button>
                                            <button onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} style={{ background: "none", border: "none", cursor: index === sections.length - 1 ? "not-allowed" : "pointer", color: index === sections.length - 1 ? t.muted : t.secondary, fontSize: "11px", lineHeight: 1, padding: "1px 4px", borderRadius: "3px" }} title="Move Down">▼</button>
                                        </div>
                                    )}

                                    {/* Section number badge */}
                                    <span style={{ fontSize: "11px", color: t.muted, backgroundColor: t.badgeBg, padding: "2px 7px", borderRadius: "999px", fontWeight: 700, whiteSpace: "nowrap" }}>
                                        {index + 1}
                                    </span>

                                    <input
                                        type="text"
                                        value={section.title}
                                        onChange={(e) => handleTitleChange(section.id, e.target.value)}
                                        style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: "15px", fontWeight: 700, color: t.text, minWidth: 0 }}
                                        disabled={readOnly}
                                        placeholder="Section title…"
                                    />

                                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                                        <span style={{ fontSize: "11px", color: t.muted }}>{wc} words</span>
                                        <span style={{ fontSize: "11px", color: t.muted, fontFamily: "monospace" }}>#{section.id}</span>
                                        <button onClick={() => createSectionSnapshot(section)} style={{ fontSize: "11px", padding: "3px 9px", backgroundColor: t.badgeBg, border: `1px solid ${t.border}`, borderRadius: "6px", cursor: "pointer", color: t.secondary, fontWeight: 600 }} title="Create shareable read-only link">
                                            Share
                                        </button>
                                        {sections.length > 1 && !readOnly && (
                                            <button onClick={() => deleteSection(section.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", color: t.muted, padding: "2px 4px", borderRadius: "4px" }} title="Delete section">✕</button>
                                        )}
                                    </div>
                                </div>

                                {/* Textarea */}
                                <textarea
                                    value={section.content}
                                    onChange={(e) => handleContentChange(section.id, e.target.value, e.target.selectionStart)}
                                    onFocus={() => setFocusedSection(section.id)}
                                    onBlur={() => setFocusedSection(null)}
                                    style={{ width: "100%", minHeight: "180px", fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace", fontSize: "14px", lineHeight: "1.8", padding: "18px 20px", border: "none", outline: "none", resize: "vertical", backgroundColor: t.editorBg, color: t.text, boxSizing: "border-box" }}
                                    placeholder={readOnly ? "" : `Start writing in ${section.title}…`}
                                    disabled={readOnly}
                                />

                                {/* Footer stats */}
                                <div style={{ padding: "5px 20px", backgroundColor: t.sectionHeaderBg, borderTop: `1px solid ${t.border}`, display: "flex", gap: "16px", fontSize: "11px", color: t.muted }}>
                                    <span>{section.content.length} chars</span>
                                    <span>{section.content.split(/\r?\n/).length} lines</span>
                                </div>
                            </div>
                        );
                    })}

                    {!readOnly && (
                        <button onClick={addSection} style={{ width: "100%", padding: "14px", backgroundColor: "transparent", border: `2px dashed ${t.border}`, borderRadius: "12px", cursor: "pointer", color: t.muted, fontSize: "14px", fontWeight: 600, transition: "all 0.2s" }}
                            onMouseOver={(e) => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.color = t.accent; }}
                            onMouseOut={(e) => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.muted; }}
                        >
                            + Add New Section
                        </button>
                    )}
                </div>
            </div>

            {/* ── Activity Drawer ───────────────────────────────────────────── */}
            <div style={{ position: "fixed", top: 0, right: 0, width: "320px", height: "100vh", backgroundColor: t.drawerBg, borderLeft: `1px solid ${t.border}`, display: "flex", flexDirection: "column", transform: showActivityPanel ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s ease", zIndex: 99, boxShadow: "-4px 0 20px rgba(0,0,0,0.08)" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: "15px", color: t.text }}>Edit History</div>
                        <div style={{ fontSize: "11px", color: t.muted, marginTop: "2px" }}>{activityLogs.length} events recorded</div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={fetchActivityLogs} style={{ background: "none", border: `1px solid ${t.border}`, borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "12px", color: t.secondary }} title="Refresh">↺</button>
                        <button onClick={() => setShowActivityPanel(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: t.muted }}>✕</button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
                    {activityLogs.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 20px", color: t.muted }}>
                            <div style={{ fontSize: "32px", marginBottom: "10px" }}>🕐</div>
                            <p style={{ margin: 0, fontSize: "13px" }}>No activity yet.</p>
                            <p style={{ margin: "6px 0 0", fontSize: "12px" }}>Start editing to record the history!</p>
                        </div>
                    ) : (
                        activityLogs.map((log, i) => (
                            <div key={log.id} onClick={() => scrollToEdit(log)}
                                style={{ padding: "12px", borderRadius: "10px", marginBottom: "8px", backgroundColor: t.logItemBg, border: `1px solid ${t.border}`, cursor: "pointer", transition: "background 0.15s" }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = t.logItemHover}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = t.logItemBg}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "12px", fontWeight: 700, color: t.accent }}>
                                        {log.user_id ? `User …${log.user_id.slice(-6)}` : "Anonymous"}
                                    </span>
                                    <span style={{ fontSize: "10px", color: t.muted }}>{timeAgo(log.created_at)}</span>
                                </div>
                                <div style={{ fontSize: "11px", color: t.secondary }}>
                                    <span style={{ marginRight: "6px", backgroundColor: log.action === "edit_title" ? "#e8f4fd" : "#f0faf5", color: log.action === "edit_title" ? "#2980b9" : "#27ae60", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                                        {log.action === "edit_title" ? "title" : "content"}
                                    </span>
                                    "{log.content_preview}"
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Button helper ─────────────────────────────────────────────────────────────
const btn = (color, t) => ({
    padding: "6px 14px", cursor: "pointer", backgroundColor: color,
    color: "white", border: "none", borderRadius: "7px",
    fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "5px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.15)", transition: "opacity 0.15s",
});

// ── Theme tokens ──────────────────────────────────────────────────────────────
const light = {
    pageBg: "#f4f6f9", headerBg: "rgba(255,255,255,0.9)", toolbarBg: "#ffffff",
    cardBg: "#ffffff", sectionHeaderBg: "#f9fafb", editorBg: "#ffffff",
    drawerBg: "#ffffff", logItemBg: "#f9f9f9", logItemHover: "#f0f4ff",
    border: "#e5e8ed", shadow: "rgba(0,0,0,0.05)",
    text: "#1a1a2e", secondary: "#4a5568", muted: "#9aa5b1",
    accent: "#4a6cf7", accentFade: "rgba(74,108,247,0.12)", badgeBg: "#eef1ff",
};
const dark = {
    pageBg: "#0f1117", headerBg: "rgba(18,20,28,0.95)", toolbarBg: "#16192a",
    cardBg: "#1a1d2e", sectionHeaderBg: "#1e2235", editorBg: "#1a1d2e",
    drawerBg: "#16192a", logItemBg: "#1e2235", logItemHover: "#252840",
    border: "#2a2d4a", shadow: "rgba(0,0,0,0.3)",
    text: "#e8ecf5", secondary: "#9aa5c0", muted: "#5a6584",
    accent: "#7c9ef8", accentFade: "rgba(124,158,248,0.15)", badgeBg: "#252840",
};

export default Workspace;