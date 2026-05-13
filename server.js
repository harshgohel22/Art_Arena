const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

const WORDS = [
    "airplane", "alarm clock", "backpack", "basketball", "bicycle",
    "butterfly", "cake", "castle", "elephant", "flower",
    "guitar", "laptop", "pineapple", "pizza", "scissors",
    "snowflake", "strawberry", "tree", "watermelon", "wristwatch"
];

const TOTAL_ROUNDS = 3;
const ROUND_DURATION = 60; // seconds

// ─── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── REST: Create a solo room ─────────────────────────────────────────────────
// Called by landing.js when the player clicks "Solo Play".
// Creates a room, marks it as solo so joinGame auto-starts it.
app.get('/create-room', (req, res) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = createRoom(null); // hostId set later when socket connects
    rooms[roomCode].solo = true;        // flag: auto-start on first joinGame
    console.log(`[ROOM] Solo room ${roomCode} pre-created`);
    res.json({ roomCode });
});

// ─── REST: Validate room code ─────────────────────────────────────────────────
app.get('/validate-room/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    if (rooms[roomCode] && !rooms[roomCode].gameStarted) {
        res.json({ valid: true });
    } else if (rooms[roomCode] && rooms[roomCode].gameStarted) {
        res.json({ valid: false, reason: 'Game already in progress.' });
    } else {
        res.json({ valid: false, reason: 'Room does not exist.' });
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = Array.from({ length: 6 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    } while (rooms[code]);
    return code;
}

function createRoom(hostId) {
    return {
        players: [],
        scores: {},
        roundScores: {},
        currentWord: null,
        round: 0,
        gameStarted: false,
        hostId,
        roundTimer: null,
        wordsUsed: [],
        solo: false
    };
}

function getRandomWord(used = []) {
    const available = WORDS.filter(w => !used.includes(w));
    const pool = available.length > 0 ? available : WORDS;
    return pool[Math.floor(Math.random() * pool.length)];
}

function broadcastPlayerList(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    const players = room.players.map(p => ({
        id: p.id,
        name: p.name,
        character: p.character,
        score: room.scores[p.id] || 0,
        isHost: p.id === room.hostId
    }));
    io.to(roomCode).emit('updatePlayerList', players);
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    // ── Create solo room via socket (called from game.html?solo=true) ──────────
    socket.on('createSoloRoom', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = createRoom(socket.id);
        rooms[roomCode].solo = true;
        console.log(`[SOLO] Room ${roomCode} created for socket ${socket.id}`);
        socket.emit('soloRoomCreated', roomCode);
    });

    // ── Create room (multiplayer lobby) ───────────────────────────────────────
    socket.on('createRoom', ({ playerName, selectedCharacter }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = createRoom(socket.id);

        const player = { id: socket.id, name: playerName, character: selectedCharacter };
        rooms[roomCode].players.push(player);
        rooms[roomCode].scores[socket.id] = 0;

        socket.join(roomCode);
        socket.roomCode = roomCode;

        socket.emit('roomCreated', roomCode);
        broadcastPlayerList(roomCode);
        console.log(`[ROOM] ${roomCode} created by ${playerName}`);
    });

    // ── Join existing room (multiplayer lobby) ────────────────────────────────
    socket.on('joinRoom', ({ roomCode, playerName, selectedCharacter }) => {
        const room = rooms[roomCode];
        if (!room) { socket.emit('roomError', 'Room does not exist.'); return; }
        if (room.gameStarted) { socket.emit('roomError', 'Game already in progress.'); return; }
        if (room.players.length >= 10) { socket.emit('roomError', 'Room is full.'); return; }

        const alreadyIn = room.players.find(p => p.id === socket.id);
        if (!alreadyIn) {
            const player = { id: socket.id, name: playerName, character: selectedCharacter };
            room.players.push(player);
            room.scores[socket.id] = 0;
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.emit('roomJoined', roomCode);
        broadcastPlayerList(roomCode);
        console.log(`[ROOM] ${playerName} joined ${roomCode}`);
    });

    // ── Join game room (called from game.html on load) ────────────────────────
    socket.on('joinGame', ({ roomCode, playerName, selectedCharacter }) => {
        const room = rooms[roomCode];
        if (!room) { socket.emit('roomError', 'Room not found.'); return; }

        // Re-register / update socket id after page navigation
        const existing = room.players.find(p => p.name === playerName);
        if (existing) {
            const oldId = existing.id;
            existing.id = socket.id;
            // Carry over cumulative score under new socket id
            room.scores[socket.id] = room.scores[oldId] || 0;
            if (oldId !== socket.id) delete room.scores[oldId];
            // If this player was the host, update hostId too
            if (room.hostId === oldId) room.hostId = socket.id;
        } else {
            const player = { id: socket.id, name: playerName, character: selectedCharacter };
            room.players.push(player);
            room.scores[socket.id] = 0;
        }

        socket.join(roomCode);
        socket.roomCode = roomCode;
        broadcastPlayerList(roomCode);
        socket.emit('joinedGame', { hostId: room.hostId });

        // ── Solo auto-start ───────────────────────────────────────────────────
        // For solo rooms, set the host to this socket and start immediately.
        // We wait 1.5 s to give the client time to finish loading the TF model.
        if (room.solo && !room.gameStarted) {
            room.hostId = socket.id;
            room.gameStarted = true;
            console.log(`[SOLO] Auto-starting room ${roomCode} for ${playerName}`);
            setTimeout(() => {
                if (rooms[roomCode]) startNextRound(roomCode);
            }, 1500);
        }
    });

    // ── Host starts multiplayer game ──────────────────────────────────────────
    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;
        if (socket.id !== room.hostId) {
            socket.emit('roomError', 'Only the host can start the game.');
            return;
        }
        room.gameStarted = true;
        io.to(roomCode).emit('gameStarting', roomCode);

        // Wait 4 s for all clients to load game.html, then start round 1
        setTimeout(() => {
            if (rooms[roomCode]) startNextRound(roomCode);
        }, 4000);
    });

    // ── Drawing relay ─────────────────────────────────────────────────────────
    socket.on('drawingData', ({ roomCode, strokeData }) => {
        socket.to(roomCode).emit('remoteDrawingData', {
            playerId: socket.id,
            strokeData
        });
    });

    // ── Score submission ──────────────────────────────────────────────────────
    socket.on('submitScore', ({ roomCode, score }) => {
        const room = rooms[roomCode];
        if (!room) return;

        if (room.roundScores[socket.id] === undefined) {
            room.roundScores[socket.id] = score;
            room.scores[socket.id] = (room.scores[socket.id] || 0) + score;
            console.log(`[SCORE] ${socket.id} scored ${score} in ${roomCode}`);
        }

        const allSubmitted = room.players.every(
            p => room.roundScores[p.id] !== undefined
        );
        if (allSubmitted) {
            clearTimeout(room.roundTimer);
            endRound(roomCode);
        }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;

        const room = rooms[roomCode];
        const idx = room.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
            const [removed] = room.players.splice(idx, 1);
            delete room.scores[socket.id];
            console.log(`[LEAVE] ${removed.name} left ${roomCode}`);

            if (room.players.length === 0) {
                clearTimeout(room.roundTimer);
                delete rooms[roomCode];
                console.log(`[ROOM] ${roomCode} deleted (empty)`);
            } else {
                // If host left, promote next player
                if (socket.id === room.hostId) {
                    room.hostId = room.players[0].id;
                    io.to(room.hostId).emit('youAreHost');
                }
                // If a round is in progress, treat disconnected player as 0
                if (room.gameStarted && room.roundScores[socket.id] === undefined) {
                    room.roundScores[socket.id] = 0;
                    const allSubmitted = room.players.every(
                        p => room.roundScores[p.id] !== undefined
                    );
                    if (allSubmitted) {
                        clearTimeout(room.roundTimer);
                        endRound(roomCode);
                    }
                }
                broadcastPlayerList(roomCode);
            }
        }
        console.log(`[DISCONNECT] ${socket.id}`);
    });
});

