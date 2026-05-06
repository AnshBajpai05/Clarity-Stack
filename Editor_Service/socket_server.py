"""
Standalone Socket.IO server on port 8001.
Run with: python socket_server.py
"""
import asyncio
import socketio
from aiohttp import web

sio = socketio.AsyncServer(
    async_mode='aiohttp',
    cors_allowed_origins='*'
)
aio_app = web.Application()
sio.attach(aio_app)

@sio.on('connect')
async def connect(sid, environ):
    print(f"[WS] Connected: {sid}")

@sio.on('join_room')
async def join_room(sid, data):
    room = data.get('room')
    if room:
        await sio.enter_room(sid, room)
        print(f"[WS] {sid} joined room: {room}")

@sio.on('text_change')
async def text_change(sid, data):
    room = data.get('room')
    text = data.get('text')
    if room and text is not None:
        await sio.emit('text_update', {'text': text}, room=room, skip_sid=sid)
        print(f"[WS] Broadcast in room {room}")

@sio.on('disconnect')
async def disconnect(sid):
    print(f"[WS] Disconnected: {sid}")

if __name__ == '__main__':
    print("Socket.IO server starting on port 8001...")
    web.run_app(aio_app, host='127.0.0.1', port=8001)
