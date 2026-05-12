
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // Store room codes and players

// Serve static files from the "public" directory
app.use(express.static('public'));

// Serve a simple response for the root URL
app.get('/', (req, res) => {
    res.send('Welcome to ArtArena! The server is running.');
});

// Handle socket connections
io.on('connection', (socket) => {
    console.log(`[${new Date().toISOString()}] A user connected: ${socket.id}`);

    // Handle room creation
    socket.on('createRoom', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = { players: [], createdAt: Date.now(), currentWord: null }; // Add a timestamp and word for the room
        socket.join(roomCode);
        rooms[roomCode].players.push({ id: socket.id, name: 'Creator', character: null }); // Placeholder for creator
        socket.emit('roomCreated', roomCode); // Send the room code back to the creator
        console.log(`[${new Date().toISOString()}] Room created: ${roomCode}`, rooms); // Log the rooms object

        // Schedule room deletion after 5 minutes
        setTimeout(() => {
            if (rooms[roomCode] && rooms[roomCode].players.length === 0) {
                delete rooms[roomCode];
                console.log(`[${new Date().toISOString()}] Room deleted after 5 minutes: ${roomCode}`);
            }
        }, 5 * 60 * 1000); // 5 minutes in milliseconds
    });

    // Handle joining a room
    socket.on('joinRoom', ({ roomCode, playerName, selectedCharacter }) => {
        if (rooms[roomCode]) {
            // Check if the player is already in the room
            const isPlayerInRoom = rooms[roomCode].players.some(player => player.id === socket.id);
            if (isPlayerInRoom) {
                socket.emit('roomJoined', roomCode); // Notify the player that they are already in the room
                console.log(`[${new Date().toISOString()}] User ${socket.id} is already in room: ${roomCode}`);
                return;
            }

            // Check if the room is full
            if (rooms[roomCode].players.length >= 10) {
                socket.emit('roomError', 'Room is full. Cannot join.');
                console.log(`[${new Date().toISOString()}] Room is full: ${roomCode}`);
                return;
            }

            // Add the player to the room
            const player = { id: socket.id, name: playerName, character: selectedCharacter };
            rooms[roomCode].players.push(player);
            socket.join(roomCode);

            // Notify the player that they joined successfully
            socket.emit('roomJoined', roomCode);

            // Broadcast the updated player list
            broadcastPlayerList(roomCode);

            console.log(`[${new Date().toISOString()}] User ${socket.id} joined room: ${roomCode}`);
        } else {
            socket.emit('roomError', 'Room does not exist.');
            console.log(`[${new Date().toISOString()}] Failed join attempt for room: ${roomCode}`);
        }
    });

    // Handle word selection for a room
    socket.on('requestWord', (roomCode) => {
        if (rooms[roomCode]) {
            const selectedWord = getRandomWord();
            rooms[roomCode].currentWord = selectedWord; // Store the word for the room
            io.to(roomCode).emit('wordSelected', selectedWord); // Broadcast the word to all players in the room
        }
    });

    // Handle fetching the player list for the leaderboard
    socket.on('getPlayerList', (roomCode) => {
        if (rooms[roomCode]) {
            const players = rooms[roomCode].players.map(player => ({
                name: player.name,
                character: player.character,
            }));
            socket.emit('updatePlayerList', players); // Send the player list to the client
        } else {
            socket.emit('roomError', 'Room does not exist.');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const index = rooms[roomCode].players.findIndex(player => player.id === socket.id);
            if (index !== -1) {
                const [removedPlayer] = rooms[roomCode].players.splice(index, 1);
                console.log(`[${new Date().toISOString()}] Player left room ${roomCode}:`, removedPlayer);

                // Broadcast the updated player list
                broadcastPlayerList(roomCode);

                // If the room is empty, log it (but don't delete it immediately)
                if (rooms[roomCode].players.length === 0) {
                    console.log(`[${new Date().toISOString()}] Room is now empty: ${roomCode}`);
                }
                break;
            }
        }
    });
});

// Generate a random room code
function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomCode;
    do {
        roomCode = '';
        for (let i = 0; i < 6; i++) {
            roomCode += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    } while (rooms[roomCode]); // Ensure the room code is unique
    return roomCode;
}

// Validate room code
app.get('/validate-room/:roomCode', (req, res) => {
    const roomCode = req.params.roomCode;
    if (rooms[roomCode]) {
        res.json({ valid: true });
    } else {
        res.json({ valid: false });
    }
});

// Create a room for solo play
app.get('/create-room', (req, res) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = { players: [], createdAt: Date.now() }; // Initialize the room
    console.log(`[${new Date().toISOString()}] Room created: ${roomCode}`);
    res.json({ roomCode });
});

// Broadcast the updated player list to all players in the room
function broadcastPlayerList(roomCode) {
    if (rooms[roomCode]) {
        const players = rooms[roomCode].players.map(player => ({
            name: player.name,
            character: player.character,
        }));
        io.to(roomCode).emit('updatePlayerList', players);
    }
}

// List of words for the game
const words = [
    "Car", "House", "Tree", "Dog", "Cat", "Sun", "Moon", "Star", "Boat", "Fish",
    "Bird", "Flower", "Mountain", "River", "Chair", "Table", "Laptop", "Phone", "Book", "Clock"
];

// Function to randomly select a word
function getRandomWord() {
    const randomIndex = Math.floor(Math.random() * words.length);
    return words[randomIndex];
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
