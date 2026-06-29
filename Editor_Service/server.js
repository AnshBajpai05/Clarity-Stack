const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// §6.3: validated, aggregated, fail-fast env loader (replaces the old inline
// one-at-a-time JWT_SECRET throw). Still fail-closed — unified on JWT_SECRET
// across Core/Satellite/Editor (was the §1.1/§1.5 auth-bypass when names diverged).
const { loadEnv } = require("./config/env");
const env = loadEnv();
const JWT_SECRET = env.JWT_SECRET;

// ─── Supabase (optional) ──────────────────────────────────────────────────────
const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_KEY;
const isValidUrl = supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://");
const supabase = supabaseUrl && supabaseKey && isValidUrl ? createClient(supabaseUrl, supabaseKey) : null;

// ─── File-based Persistence Setup ────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
const WORKSPACES_FILE = path.join(DATA_DIR, "workspaces.json");
const SNAPSHOTS_FILE  = path.join(DATA_DIR, "snapshots.json");
const ACTIVITY_FILE   = path.join(DATA_DIR, "activity.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("📁 Created data/ directory for file-based persistence");
}

function readJSON(filePath, fallback = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
    } catch (e) {
        console.error(`[FILE] Error reading ${filePath}: ${e.message}`);
    }
    return fallback;
}

