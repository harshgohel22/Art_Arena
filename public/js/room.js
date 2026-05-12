const socket = io();

const playerName = localStorage.getItem('playerName') || '';
const selectedCharacter = localStorage.getItem('selectedCharacter') || '';
let isHost = false;
let myRoomCode = null;

// ─── Create Room ──────────────────────────────────────────────────────────────
document.getElementById('createRoomBtn').addEventListener('click', () => {
    if (!playerName) { alert('Please enter your name on the main page first.'); return; }
    socket.emit('createRoom', { playerName, selectedCharacter });
});

socket.on('roomCreated', (roomCode) => {
    myRoomCode = roomCode;
    isHost = true;
    document.getElementById('roomCode').textContent = roomCode;
    document.getElementById('roomCodeDisplay').style.display = 'block';
    document.getElementById('startGameBtn').style.display = 'inline-block';
    document.getElementById('hostBadge').style.display = 'inline';
    console.log(`Room created: ${roomCode}`);
});

// ─── Join Room ────────────────────────────────────────────────────────────────
document.getElementById('joinRoomBtn').addEventListener('click', () => {
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (!code) { alert('Please enter a room code.'); return; }
    if (!playerName) { alert('Please enter your name on the main page first.'); return; }

    fetch(`/validate-room/${code}`)
        .then(r => r.json())
        .then(data => {
            if (data.valid) {
                socket.emit('joinRoom', { roomCode: code, playerName, selectedCharacter });
                myRoomCode = code;
            } else {
                showStatus(data.reason || 'Invalid room code.', 'error');
            }
        })
        .catch(() => showStatus('Connection error. Try again.', 'error'));
});

socket.on('roomJoined', (roomCode) => {
    myRoomCode = roomCode;
    showStatus(`✅ Joined room: ${roomCode}`, 'success');
    document.getElementById('roomCodeInput').value = roomCode;
});

socket.on('roomError', (msg) => showStatus(msg, 'error'));

// ─── Player List ──────────────────────────────────────────────────────────────
socket.on('updatePlayerList', (players) => {
    const list = document.getElementById('playerList');
    list.innerHTML = players.map(p =>
        `<li>${p.isHost ? '👑 ' : ''}${p.name}</li>`
    ).join('');
    document.getElementById('playerCount').textContent = `${players.length} player${players.length !== 1 ? 's' : ''} in room`;
});

// ─── Start Game (host only) ───────────────────────────────────────────────────
document.getElementById('startGameBtn').addEventListener('click', () => {
    if (!isHost || !myRoomCode) return;
    socket.emit('startGame', myRoomCode);
});

// Everyone redirects when game starts
socket.on('gameStarting', (roomCode) => {
    localStorage.setItem('roomCode', roomCode);
    window.location.href = `game.html?roomCode=${roomCode}`;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showStatus(msg, type) {
    const el = document.getElementById('joinStatus');
    el.textContent = msg;
    el.style.color = type === 'error' ? '#ff4d4d' : '#4dff91';
}
