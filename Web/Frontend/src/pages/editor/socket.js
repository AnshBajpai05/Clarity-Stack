import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_EDITOR_BACKEND_URL || `http://${window.location.hostname}:8004`;

export const socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    // Send the JWT on the handshake so the Editor can verify identity and gate
    // private workspaces. Evaluated on every (re)connect, so it picks up a fresh
    // token after login.
    auth: (cb) => cb({ token: localStorage.getItem("token") || "" }),
});
