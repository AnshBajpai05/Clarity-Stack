import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { socket } from "./socket";

function Workspace() {
    const { id } = useParams();
    const [sections, setSections] = useState([]);
    const [connected, setConnected] = useState(false);
    const [userCount, setUserCount] = useState(0);
    const [copied, setCopied] = useState(false);
    const [snapshotMsg, setSnapshotMsg] = useState("");

    // Debounce timers per section
    const debounceTimers = useRef({});

    const emitSectionChange = useCallback(
        (sectionId, content) => {
            if (debounceTimers.current[sectionId])
                clearTimeout(debounceTimers.current[sectionId]);
            debounceTimers.current[sectionId] = setTimeout(() => {
                socket.emit("section_change", { room: id, sectionId, content });
            }, 300);
        },
        [id]
    );

    useEffect(() => {
        if (!id) return;
        socket.connect();

        socket.on("connect", () => {
            setConnected(true);
            socket.emit("join", id);
        });

        // Load all sections when joining
        socket.on("load-sections", (data) => {
            setSections(data);
        });

        // A section's content was updated by another user
        socket.on("section_update", ({ sectionId, content }) => {
            setSections((prev) =>
                prev.map((s) => (s.id === sectionId ? { ...s, content } : s))
            );
        });

        // A section's title was updated by another user
        socket.on("section_title_update", ({ sectionId, title }) => {
            setSections((prev) =>
                prev.map((s) => (s.id === sectionId ? { ...s, title } : s))
            );
        });

        // A new section was added
        socket.on("section_added", (newSection) => {
            setSections((prev) => {
                // Avoid duplicates
                if (prev.find((s) => s.id === newSection.id)) return prev;
                return [...prev, newSection];
            });
        });

        // A section was deleted
        socket.on("section_deleted", ({ sectionId }) => {
            setSections((prev) => prev.filter((s) => s.id !== sectionId));
        });

        socket.on("user-count", (count) => setUserCount(count));
        socket.on("disconnect", () => setConnected(false));

        return () => {
            socket.off("connect");
            socket.off("load-sections");
            socket.off("section_update");
            socket.off("section_title_update");
            socket.off("section_added");
            socket.off("section_deleted");
            socket.off("user-count");
            socket.off("disconnect");
            socket.disconnect();
        };
    }, [id]);

    const handleContentChange = (sectionId, value) => {
        setSections((prev) =>
            prev.map((s) => (s.id === sectionId ? { ...s, content: value } : s))
        );
        emitSectionChange(sectionId, value);
    };

    const handleTitleChange = (sectionId, value) => {
        setSections((prev) =>
            prev.map((s) => (s.id === sectionId ? { ...s, title: value } : s))
        );
        socket.emit("section_title_change", { room: id, sectionId, title: value });
    };

    const addSection = () => {
        socket.emit("add_section", { room: id });
    };

    const deleteSection = (sectionId) => {
        if (sections.length <= 1) return;
        socket.emit("delete_section", { room: id, sectionId });
    };

    const fallbackCopyTextToClipboard = (text) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // Avoid scrolling to bottom
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
    };

    const copyLink = () => {
        const url = window.location.href;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url);
        } else {
            fallbackCopyTextToClipboard(url);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const createSnapshot = async () => {
        const combinedContent = sections
            .map((s) => `=== ${s.title} ===\n${s.content}`)
            .join("\n\n");
        try {
            const baseUrl = process.env.REACT_APP_BACKEND_URL || `http://${window.location.hostname}:8000`;
            const res = await fetch(`${baseUrl}/snapshot`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: combinedContent, workspace_id: id }),
            });
            if (res.ok) {
                const data = await res.json();
                const link = `${window.location.origin}/snapshot/${data.snapshot_id}`;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(link);
                } else {
                    fallbackCopyTextToClipboard(link);
                }
                setSnapshotMsg("✅ Snapshot created & link copied!");
            } else {
                setSnapshotMsg("❌ Failed to create snapshot");
            }
        } catch (err) {
            setSnapshotMsg("❌ " + err.message);
        }
        setTimeout(() => setSnapshotMsg(""), 3000);
    };

    const createSectionSnapshot = async (section) => {
        try {
            const baseUrl = process.env.REACT_APP_BACKEND_URL || `http://${window.location.hostname}:8000`;
            const res = await fetch(`${baseUrl}/snapshot`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: section.content, workspace_id: id }),
            });
            if (res.ok) {
                const data = await res.json();
                const link = `${window.location.origin}/snapshot/${data.snapshot_id}`;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(link);
                } else {
                    fallbackCopyTextToClipboard(link);
                }
                setSnapshotMsg(`✅ Snapshot for '${section.title}' created & copied!`);
            } else {
                setSnapshotMsg("❌ Failed to create section snapshot");
            }
        } catch (err) {
            setSnapshotMsg("❌ " + err.message);
        }
        setTimeout(() => setSnapshotMsg(""), 3000);
    };

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5", fontFamily: "'Segoe UI', sans-serif" }}>
            {/* ─── Header Bar ─────────────────────────────────────────── */}
            <div style={headerStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>
                        ✏️ Clarity Editor
                    </h2>
                    <span style={roomBadge}>Room: {id}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "13px", color: "#555" }}>
                        👥 {userCount} user{userCount !== 1 ? "s" : ""} editing
                    </span>
                    <span style={{
                        ...statusBadge,
                        backgroundColor: connected ? "#d4edda" : "#f8d7da",
                        color: connected ? "#155724" : "#721c24",
                    }}>
                        {connected ? "● Connected" : "○ Disconnected"}
                    </span>
                </div>
            </div>

            {/* ─── Toolbar ────────────────────────────────────────────── */}
            <div style={toolbarStyle}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <Link to="/" style={{ ...btnPrimary, backgroundColor: "#6c757d", textDecoration: "none" }}>
                        🏠 Home
                    </Link>
                    <button onClick={addSection} style={{ ...btnPrimary, backgroundColor: "#17a2b8" }}>
                        ➕ Add Section
                    </button>
                    <button onClick={copyLink} style={btnPrimary}>
                        {copied ? "✅ Copied!" : "📋 Copy Link"}
                    </button>
                    <button onClick={createSnapshot} style={{ ...btnPrimary, backgroundColor: "#28a745" }}>
                        📸 Create Snapshot
                    </button>
                </div>
                {snapshotMsg && (
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#28a745" }}>
                        {snapshotMsg}
                    </span>
                )}
            </div>

            {/* ─── Sections ───────────────────────────────────────────── */}
            <div style={{ padding: "0 24px 24px", maxWidth: "1000px", margin: "0 auto" }}>
                {sections.map((section, index) => (
                    <div key={section.id} style={sectionCard}>
                        {/* Section Header */}
                        <div style={sectionHeader}>
                            <input
                                type="text"
                                value={section.title}
                                onChange={(e) => handleTitleChange(section.id, e.target.value)}
                                style={sectionTitleInput}
                            />
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <span style={{ fontSize: "11px", color: "#aaa", fontFamily: "monospace" }}>
                                    #{section.id}
                                </span>
                                {sections.length > 1 && (
                                    <button
                                        onClick={() => deleteSection(section.id)}
                                        style={deleteBtn}
                                        title="Delete this section"
                                    >
                                        🗑️
                                    </button>
                                )}
                                <button
                                    onClick={() => createSectionSnapshot(section)}
                                    style={shareSectionBtn}
                                    title={`Create read-only link for ${section.title}`}
                                >
                                    🔗 Share
                                </button>
                            </div>
                        </div>

                        {/* Section Editor */}
                        <textarea
                            value={section.content}
                            onChange={(e) => handleContentChange(section.id, e.target.value)}
                            style={editorTextarea}
                            placeholder={`Start typing in ${section.title}...`}
                        />
                    </div>
                ))}

                {/* Add Section Footer */}
                <div style={{ textAlign: "center", padding: "20px" }}>
                    <button onClick={addSection} style={addSectionBtn}>
                        ➕ Add New Section
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headerStyle = {
    backgroundColor: "#fff",
    borderBottom: "1px solid #e0e0e0",
    padding: "12px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    position: "sticky",
    top: 0,
    zIndex: 10,
};

