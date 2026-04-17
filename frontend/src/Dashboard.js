import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function Dashboard() {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    const fetchWorkspaces = async () => {
        setLoading(true);
        try {
            const baseUrl = process.env.REACT_APP_BACKEND_URL || `http://${window.location.hostname}:8000`;
            const res = await fetch(`${baseUrl}/workspaces`);
            if (res.ok) {
                const data = await res.json();
                setWorkspaces(data);
            }
        } catch (err) {
            console.error("Error fetching workspaces:", err);
        }
        setLoading(false);
    };

    const deleteWorkspace = async (e, id) => {
        e.preventDefault(); // Prevent navigating to the room
        if (!window.confirm("Are you sure you want to delete this workspace?")) return;

        try {
            const baseUrl = process.env.REACT_APP_BACKEND_URL || `http://${window.location.hostname}:8000`;
            const res = await fetch(`${baseUrl}/workspace/${id}`, { method: "DELETE" });
            if (res.ok) {
                setWorkspaces(prev => prev.filter(w => w.id !== id));
            } else {
                alert("Failed to delete workspace.");
            }
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    const createWorkspace = async () => {
        setCreating(true);
        try {
            const baseUrl = process.env.REACT_APP_BACKEND_URL || `http://${window.location.hostname}:8000`;
            const res = await fetch(`${baseUrl}/workspace`, { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                navigate(`/workspace/${data.room_id}`);
            }
        } catch (err) {
            alert("Failed to create workspace. Is the backend running?");
        }
        setCreating(false);
    };

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#f5f7fa", padding: "40px 20px" }}>
            <div style={{ maxWidth: "900px", margin: "0 auto" }}>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
                    <div>
                        <h1 style={{ fontSize: "2rem", margin: "0 0 8px 0", color: "#333" }}>✏️ Clarity Dashboard</h1>
                        <p style={{ color: "#666", margin: 0 }}>Manage and join your collaborative workspaces</p>
                    </div>
                    <button
                        onClick={createWorkspace}
                        disabled={creating}
                        style={{
                            padding: "12px 24px",
                            backgroundColor: creating ? "#6c757d" : "#007bff",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            fontSize: "15px",
                            fontWeight: 600,
                            cursor: creating ? "wait" : "pointer",
                            boxShadow: "0 2px 6px rgba(0,123,255,0.3)"
                        }}
                    >
                        {creating ? "Creating..." : "➕ New Workspace"}
                    </button>
                </div>

                {/* Workspace Grid */}
                {loading ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>Loading workspaces...</div>
                ) : workspaces.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px", backgroundColor: "#fff", borderRadius: "12px", border: "1px dashed #ccc" }}>
                        <h3 style={{ color: "#555" }}>No workspaces found</h3>
                        <p style={{ color: "#888", marginBottom: "20px" }}>Create your first workspace to start collaborating!</p>
                        <button onClick={createWorkspace} style={{ padding: "10px 20px", backgroundColor: "#007bff", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
                            Create Workspace
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                        {workspaces.map((ws) => (
                            <Link
                                key={ws.id}
                                to={`/workspace/${ws.id}`}
                                style={{
                                    textDecoration: "none",
                                    backgroundColor: "#fff",
                                    borderRadius: "10px",
                                    padding: "20px",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                                    border: "1px solid #eaeaea",
                                    display: "flex",
                                    flexDirection: "column",
                                    transition: "transform 0.2s, box-shadow 0.2s"
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 6px 15px rgba(0,0,0,0.1)"; }}
                                onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)"; }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                                    <h3 style={{ margin: 0, fontSize: "18px", color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {ws.name}
                                    </h3>
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        {ws.active_users > 0 && (
                                            <span style={{ fontSize: "11px", backgroundColor: "#d4edda", color: "#155724", padding: "3px 8px", borderRadius: "10px", fontWeight: "bold" }}>
                                                ● {ws.active_users} active
                                            </span>
                                        )}
                                        <button
                                            onClick={(e) => deleteWorkspace(e, ws.id)}
                                            style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, fontSize: "14px", padding: 0 }}
                                            title="Delete Workspace"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>

                                <div style={{ fontSize: "13px", color: "#666", marginBottom: "16px", flexGrow: 1 }}>
                                    <span>{ws.section_count} section{ws.section_count !== 1 ? 's' : ''}</span>
                                    <p style={{ marginTop: "8px", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {ws.preview ? `"${ws.preview}..."` : "Empty workspace"}
                                    </p>
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#aaa", borderTop: "1px solid #f0f0f0", paddingTop: "12px" }}>
                                    <span>ID: {ws.id}</span>
                                    {ws.created_at && (
                                        <span>{new Date(ws.created_at).toLocaleDateString()}</span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}

export default Dashboard;