// ─── Game Flow ────────────────────────────────────────────────────────────────
function startNextRound(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.round++;
    room.roundScores = {};

    if (room.round > TOTAL_ROUNDS) {
        endGame(roomCode);
        return;
    }

    const word = getRandomWord(room.wordsUsed);
    room.currentWord = word;
    room.wordsUsed.push(word);

    io.to(roomCode).emit('roundStart', {
        round: room.round,
        totalRounds: TOTAL_ROUNDS,
        word,
        duration: ROUND_DURATION
    });

    console.log(`[ROUND] ${roomCode} — Round ${room.round}: "${word}"`);

    // Force-end round after time expires + 5 s buffer for late submissions
    room.roundTimer = setTimeout(() => {
        room.players.forEach(p => {
            if (room.roundScores[p.id] === undefined) {
                room.roundScores[p.id] = 0;
                room.scores[p.id] = room.scores[p.id] || 0; // don't add anything
            }
        });
        endRound(roomCode);
    }, (ROUND_DURATION + 5) * 1000);
}

function endRound(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const results = room.players
        .map(p => ({
            id: p.id,
            name: p.name,
            character: p.character,
            roundScore: room.roundScores[p.id] || 0,
            totalScore: room.scores[p.id] || 0
        }))
        .sort((a, b) => b.totalScore - a.totalScore);

    io.to(roomCode).emit('roundEnd', {
        round: room.round,
        totalRounds: TOTAL_ROUNDS,
        word: room.currentWord,
        results
    });

    console.log(`[ROUND END] ${roomCode} — Round ${room.round} done`);

    setTimeout(() => startNextRound(roomCode), 6000);
}

function endGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const results = room.players
        .map(p => ({
            id: p.id,
            name: p.name,
            character: p.character,
            totalScore: room.scores[p.id] || 0
        }))
        .sort((a, b) => b.totalScore - a.totalScore);

    io.to(roomCode).emit('gameOver', { results });
    console.log(`[GAME OVER] ${roomCode}`);

    setTimeout(() => { delete rooms[roomCode]; }, 30000);
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎨 ArtArena running at http://localhost:${PORT}`);
});