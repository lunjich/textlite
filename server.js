const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// 1. HTTP Server to serve the frontend
const server = http.createServer((req, res) => {
    if (req.url.startsWith('/?')) {
        // Serve the main page even if there are query parameters
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        // Fallback for standard root or basic files
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end("File not found");
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    }
});

// 2. WebSocket Server for Real-Time Chat
const wss = new WebSocketServer({ server });

// Keep track of rooms and connected clients
// Structure: { roomName: [ { ws, username }, ... ] }
const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentUser = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Action: User joins a room
        if (data.type === 'join') {
            currentRoom = data.room;
            currentUser = data.username;

            if (!rooms[currentRoom]) {
                rooms[currentRoom] = [];
            }
            rooms[currentRoom].push({ ws, username: currentUser });

            // Broadcast to the room that someone joined
            broadcast(currentRoom, {
                type: 'system',
                text: `${currentUser} has entered the chat.`
            });
        }

        // Action: User sends a chat message
        if (data.type === 'chat') {
            broadcast(currentRoom, {
                type: 'message',
                user: currentUser,
                text: data.text
            });
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            // Remove user from room array
            rooms[currentRoom] = rooms[currentRoom].filter(client => client.ws !== ws);
            
            // Notify others
            if (currentUser) {
                broadcast(currentRoom, {
                    type: 'system',
                    text: `${currentUser} has left.`
                });
            }
            
            // Clean up empty rooms
            if (rooms[currentRoom].length === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

// Helper function to send messages to everyone in a specific room
function broadcast(roomName, payload) {
    if (rooms[roomName]) {
        rooms[roomName].forEach(client => {
            if (client.ws.readyState === 1) { // 1 = OPEN
                client.ws.send(JSON.stringify(payload));
            }
        });
    }
}

// Start server on port 3000
server.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3000');
});