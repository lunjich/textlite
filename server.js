const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// Helper function to prevent Cross-Site Scripting (XSS) / HTML injection
function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

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

// Structure: { roomName: [ { ws, username }, ... ] }
const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentUser = null;

    ws.on('message', (message) => {
        // FIX: Wrapped in try/catch to prevent malformed JSON from crashing the server
        try {
            const data = JSON.parse(message);

            // Action: User joins a room
            if (data.type === 'join') {
                currentRoom = data.room;
                currentUser = escapeHTML(data.username); // Sanitize the username

                if (!currentRoom || !currentUser) return;

                if (!rooms[currentRoom]) {
                    rooms[currentRoom] = [];
                }
                rooms[currentRoom].push({ ws, username: currentUser });

                console.log(`[JOIN] ${currentUser} entered room: ${currentRoom}`);

                // Broadcast to the room that someone joined
                broadcast(currentRoom, {
                    type: 'system',
                    text: `${currentUser} has entered the chat.`
                });
            }

            // Action: User sends a chat message
            if (data.type === 'chat') {
                // FIX: Guard clause to make sure client has actually joined a room first
                if (!currentRoom || !currentUser) return; 

                broadcast(currentRoom, {
                    type: 'message',
                    user: currentUser,
                    text: escapeHTML(data.text) // FIX: Sanitizes text input to prevent HTML/Script injection
                });
            }
        } catch (err) {
            console.error("[WS ERROR] Failed to process incoming message payload:", err.message);
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            // Remove user from room array
            rooms[currentRoom] = rooms[currentRoom].filter(client => client.ws !== ws);
            
            // Notify others
            if (currentUser) {
                console.log(`[LEAVE] ${currentUser} left room: ${currentRoom}`);
                broadcast(currentRoom, {
                    type: 'system',
                    text: `${currentUser} has left.`
                });
            }
            
            // Clean up empty rooms
            if (rooms[currentRoom].length === 0) {
                console.log(`[ROOM CLEANUP] Room "${currentRoom}" is empty. Deleting.`);
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
    console.log('====================================');
    console.log('Server running on http://localhost:3000');
    console.log('====================================');
});
