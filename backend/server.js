const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ─── Supabase Setup ───────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
    console.log("✅ Supabase connected");
} else {
    console.log("⚠️  Supabase not configured — using in-memory storage only");
}

// ─── Express + Socket.IO Setup ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
});

// In-memory storage
// rooms[roomId] = { sections: [ { id, title, content }, ... ] }
const rooms = {};
const roomUsers = {};
const snapshots = {};

// ─── Helper: create default room ──────────────────────────────────────────────
function createRoom(roomId) {
    rooms[roomId] = {
        sections: [
            { id: uuidv4().slice(0, 6), title: "Section 1", content: "" },
        ],
    };
    return rooms[roomId];
}

// ─── Helper: Save workspace to Supabase (debounced) ──────────────────────────
const saveTimers = {};
function debouncedSave(roomId) {
    if (!supabase || !rooms[roomId]) return;
    if (saveTimers[roomId]) clearTimeout(saveTimers[roomId]);
    saveTimers[roomId] = setTimeout(async () => {
        try {
            const content = JSON.stringify(rooms[roomId].sections);
            await supabase
                .from("workspaces")
                .upsert({ id: roomId, content, updated_at: new Date().toISOString() });
            console.log(`[DB] Saved workspace: ${roomId}`);
        } catch (err) {
            console.error(`[DB] Save error: ${err.message}`);
        }
    }, 1000);
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        if (supabase) {
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user) req.user = user;
        } else {
            req.user = { id: "local-dev-user" };
        }
    }
    next();
};

// ─── HTTP Routes ──────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
    res.json({ message: "Clarity Editor backend running" });
});

// Create a new workspace
app.post("/workspace", optionalAuth, async (req, res) => {
    const roomId = uuidv4().slice(0, 8);
    const room = createRoom(roomId);
    const created_at = new Date().toISOString();
    const owner_id = req.user ? req.user.id : null;
    const is_public = req.body.is_public !== undefined ? req.body.is_public : true;

    // Store metadata for dashboard
    room.created_at = created_at;
    room.name = req.body.name || `Workspace ${roomId}`;
    room.owner_id = owner_id;
    room.is_public = is_public;

    if (supabase) {
        try {
            await supabase
                .from("workspaces")
                .insert({ 
                    id: roomId, 
                    content: JSON.stringify(room.sections), 
                    created_at,
                    owner_id,
                    is_public,
                    name: room.name
                });
        } catch (err) {
            console.error(`[DB] Error creating workspace: ${err.message}`);
        }
    }

    console.log(`[HTTP] Created workspace: ${roomId} by ${owner_id}`);
    res.json({ room_id: roomId, name: room.name, created_at, owner_id, is_public });
});

