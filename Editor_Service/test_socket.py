import socketio

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = socketio.ASGIApp(sio)

@sio.on('connect')
async def connect(sid, environ):
    print(f"connected: {sid}")
