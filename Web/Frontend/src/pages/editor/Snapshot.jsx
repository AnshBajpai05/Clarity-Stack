import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

function Snapshot() {
    const { id } = useParams();
    const [snapshot, setSnapshot] = useState(null);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchSnapshot = async () => {
            try {
                const baseUrl = `http://${window.location.hostname}:8003`;
                const res = await fetch(`${baseUrl}/snapshot/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setSnapshot(data);
                } else {
                    setError("Snapshot not found");
                }
            } catch (err) {
                setError("Cannot connect to server");
            }
        };
        fetchSnapshot();
    }, [id]);

    const fallbackCopyTextToClipboard = (text) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
    };

    const copyContent = () => {
        if (snapshot) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(snapshot.content);
            } else {
                fallbackCopyTextToClipboard(snapshot.content);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (error) {
        return (
            <div style={{ padding: "60px", textAlign: "center" }}>
                <h1 style={{ fontSize: "3rem", marginBottom: "10px" }}>😕</h1>
                <h2 style={{ color: "#dc3545" }}>{error}</h2>
                <p style={{ color: "#888" }}>
                    The snapshot ID <code>{id}</code> does not exist or has expired.
                </p>
                <Link
                    to="/editor/dashboard"
                    style={{
                        display: "inline-block",
                        marginTop: "20px",
                        padding: "10px 24px",
                        backgroundColor: "#007bff",
                        color: "white",
                        textDecoration: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                    }}
                >
                    ← Go Home
                </Link>
            </div>
        );
    }

    if (!snapshot) {
        return (
            <div style={{ padding: "60px", textAlign: "center", color: "#888" }}>
                Loading snapshot...
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f5f7fa" }}>
            {/* Header */}
            <div
                style={{
                    backgroundColor: "#fff",
                    borderBottom: "1px solid #e0e0e0",
                    padding: "12px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Link to="/editor/dashboard" style={{ textDecoration: "none", color: "#333" }}>
                        <h2 style={{ margin: 0, fontSize: "20px" }}>✏️ Clarity Editor</h2>
                    </Link>
                    <span
                        style={{
                            fontSize: "12px",
                            backgroundColor: "#ffc107",
                            color: "#333",
                            padding: "3px 10px",
                            borderRadius: "4px",
                            fontWeight: 600,
                        }}
                    >
                        📸 SNAPSHOT (Read-Only)
                    </span>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button
                        onClick={copyContent}
                        style={{
                            padding: "8px 16px",
                            cursor: "pointer",
                            backgroundColor: "#007bff",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontWeight: 600,
                        }}
                    >
                        {copied ? "✅ Copied!" : "📋 Copy Content"}
                    </button>
                    <Link
                        to="/editor/dashboard"
                        style={{
                            padding: "8px 16px",
                            backgroundColor: "#6c757d",
                            color: "white",
                            textDecoration: "none",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontWeight: 600,
                        }}
                    >
                        ← Home
                    </Link>
                </div>
            </div>

            {/* Snapshot Info */}
            <div style={{ padding: "10px 24px" }}>
                <div
                    style={{
                        fontSize: "13px",
                        color: "#666",
                        backgroundColor: "#fff3cd",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        display: "inline-block",
                    }}
                >
                    Snapshot ID: <strong>{id}</strong>
                    {snapshot.created_at && (
                        <> — Created: {new Date(snapshot.created_at).toLocaleString()}</>
                    )}
                </div>
            </div>

            {/* Content (Read-Only) */}
            <div style={{ padding: "0 24px 24px" }}>
                <pre
                    style={{
                        width: "100%",
                        minHeight: "calc(100vh - 180px)",
                        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                        fontSize: "15px",
                        lineHeight: "1.7",
                        padding: "20px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        backgroundColor: "#fff",
                        boxSizing: "border-box",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        whiteSpace: "pre-wrap",
                        wordWrap: "break-word",
                        margin: 0,
                        overflow: "auto",
                    }}
                >
                    {snapshot.content || "(empty snapshot)"}
                </pre>
            </div>
        </div>
    );
}

export default Snapshot;
