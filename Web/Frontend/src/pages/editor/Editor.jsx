import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Editor() {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const startSession = async () => {
        setLoading(true);
        try {
            // Connect to the same host but on port 8000
            const baseUrl = `http://${window.location.hostname}:8003`;
            const res = await fetch(`${baseUrl}/workspace`, {
                method: "POST",
            });
            if (res.ok) {
                const data = await res.json();
                navigate(`/editor/workspace/${data.room_id}`);
            } else {
                alert("Failed to create workspace. Is the backend running?");
            }
        } catch (err) {
            alert("Cannot connect to backend. Run: node server.js");
        }
        setLoading(false);
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                backgroundColor: "#f5f7fa",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <div
                style={{
                    textAlign: "center",
                    maxWidth: "600px",
                    padding: "40px",
                    backgroundColor: "#fff",
                    borderRadius: "12px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                }}
            >
                <h1 style={{ fontSize: "2.5rem", marginBottom: "8px" }}>✏️ Clarity Editor</h1>
                <p style={{ color: "#666", marginBottom: "30px", fontSize: "16px" }}>
                    Lightweight real-time collaborative text editor
                </p>

                <textarea
                    rows="8"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    style={{
                        width: "100%",
                        fontFamily: "'Consolas', 'Monaco', monospace",
                        padding: "15px",
                        fontSize: "14px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        outline: "none",
                        resize: "vertical",
                        lineHeight: "1.6",
                        boxSizing: "border-box",
                        backgroundColor: "#fafafa",
                    }}
                    placeholder="Scratch pad — type anything here, then start a session to collaborate..."
                />

                <br />
                <br />

                <button
                    onClick={startSession}
                    disabled={loading}
                    style={{
                        padding: "14px 36px",
                        cursor: loading ? "wait" : "pointer",
                        backgroundColor: loading ? "#6c757d" : "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "16px",
                        fontWeight: 700,
                        transition: "all 0.2s",
                        boxShadow: "0 2px 8px rgba(0,123,255,0.3)",
                    }}
                >
                    {loading ? "Creating..." : "🚀 Start Session"}
                </button>

                <p style={{ marginTop: "16px", fontSize: "13px", color: "#aaa" }}>
                    A new workspace will be created with a shareable link
                </p>
            </div>
        </div>
    );
}

export default Editor;