// List all workspaces (for dashboard)
app.get("/workspaces", async (req, res) => {
    const workspaceList = [];

    // Gather from in-memory
    for (const id in rooms) {
        if (id === "_snapshots") continue;
        const sectionCount = rooms[id].sections ? rooms[id].sections.length : 0;
        const activeUsers = roomUsers[id] ? roomUsers[id].size : 0;
        const preview = rooms[id].sections && rooms[id].sections[0]
            ? rooms[id].sections[0].content.slice(0, 80)
            : "";
        workspaceList.push({
            id,
            name: rooms[id].name || `Workspace ${id}`,
            section_count: sectionCount,
            active_users: activeUsers,
            preview,
            created_at: rooms[id].created_at || null,
        });
    }

    // Also fetch from Supabase (for workspaces not in memory)
    if (supabase) {
        try {
            const { data } = await supabase
                .from("workspaces")
                .select("id, content, created_at")
                .order("created_at", { ascending: false })
                .limit(50);
            if (data) {
                for (const row of data) {
                    if (!workspaceList.find((w) => w.id === row.id)) {
                        let sections = [];
                        let preview = "";
                        try {
                            sections = JSON.parse(row.content);
                            preview = sections[0]?.content?.slice(0, 80) || "";
                        } catch (e) {
                            preview = row.content ? row.content.slice(0, 80) : "";
                        }

                        workspaceList.push({
                            id: row.id,
                            name: `Workspace ${row.id}`,
                            section_count: sections.length || 0,
                            active_users: 0,
                            preview: preview,
                            created_at: row.created_at || null,
                        });
                    }
                }
            }
        } catch (err) {
            console.error(`[DB] Error listing workspaces: ${err.message}`);
        }
    }

    // Sort by created_at descending
    workspaceList.sort((a, b) => {
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json(workspaceList);
});

// Delete workspace
app.delete("/workspace/:id", optionalAuth, async (req, res) => {
    const roomId = req.params.id;

    // Optional: check owner if workspace is protected
    const workspace = rooms[roomId];
    if (workspace && workspace.owner_id && req.user?.id !== workspace.owner_id) {
        // We could block deletion
        // return res.status(403).json({ error: "Only the owner can delete this workspace" });
    }

    // Delete from memory
    delete rooms[roomId];
    if (roomUsers[roomId]) {
        // Kick everyone in the room
        io.to(roomId).disconnectSockets();
        delete roomUsers[roomId];
    }

    // Delete from Supabase
    if (supabase) {
        try {
            await supabase.from("workspaces").delete().eq("id", roomId);
            console.log(`[DB] Deleted workspace: ${roomId}`);
        } catch (err) {
            console.error(`[DB] Delete error: ${err.message}`);
            return res.status(500).json({ error: "Failed to delete from DB" });
        }
    }

    res.json({ success: true });
});

// Get workspace
app.get("/workspace/:id", optionalAuth, async (req, res) => {
    const roomId = req.params.id;

    if (rooms[roomId]) {
        return res.json({ 
            room_id: roomId, 
            sections: rooms[roomId].sections,
            owner_id: rooms[roomId].owner_id,
            is_public: rooms[roomId].is_public !== undefined ? rooms[roomId].is_public : true
        });
    }

    if (supabase) {
        try {
            const { data } = await supabase
                .from("workspaces").select("*").eq("id", roomId).single();
            if (data) {
                try {
                    rooms[roomId] = { sections: JSON.parse(data.content) };
                } catch {
                    rooms[roomId] = { sections: [{ id: uuidv4().slice(0, 6), title: "Section 1", content: data.content || "" }] };
                }
                rooms[roomId].owner_id = data.owner_id;
                rooms[roomId].is_public = data.is_public !== undefined ? data.is_public : true;
                return res.json({ 
                    room_id: roomId, 
                    sections: rooms[roomId].sections,
                    owner_id: data.owner_id,
                    is_public: data.is_public !== undefined ? data.is_public : true
                });
            }
        } catch (err) {
            console.error(`[DB] Error fetching workspace: ${err.message}`);
        }
    }

    res.status(404).json({ error: "Workspace not found" });
});

// Create a snapshot
app.post("/snapshot", async (req, res) => {
    const { content, workspace_id } = req.body;
    const snapshotId = uuidv4().slice(0, 8);
    const created_at = new Date().toISOString();

    snapshots[snapshotId] = { content, created_at, workspace_id };

    if (supabase) {
        try {
            await supabase.from("snapshots").insert({
                id: snapshotId, content, workspace_id: workspace_id || null, created_at,
            });
            console.log(`[DB] Created snapshot: ${snapshotId}`);
        } catch (err) {
            console.error(`[DB] Snapshot error: ${err.message}`);
        }
    }

    res.json({ snapshot_id: snapshotId });
});

// Get a snapshot
app.get("/snapshot/:id", async (req, res) => {
    const snapshotId = req.params.id;

    if (snapshots[snapshotId]) {
        return res.json({ id: snapshotId, ...snapshots[snapshotId] });
    }

    if (supabase) {
        try {
            const { data } = await supabase
                .from("snapshots").select("*").eq("id", snapshotId).single();
            if (data) return res.json(data);
        } catch (err) {
            console.error(`[DB] Snapshot fetch error: ${err.message}`);
        }
    }

    res.status(404).json({ error: "Snapshot not found" });
});

// ─── Activity Logs Routes ────────────────────────────────────────────────────

// Log user activity
app.post("/activity", optionalAuth, async (req, res) => {
    const { action, content_preview, cursor_position, workspace_id } = req.body;
    const user_id = req.user ? req.user.id : null;

    if (!workspace_id) {
        return res.status(400).json({ error: "Workspace ID is required" });
    }

    if (supabase) {
        try {
            await supabase.from("activity_logs").insert({
                workspace_id,
                user_id,
                action: action || "edit",
                content_preview: content_preview || "",
                cursor_position: cursor_position || 0
            });
            return res.json({ status: "ok" });
        } catch (err) {
            console.error(`[DB] Log activity error: ${err.message}`);
            return res.status(500).json({ error: "Failed to log activity" });
        }
    }
    
    // In-memory fallback (if we wanted to build one, but typically logs are just DB)
    res.json({ status: "ok", _mock: true });
});

// Get activity logs
app.get("/activity/:workspace_id", optionalAuth, async (req, res) => {
    const workspaceId = req.params.workspace_id;

    if (supabase) {
        try {
            // Also lookup user email to make it nice for the frontend
            const { data, error } = await supabase
                .from("activity_logs")
                .select(`id, action, content_preview, cursor_position, created_at, user_id`)
                .eq("workspace_id", workspaceId)
                .order("created_at", { ascending: false })
                .limit(50);
                
            // auth schema join might require tricky permissions in supabase,
            // fallback if joining users is denied (because standard users have no read access to auth.users):
            if (error) {
                 const { data: fallbackData, error: fbError } = await supabase
                    .from("activity_logs")
                    .select("*")
                    .eq("workspace_id", workspaceId)
                    .order("created_at", { ascending: false })
                    .limit(50);
                 if (fbError) {
                     console.error(`[DB] Fallback fetch error: ${fbError.message}`);
                 }
                 return res.json(fallbackData || []);
            }
            return res.json(data || []);
        } catch (err) {
            console.error(`[DB] Fetch activity error: ${err.message}`);
            return res.status(500).json({ error: "Failed to fetch activity logs" });
        }
    }
    
    res.json([]);
});

// ─── Socket.IO Events ────────────────────────────────────────────────────────

io.on("connection", (socket) => {
    console.log(`[WS] Connected: ${socket.id}`);

    // ─── Join Room ─────────────────────────────────────────────────────────────
    socket.on("join", async (roomId) => {
        socket.join(roomId);

        if (!roomUsers[roomId]) roomUsers[roomId] = new Set();
        roomUsers[roomId].add(socket.id);

        console.log(`[WS] ${socket.id} joined room ${roomId} (${roomUsers[roomId].size} users)`);

        // Load room data if not in memory
        if (!rooms[roomId]) {
            if (supabase) {
                try {
                    const { data } = await supabase
                        .from("workspaces").select("content").eq("id", roomId).single();
                    if (data) {
                        try {
                            rooms[roomId] = { sections: JSON.parse(data.content) };
                        } catch {
                            rooms[roomId] = { sections: [{ id: uuidv4().slice(0, 6), title: "Section 1", content: data.content || "" }] };
                        }
                    }
                } catch (err) {
                    console.error(`[DB] Load error: ${err.message}`);
                }
            }
            if (!rooms[roomId]) createRoom(roomId);
        }

        // Send full state to joining user
        socket.emit("load-sections", rooms[roomId].sections);
        const count = roomUsers[roomId] ? roomUsers[roomId].size : 0;
        io.to(roomId).emit("user-count", count);
    });

    // ─── Section Content Changed ───────────────────────────────────────────────
    socket.on("section_change", (data) => {
        const { room, sectionId, content } = data;
        if (!room || !sectionId || !rooms[room]) return;

        const section = rooms[room].sections.find((s) => s.id === sectionId);
        if (section) {
            section.content = content;
            socket.to(room).emit("section_update", { sectionId, content });
            debouncedSave(room);
        }
    });

    // ─── Section Title Changed ────────────────────────────────────────────────
    socket.on("section_title_change", (data) => {
        const { room, sectionId, title } = data;
        if (!room || !sectionId || !rooms[room]) return;

        const section = rooms[room].sections.find((s) => s.id === sectionId);
        if (section) {
            section.title = title;
            socket.to(room).emit("section_title_update", { sectionId, title });
            debouncedSave(room);
        }
    });

    // ─── Add Section ───────────────────────────────────────────────────────────
    socket.on("add_section", (data) => {
        const { room } = data;
        if (!room || !rooms[room]) return;

        const newSection = {
            id: uuidv4().slice(0, 6),
            title: `Section ${rooms[room].sections.length + 1}`,
            content: "",
        };
        rooms[room].sections.push(newSection);

        // Broadcast to ALL users (including sender)
        io.to(room).emit("section_added", newSection);
        debouncedSave(room);
        console.log(`[WS] New section added in room ${room}`);
    });

    // ─── Delete Section ────────────────────────────────────────────────────────
    socket.on("delete_section", (data) => {
        const { room, sectionId } = data;
        if (!room || !sectionId || !rooms[room]) return;

        // Don't allow deleting the last section
        if (rooms[room].sections.length <= 1) return;

        rooms[room].sections = rooms[room].sections.filter((s) => s.id !== sectionId);
        io.to(room).emit("section_deleted", { sectionId });
        debouncedSave(room);
        console.log(`[WS] Section ${sectionId} deleted in room ${room}`);
    });

    // ─── Reorder Sections ──────────────────────────────────────────────────────
    socket.on("reorder_sections", (data) => {
        const { room, sections } = data;
        if (!room || !sections || !rooms[room]) return;
        rooms[room].sections = sections;
        // Broadcast new order to everybody else
        socket.to(room).emit("sections_reordered", sections);
        debouncedSave(room);
        console.log(`[WS] Sections reordered in room ${room}`);
    });

    // ─── Disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
        console.log(`[WS] Disconnected: ${socket.id}`);
        for (const roomId in roomUsers) {
            if (roomUsers[roomId].has(socket.id)) {
                roomUsers[roomId].delete(socket.id);
                const count = roomUsers[roomId].size;
                io.to(roomId).emit("user-count", count);
                if (count === 0) delete roomUsers[roomId];
            }
        }
    });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`\n🚀 Clarity Editor backend running on http://localhost:${PORT}`);
    console.log(`   Socket.IO ready | Supabase: ${supabase ? "YES" : "NO"}\n`);
});
