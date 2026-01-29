const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(__dirname));

// Room State
const rooms = {};
// rooms[roomId] = { host: socketId, client: socketId, code: roomId }

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', () => {
        const code = generateRoomCode();
        rooms[code] = { host: socket.id, players: [socket.id] };
        socket.join(code);
        socket.emit('room_created', code);
        console.log(`Room ${code} created by ${socket.id}`);
    });

    socket.on('join_room', (code) => {
        code = code.toUpperCase();
        const room = rooms[code];

        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            room.client = socket.id;
            socket.join(code);

            // Notify Host and Client
            io.to(code).emit('game_start', { role: socket.id === room.host ? 'HOST' : 'CLIENT' });
            console.log(`User ${socket.id} joined room ${code}`);
        } else {
            socket.emit('error_message', 'Room not found or full');
        }
    });

    // Relay Logic: Host sends state -> Server -> Client
    socket.on('server_update', (data) => {
        // Broadcast to everyone ELSE in the room (which is just the client)
        // Data contains roomId
        socket.to(data.roomId).emit('client_update', data.state);
    });

    // Relay Logic: Client sends input -> Server -> Host
    socket.on('player_input', (data) => {
        socket.to(data.roomId).emit('host_input', data.input);
    });

    // Game Events
    socket.on('sync_event', (data) => {
        socket.to(data.roomId).emit('sync_event', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Cleanup rooms... (simplification: if host leaves, room dies)
        for (const code in rooms) {
            if (rooms[code].players.includes(socket.id)) {
                io.to(code).emit('player_disconnected');
                delete rooms[code];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
