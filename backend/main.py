from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from database import supabase
import uuid
import socketio

# ─── Socket.IO Server ─────────────────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*'
)

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI()

# Wrap FastAPI with Socket.IO ASGIApp
# This is the app we run with uvicorn: uvicorn main:socket_app --reload
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

rooms_data = {}

# ─── Socket.IO Events ─────────────────────────────────────────────────────────
@sio.on('connect')
async def connect(sid, environ):
    print(f"Connected: {sid}")

@sio.on('join')
async def join(sid, room_id):
    await sio.enter_room(sid, room_id)
    print(f"User {sid} joined room: {room_id}")
    if room_id in rooms_data:
        await sio.emit("load-document", rooms_data[room_id], to=sid)

@sio.on('send_changes')
async def send_changes(sid, data):
    room_id = data.get("room")
    content = data.get("content")
    if room_id and content is not None:
        rooms_data[room_id] = content
        # Broadcast to others in the room
        await sio.emit("receive-changes", content, room=room_id, skip_sid=sid)

@sio.on('disconnect')
async def disconnect(sid):
    print(f"Disconnected: {sid}")

# ─── HTTP Routes ──────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Backend running"}

@app.options("/{path:path}")
async def options_handler(path: str):
    from fastapi.responses import Response
    return Response(
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.post("/workspace")
async def create_workspace():
    room_id = str(uuid.uuid4())[:8]
    if supabase:
        try:
            supabase.table("workspaces").insert({"id": room_id, "content": ""}).execute()
        except Exception as e:
            print(f"Warning: Supabase error: {e}")
    return JSONResponse(
        {"room_id": room_id},
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.post("/test")
async def test():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured.")
    try:
        supabase.table("snapshots").insert({"id": "test-" + str(uuid.uuid4())[:4], "content": "hello"}).execute()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