function writeJSON(filePath, data) {
    // Atomic write (§3.3): serialize to a temp file then rename. rename() is atomic
    // on the same filesystem, so a crash mid-write can't truncate/corrupt the live
    // file (which holds *all* workspaces).
    const tmp = `${filePath}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(tmp, filePath);
    } catch (e) {
        console.error(`[FILE] Error writing ${filePath}: ${e.message}`);
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    }
}

// ─── Load persisted data on startup ──────────────────────────────────────────
const rooms     = readJSON(WORKSPACES_FILE, {});
const snapshots = readJSON(SNAPSHOTS_FILE, {});
const activityLogs = readJSON(ACTIVITY_FILE, {}); // { workspace_id: [log, ...] }
const roomUsers = {};

console.log(`✅ Loaded ${Object.keys(rooms).length} workspace(s) from disk`);
console.log(`✅ Loaded ${Object.keys(snapshots).length} snapshot(s) from disk`);
if (supabase) {
    console.log("✅ Supabase connected (used as secondary backup)");
} else {
    console.log("⚠️  Supabase not configured — using file-based persistence");
}

// ─── Express + Socket.IO Setup ────────────────────────────────────────────────
// CORS allow-list (§5.5) — explicit origins instead of "*". Override per
// environment with CORS_ORIGINS (comma-separated); defaults to local dev UIs.
const ALLOWED_ORIGINS = env.CORS_ORIGINS
    .split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(cookieParser()); // §5.4: parse httpOnly cookies
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"], credentials: true },
});

// ─── Helper: create default room ─────────────────────────────────────────────
function createRoom(roomId) {
    rooms[roomId] = {
        sections: [{ id: uuidv4().slice(0, 6), title: "Section 1", content: "" }],
        created_at: new Date().toISOString(),
        owner_id: null,
        is_public: true,
        name: `Workspace ${roomId}`,
    };
    return rooms[roomId];
}

// ─── Debounced file save ──────────────────────────────────────────────────────
// §3.3: the debounce coalesces edit bursts, but a *cap* (MAX_SAVE_WAIT) guarantees
// continuous editing can't starve persistence — the old version reset the timer on
// every keystroke, so a busy room never flushed until edits paused >1.5s, widening
// the crash-loss window unboundedly. Writes are atomic (see writeJSON), and the whole
// `rooms` map is intentionally one file at this scale (revisit per-workspace files if
// it grows). §2.2 (the in-memory Python backend that lost state on restart) is gone —
// this file-based server.js is now the single editor backend.
const saveTimers = {};
const MAX_SAVE_WAIT = 10000; // force a flush at least this often under continuous edits
let lastWorkspaceSaveAt = Date.now();

function flushWorkspaces() {
    if (saveTimers["_main"]) {
        clearTimeout(saveTimers["_main"]);
        saveTimers["_main"] = null;
    }
    writeJSON(WORKSPACES_FILE, rooms);
    lastWorkspaceSaveAt = Date.now();
    console.log(`[FILE] Workspaces saved to disk`);
}

function scheduleSave(delay = 1500) {
    if (Date.now() - lastWorkspaceSaveAt >= MAX_SAVE_WAIT) {
        flushWorkspaces();   // cap reached → don't let the debounce keep deferring the save
        return;
    }
    if (saveTimers["_main"]) clearTimeout(saveTimers["_main"]);
    saveTimers["_main"] = setTimeout(flushWorkspaces, delay);
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const optionalAuth = (req, res, next) => {
    let token = null;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    } else if (req.cookies && req.cookies.access_token) {
        token = req.cookies.access_token;
    }

    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            // ClarityStack JWT stores user email in `sub`
            const userId = payload.sub || payload.email || payload.user_id || payload.id;
            req.user = { id: userId };
        } catch (err) {
            // Token invalid — treat as anonymous
            req.user = null;
        }
    } else {
        req.user = null;
    }
    next();
};

// ─── HTTP Routes ──────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
    res.json({ message: "Clarity Editor backend running", persistence: "file-based" });
});

// ── Create a new workspace ────────────────────────────────────────────────────
app.post("/workspace", optionalAuth, async (req, res) => {
    const roomId   = uuidv4().slice(0, 8);
    const owner_id = req.user ? req.user.id : null;
    const is_public = req.body.is_public !== undefined ? !!req.body.is_public : true;
    const created_at = new Date().toISOString();

    let sections = req.body.sections;
    if (!sections || !Array.isArray(sections)) {
        sections = [{ id: uuidv4().slice(0, 6), title: "Section 1", content: "" }];
    }

    rooms[roomId] = {
        sections,
        created_at,
        name: req.body.name || `Workspace ${roomId}`,
        owner_id,
        is_public,
    };

    // Persist immediately
    scheduleSave(500);

    // Also try Supabase if configured
    if (supabase) {
        try {
            await supabase.from("workspaces").insert({
                id: roomId,
                content: JSON.stringify(sections),
                created_at,
                owner_id,
                is_public,
                name: rooms[roomId].name,
            });
        } catch (err) {
            console.error(`[DB] Supabase insert error: ${err.message}`);
        }
    }

    console.log(`[HTTP] Created workspace: ${roomId} | owner: ${owner_id} | public: ${is_public}`);
    res.json({ room_id: roomId, name: rooms[roomId].name, created_at, owner_id, is_public });
});

// ── List workspaces for the requesting user ───────────────────────────────────
app.get("/workspaces", optionalAuth, async (req, res) => {
    const userId = req.user ? req.user.id : null;
    const workspaceList = [];

    for (const id in rooms) {
        const room = rooms[id];
        const isPublic = room.is_public !== undefined ? room.is_public : true;

        // Show if: public, OR user is the owner, OR owner_id is null (legacy anonymous)
        if (!isPublic && room.owner_id !== null && room.owner_id !== userId) continue;

        const sectionCount  = room.sections ? room.sections.length : 0;
        const activeUsers   = roomUsers[id] ? roomUsers[id].size : 0;
        const preview       = room.sections && room.sections[0]
            ? room.sections[0].content.slice(0, 80)
            : "";

        workspaceList.push({
            id,
            name: room.name || `Workspace ${id}`,
            section_count: sectionCount,
            active_users: activeUsers,
            preview,
            created_at: room.created_at || null,
            owner_id: room.owner_id,
            is_public: isPublic,
        });
    }

    // Sort newest first
    workspaceList.sort((a, b) => {
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json(workspaceList);
});

// ── Get a single workspace ────────────────────────────────────────────────────
app.get("/workspace/:id", optionalAuth, async (req, res) => {
    const roomId = req.params.id;
    const userId = req.user ? req.user.id : null;

    if (rooms[roomId]) {
        const room = rooms[roomId];
        const isPublic = room.is_public !== undefined ? room.is_public : true;
        // Private workspaces are readable only by their owner (§1.5).
        if (!isPublic && (!userId || (room.owner_id && room.owner_id !== userId))) {
            return res.status(403).json({ error: "You do not have access to this workspace" });
        }
        return res.json({
            room_id: roomId,
            sections: room.sections,
            owner_id: room.owner_id,
            is_public: isPublic,
            name: room.name || `Workspace ${roomId}`,
            created_at: room.created_at || null,
        });
    }

    res.status(404).json({ error: "Workspace not found" });
});

// ── Delete workspace ──────────────────────────────────────────────────────────
app.delete("/workspace/:id", optionalAuth, async (req, res) => {
    const roomId = req.params.id;
    const userId = req.user ? req.user.id : null;

    const workspace = rooms[roomId];
    if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
    }

    // Only owner can delete (if owner_id is set)
    if (workspace.owner_id && workspace.owner_id !== userId) {
        return res.status(403).json({ error: "Only the owner can delete this workspace" });
    }

    delete rooms[roomId];
    delete activityLogs[roomId];

    if (roomUsers[roomId]) {
        io.to(roomId).disconnectSockets();
        delete roomUsers[roomId];
    }

    scheduleSave(500);
    writeJSON(ACTIVITY_FILE, activityLogs);

    if (supabase) {
        try { await supabase.from("workspaces").delete().eq("id", roomId); } catch {}
    }

    res.json({ success: true });
});

// ── Create a snapshot ─────────────────────────────────────────────────────────
app.post("/snapshot", async (req, res) => {
    const { content, workspace_id } = req.body;
    const snapshotId = uuidv4().slice(0, 8);
    const created_at = new Date().toISOString();

    snapshots[snapshotId] = { content, created_at, workspace_id };
    writeJSON(SNAPSHOTS_FILE, snapshots);

    if (supabase) {
        try {
            await supabase.from("snapshots").insert({
                id: snapshotId, content, workspace_id: workspace_id || null, created_at,
            });
        } catch {}
    }

    res.json({ snapshot_id: snapshotId });
});

// ── Get a snapshot ────────────────────────────────────────────────────────────
app.get("/snapshot/:id", async (req, res) => {
    const snapshotId = req.params.id;
    if (snapshots[snapshotId]) {
        return res.json({ id: snapshotId, ...snapshots[snapshotId] });
    }
    res.status(404).json({ error: "Snapshot not found" });
});

// ── Activity Logs ─────────────────────────────────────────────────────────────

app.post("/activity", optionalAuth, async (req, res) => {
    const { action, content_preview, cursor_position, workspace_id } = req.body;
    const user_id = req.user ? req.user.id : null;

    if (!workspace_id) {
        return res.status(400).json({ error: "Workspace ID is required" });
    }

    const entry = {
        id: uuidv4().slice(0, 8),
        workspace_id,
        user_id,
        action: action || "edit",
        content_preview: content_preview || "",
        cursor_position: cursor_position || 0,
        created_at: new Date().toISOString(),
    };

    if (!activityLogs[workspace_id]) activityLogs[workspace_id] = [];
    activityLogs[workspace_id].unshift(entry); // newest first
    // Keep only last 100 entries per workspace
    if (activityLogs[workspace_id].length > 100) {
        activityLogs[workspace_id] = activityLogs[workspace_id].slice(0, 100);
    }

    // Persist activity (debounced)
    if (saveTimers["_activity"]) clearTimeout(saveTimers["_activity"]);
    saveTimers["_activity"] = setTimeout(() => writeJSON(ACTIVITY_FILE, activityLogs), 2000);

    res.json({ status: "ok" });
});

app.get("/activity/:workspace_id", optionalAuth, (req, res) => {
    const workspaceId = req.params.workspace_id;
    res.json(activityLogs[workspaceId] || []);
});

// ─── Socket.IO Events ────────────────────────────────────────────────────────

// Authenticate the socket handshake (§1.5). The token is sent by the client in
// `io({ auth: { token } })`. We don't reject anonymous sockets outright (public
// workspaces stay collaboratively viewable) — instead we attach the identity and
// gate *private* rooms per-event below.
io.use((socket, next) => {
    let token = socket.handshake.auth && socket.handshake.auth.token;
    
    if (!token && socket.handshake.headers.cookie) {
        // Fallback to httpOnly cookie for WS connection from browser
        const cookies = socket.handshake.headers.cookie.split(';').reduce((acc, c) => {
            const parts = c.split('=');
            if (parts.length >= 2) {
                acc[parts[0].trim()] = parts[1].trim();
            }
            return acc;
        }, {});
        token = cookies.access_token;
    }

    socket.user = null;
    if (token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            socket.user = { id: payload.sub || payload.email || payload.user_id || payload.id };
        } catch {
            socket.user = null;
        }
    }
    next();
});

// Access gate: a private room is reachable only by its owner. Public rooms (and
// not-yet-created rooms, which are born public) are open for collaboration.
function canAccessRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return true; // will be created fresh as a public room
    const isPublic = room.is_public !== undefined ? room.is_public : true;
    if (isPublic) return true;
    const uid = socket.user ? socket.user.id : null;
    return !!(uid && room.owner_id && uid === room.owner_id);
}

io.on("connection", (socket) => {
    console.log(`[WS] Connected: ${socket.id}`);

    // ── Join Room ─────────────────────────────────────────────────────────────
    socket.on("join", (roomId) => {
        if (!canAccessRoom(socket, roomId)) {
            socket.emit("unauthorized", { error: "You do not have access to this private workspace" });
            console.warn(`[WS] ${socket.id} denied join to private room ${roomId}`);
            return;
        }

        socket.join(roomId);

        if (!roomUsers[roomId]) roomUsers[roomId] = new Set();
        roomUsers[roomId].add(socket.id);

        console.log(`[WS] ${socket.id} joined room ${roomId} (${roomUsers[roomId].size} users)`);

        // Create room if it doesn't exist (e.g. old link before restart)
        if (!rooms[roomId]) {
            createRoom(roomId);
            scheduleSave(1000);
        }

        // Send full state to joining user
        socket.emit("load-sections", rooms[roomId].sections);
        io.to(roomId).emit("user-count", roomUsers[roomId].size);
    });

    // ── Section Content Changed ───────────────────────────────────────────────
    socket.on("section_change", (data) => {
        const { room, sectionId, content } = data;
        if (!room || !sectionId || !rooms[room]) return;
        if (!canAccessRoom(socket, room)) return;

        const section = rooms[room].sections.find((s) => s.id === sectionId);
        if (section) {
            section.content = content;
            socket.to(room).emit("section_update", { sectionId, content });
            scheduleSave(); // debounced save to disk
        }
    });

    // ── Section Title Changed ─────────────────────────────────────────────────
    socket.on("section_title_change", (data) => {
        const { room, sectionId, title } = data;
        if (!room || !sectionId || !rooms[room]) return;
        if (!canAccessRoom(socket, room)) return;

        const section = rooms[room].sections.find((s) => s.id === sectionId);
        if (section) {
            section.title = title;
            socket.to(room).emit("section_title_update", { sectionId, title });
            scheduleSave();
        }
    });

    // ── Add Section ───────────────────────────────────────────────────────────
    socket.on("add_section", (data) => {
        const { room } = data;
        if (!room || !rooms[room]) return;
        if (!canAccessRoom(socket, room)) return;

        const newSection = {
            id: uuidv4().slice(0, 6),
            title: `Section ${rooms[room].sections.length + 1}`,
            content: "",
        };
        rooms[room].sections.push(newSection);
        io.to(room).emit("section_added", newSection);
        scheduleSave();
        console.log(`[WS] New section added in room ${room}`);
    });

    // ── Delete Section ────────────────────────────────────────────────────────
    socket.on("delete_section", (data) => {
        const { room, sectionId } = data;
        if (!room || !sectionId || !rooms[room]) return;
        if (!canAccessRoom(socket, room)) return;

        if (rooms[room].sections.length <= 1) return; // keep at least one

        rooms[room].sections = rooms[room].sections.filter((s) => s.id !== sectionId);
        io.to(room).emit("section_deleted", { sectionId });
        scheduleSave();
    });

    // ── Reorder Sections ──────────────────────────────────────────────────────
    socket.on("reorder_sections", (data) => {
        const { room, sections } = data;
        if (!room || !sections || !rooms[room]) return;
        if (!canAccessRoom(socket, room)) return;
        rooms[room].sections = sections;
        socket.to(room).emit("sections_reordered", sections);
        scheduleSave();
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
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
const PORT = env.PORT;
server.listen(PORT, env.BIND_HOST, () => {
    console.log(`\n🚀 Clarity Editor backend running on http://${env.BIND_HOST}:${PORT}`);
    console.log(`   Socket.IO ready | Persistence: FILE (data/workspaces.json)\n`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
function gracefulShutdown(signal) {
    console.log(`\n[SYS] Received ${signal}. Flushing data to disk...`);
    writeJSON(WORKSPACES_FILE, rooms);
    writeJSON(ACTIVITY_FILE, activityLogs);
    writeJSON(SNAPSHOTS_FILE, snapshots);
    console.log("[SYS] Data flushed. Exiting safely.");
    process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

