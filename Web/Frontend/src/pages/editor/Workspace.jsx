import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { socket } from "./socket";
import { generateUML } from "@/lib/api";
import { toast } from "sonner";

function Workspace() {
    const { id } = useParams();
    
    const currentUserEmail = localStorage.getItem("cs_email");

    const [sections, setSections] = useState([]);
    const [connected, setConnected] = useState(false);
    const [userCount, setUserCount] = useState(0);
    const [copied, setCopied] = useState(false);
    const [snapshotMsg, setSnapshotMsg] = useState("");
    const [readOnly, setReadOnly] = useState(false);
    const [activityLogs, setActivityLogs] = useState([]);
    const [showActivityPanel, setShowActivityPanel] = useState(false);
    const [focusedSection, setFocusedSection] = useState(null);

    const debounceTimers = useRef({});
    const activityTimer = useRef({});

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

    const handleGenerateUML = async (type) => {
        toast.info(`Generating ${type} diagram...`);
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
        <div className="min-h-screen bg-background text-foreground font-sans flex overflow-hidden transition-colors">

            {/* ── Main content ─────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col transition-all duration-300" style={{ marginRight: showActivityPanel ? "320px" : "0" }}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <header className="h-[58px] bg-background/90 border-b border-border px-7 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
                    <div className="flex items-center gap-3.5">
                        <span className="text-[20px] font-display font-bold text-neon-violet tracking-tight">Clarity</span>
                        <span className="text-[12px] text-muted-foreground bg-muted/30 px-2.5 py-0.5 rounded-full font-mono">{id}</span>
                        {readOnly && <span className="text-[11px] text-[#e67e22] bg-[#fef3cd] px-2 py-0.5 rounded-full font-bold">VIEW ONLY</span>}
                    </div>

                    <div className="flex items-center gap-3.5">
                        {lastLog && (
                            <span className="text-[12px] text-muted-foreground italic">
                                Last edit · {timeAgo(lastLog.created_at)}
                            </span>
                        )}
                        <span className="text-[13px] text-muted-foreground">
                            {userCount} {userCount === 1 ? "person" : "people"} editing
                        </span>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${connected ? 'bg-neon-mint/15 text-neon-mint' : 'bg-destructive/15 text-destructive'}`}>
                            {connected ? "● Live" : "○ Offline"}
                        </span>
                    </div>
                </header>

                {/* ── Toolbar ────────────────────────────────────────────── */}
                <div className="bg-muted/10 border-b border-border px-7 py-2 flex items-center gap-2 flex-wrap">
                    <Link to="/editor/dashboard" className="px-3.5 py-1.5 cursor-pointer bg-muted hover:bg-muted/80 text-foreground border-none rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-opacity no-underline">← Dashboard</Link>
                    {!readOnly && (
                        <button onClick={addSection} className="px-3.5 py-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground border-none rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-opacity">+ Add Section</button>
                    )}
                    <button onClick={copyLink} className="px-3.5 py-1.5 cursor-pointer bg-accent hover:bg-accent/90 text-accent-foreground border-none rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-opacity">{copied ? "✓ Copied" : "Copy Link"}</button>
                    <button onClick={createSnapshot} className="px-3.5 py-1.5 cursor-pointer bg-neon-mint hover:bg-neon-mint/90 text-background border-none rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-opacity transform hover:-translate-y-0.5">📸 Snapshot</button>
                    <button onClick={() => { setShowActivityPanel(!showActivityPanel); if (!showActivityPanel) fetchActivityLogs(); }} className="px-3.5 py-1.5 cursor-pointer bg-neon-violet hover:bg-neon-violet/90 text-background border-none rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-opacity">
                        {showActivityPanel ? "Hide History" : "📜 History"}
                    </button>

                    <div className="relative inline-block group">
                        <button 
                            className="px-3.5 py-1.5 cursor-pointer bg-transparent border-2 border-neon-violet text-neon-violet rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-opacity"
                        >
                            ✨ AI Diagram ▾
                        </button>
                        <div className="hidden group-hover:flex flex-col absolute top-full left-0 bg-background border border-border rounded-lg shadow-xl z-[100] min-w-[150px] p-1 mt-1 glass-panel">
                            <button onClick={() => handleGenerateUML('usecase')} className="text-left px-3 py-2 text-xs hover:bg-neon-violet/20 text-foreground rounded transition-colors bg-transparent border-none cursor-pointer">Use Case</button>
                            <button onClick={() => handleGenerateUML('activity')} className="text-left px-3 py-2 text-xs hover:bg-neon-violet/20 text-foreground rounded transition-colors bg-transparent border-none cursor-pointer">Activity</button>
                            <button onClick={() => handleGenerateUML('dfd')} className="text-left px-3 py-2 text-xs hover:bg-neon-violet/20 text-foreground rounded transition-colors bg-transparent border-none cursor-pointer">DFD</button>
                        </div>
                    </div>
                    {snapshotMsg && (
                        <span className={`text-[12px] font-semibold ml-2 ${snapshotMsg.startsWith("✅") ? "text-neon-mint" : "text-destructive"}`}>{snapshotMsg}</span>
                    )}
                </div>

                {/* ── Sections ───────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto p-7 max-w-[820px] w-full mx-auto box-border">
                    {sections.map((section, index) => {
                        const wc = wordCount(section.content);
                        const isFocused = focusedSection === section.id;
                        return (
                            <div key={section.id} className={`glass-panel rounded-xl mb-5 overflow-hidden transition-all duration-200 ${isFocused ? 'border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]' : 'border-border/50'}`}>

                                {/* Section header */}
                                <div className="flex items-center px-4 py-2.5 bg-muted/10 border-b border-border/50 gap-2">
                                    {/* Reorder buttons */}
                                    {!readOnly && (
                                        <div className="flex flex-col gap-0.5 mr-1.5">
                                            <button onClick={() => moveSection(index, -1)} disabled={index === 0} className={`bg-transparent border-none cursor-pointer text-[11px] leading-none px-1 py-0.5 rounded ${index === 0 ? 'text-muted/50 cursor-not-allowed' : 'text-muted-foreground hover:bg-muted'}`} title="Move Up">▲</button>
                                            <button onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} className={`bg-transparent border-none cursor-pointer text-[11px] leading-none px-1 py-0.5 rounded ${index === sections.length - 1 ? 'text-muted/50 cursor-not-allowed' : 'text-muted-foreground hover:bg-muted'}`} title="Move Down">▼</button>
                                        </div>
                                    )}

                                    {/* Section number badge */}
                                    <span className="text-[11px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                                        {index + 1}
                                    </span>

                                    <input
                                        type="text"
                                        value={section.title}
                                        onChange={(e) => handleTitleChange(section.id, e.target.value)}
                                        className="flex-1 border-none outline-none bg-transparent text-[15px] font-display font-bold text-foreground min-w-0"
                                        disabled={readOnly}
                                        placeholder="Section title…"
                                    />

                                    <div className="flex gap-1.5 items-center shrink-0">
                                        <span className="text-[11px] text-muted-foreground">{wc} words</span>
                                        <span className="text-[11px] text-muted-foreground font-mono">#{section.id}</span>
                                        <button onClick={() => createSectionSnapshot(section)} className="text-[11px] px-2.5 py-1 bg-muted/30 border border-border/50 rounded-md cursor-pointer text-muted-foreground font-semibold hover:bg-muted/50 transition-colors" title="Create shareable read-only link">
                                            Share
                                        </button>
                                        {sections.length > 1 && !readOnly && (
                                            <button onClick={() => deleteSection(section.id)} className="bg-transparent border-none cursor-pointer text-[15px] text-muted-foreground p-1 rounded hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete section">✕</button>
                                        )}
                                    </div>
                                </div>

                                {/* Textarea */}
                                <textarea
                                    value={section.content}
                                    onChange={(e) => handleContentChange(section.id, e.target.value, e.target.selectionStart)}
                                    onFocus={() => setFocusedSection(section.id)}
                                    onBlur={() => setFocusedSection(null)}
                                    className="w-full min-h-[180px] font-mono text-[14px] leading-relaxed px-5 py-4 border-none outline-none resize-y bg-background text-foreground box-border"
                                    placeholder={readOnly ? "" : `Start writing in ${section.title}…`}
                                    disabled={readOnly}
                                />

                                {/* Footer stats */}
                                <div className="px-5 py-1.5 bg-muted/10 border-t border-border/50 flex gap-4 text-[11px] text-muted-foreground">
                                    <span>{section.content.length} chars</span>
                                    <span>{section.content.split(/\r?\n/).length} lines</span>
                                </div>
                            </div>
                        );
                    })}

                    {!readOnly && (
                        <button onClick={addSection} className="w-full p-3.5 bg-transparent border-2 border-dashed border-border/50 rounded-xl cursor-pointer text-muted-foreground text-sm font-semibold transition-all hover:border-primary hover:text-primary hover:bg-primary/5">
                            + Add New Section
                        </button>
                    )}
                </div>
            </div>

            {/* ── Activity Drawer ───────────────────────────────────────────── */}
            <div className={`fixed top-0 right-0 w-[320px] h-screen bg-background border-l border-border flex flex-col z-[99] shadow-[-4px_0_20px_rgba(0,0,0,0.08)] transition-transform duration-300 ${showActivityPanel ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="px-5 py-4 border-b border-border flex justify-between items-center glass-panel">
                    <div>
                        <div className="font-display font-bold text-[15px] text-foreground tracking-tight">Edit History</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{activityLogs.length} events recorded</div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchActivityLogs} className="bg-transparent border border-border rounded-md px-2.5 py-1 cursor-pointer text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Refresh">↺</button>
                        <button onClick={() => setShowActivityPanel(false)} className="bg-transparent border-none text-[18px] cursor-pointer text-muted-foreground hover:text-foreground transition-colors">✕</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 bg-muted/10">
                    {activityLogs.length === 0 ? (
                        <div className="text-center py-10 px-5 text-muted-foreground">
                            <div className="text-[32px] mb-2.5 opacity-50">🕐</div>
                            <p className="m-0 text-[13px] font-medium">No activity yet.</p>
                            <p className="mt-1.5 mb-0 text-[12px]">Start editing to record the history!</p>
                        </div>
                    ) : (
                        activityLogs.map((log, i) => (
                            <div key={log.id} onClick={() => scrollToEdit(log)}
                                className="p-3 rounded-lg mb-2 bg-background border border-border/50 cursor-pointer transition-colors hover:bg-muted/50"
                            >
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[12px] font-bold text-primary">
                                        {log.user_id ? `User …${log.user_id.slice(-6)}` : "Anonymous"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{timeAgo(log.created_at)}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    <span className={`mr-1.5 px-1.5 py-0.5 rounded font-semibold ${log.action === "edit_title" ? "bg-accent/20 text-accent" : "bg-neon-mint/20 text-neon-mint"}`}>
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

export default Workspace;