const roomBadge = {
    fontSize: "12px", color: "#888", backgroundColor: "#f0f0f0",
    padding: "3px 10px", borderRadius: "4px", fontFamily: "monospace",
};

const statusBadge = {
    padding: "4px 10px", borderRadius: "12px",
    fontSize: "12px", fontWeight: 600,
};

const toolbarStyle = {
    padding: "10px 24px",
    display: "flex",
    gap: "10px",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: "1000px",
    margin: "0 auto",
};

const btnPrimary = {
    padding: "8px 16px", cursor: "pointer", backgroundColor: "#007bff",
    color: "white", border: "none", borderRadius: "6px",
    fontSize: "13px", fontWeight: 600,
};

const sectionCard = {
    backgroundColor: "#fff",
    borderRadius: "10px",
    border: "1px solid #e0e0e0",
    marginBottom: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    overflow: "hidden",
};

const sectionHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    backgroundColor: "#f8f9fa",
    borderBottom: "1px solid #eee",
};

const sectionTitleInput = {
    border: "none", outline: "none", background: "transparent",
    fontSize: "15px", fontWeight: 700, color: "#333",
    width: "70%",
};

const deleteBtn = {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "16px", padding: "4px 8px", borderRadius: "4px",
    opacity: 0.6,
};

const shareSectionBtn = {
    background: "#e9ecef", border: "none", cursor: "pointer",
    fontSize: "11px", padding: "4px 10px", borderRadius: "4px",
    color: "#495057", fontWeight: "bold", marginLeft: "8px",
};

const editorTextarea = {
    width: "100%", minHeight: "200px",
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    fontSize: "14px", lineHeight: "1.7", padding: "16px",
    border: "none", outline: "none", resize: "vertical",
    backgroundColor: "#fff", boxSizing: "border-box",
};

const addSectionBtn = {
    padding: "12px 24px", cursor: "pointer",
    backgroundColor: "transparent", color: "#17a2b8",
    border: "2px dashed #17a2b8", borderRadius: "8px",
    fontSize: "14px", fontWeight: 600,
    transition: "all 0.2s",
};

export default Workspace;