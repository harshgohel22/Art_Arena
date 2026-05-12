// ─── State ────────────────────────────────────────────────────────────────────
const socket = io();

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const drawWordEl = document.getElementById('draw-word');
const roundInfoEl = document.getElementById('round-info');
const miniCanvasesEl = document.getElementById('mini-canvases');
const scoreboardEl = document.getElementById('scoreboard');
const overlay = document.getElementById('round-overlay');
const overlayContent = document.getElementById('overlay-content');

let isDrawing = false;
let isErasing = false;
let lastX = 0, lastY = 0;
let timerInterval = null;
let timeLeft = 60;
let currentWord = '';
let roomCode = new URLSearchParams(window.location.search).get('roomCode');
let myId = null;
let model = null;
let scoreSubmitted = false;
let playerCanvases = {}; // { socketId: { canvas, ctx, lastX, lastY } }
let allPlayers = [];

// Throttle helper
let lastStrokeSent = 0;
const STROKE_THROTTLE = 33; // ~30fps

// ─── Init ─────────────────────────────────────────────────────────────────────
function setCanvasSize() {
    const area = document.querySelector('.drawing-area');
    canvas.width = area.clientWidth - 4;
    canvas.height = area.clientHeight - 4;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', () => { setCanvasSize(); });
setCanvasSize();

// Load TF.js model
async function loadModel() {
    try {
        model = await tf.loadLayersModel('/model/model.json');
        console.log('✅ AI model loaded');
    } catch (e) {
        console.error('❌ Model load failed:', e);
    }
}

// Join the game room via socket
function joinGame() {
    const playerName = localStorage.getItem('playerName') || 'Player';
    const selectedCharacter = localStorage.getItem('selectedCharacter') || '';
    socket.emit('joinGame', { roomCode, playerName, selectedCharacter });
}

// ─── Socket Events ────────────────────────────────────────────────────────────
socket.on('connect', () => {
    myId = socket.id;
    joinGame();
});

socket.on('joinedGame', ({ hostId }) => {
    console.log('Joined game room. Host:', hostId);
});

socket.on('updatePlayerList', (players) => {
    allPlayers = players;
    updateScoreboard(players);
    syncMiniCanvases(players);
});

// Server starts a round
socket.on('roundStart', ({ round, totalRounds, word, duration }) => {
    currentWord = word;
    scoreSubmitted = false;
    timeLeft = duration;

    drawWordEl.textContent = word;
    roundInfoEl.textContent = `Round ${round} / ${totalRounds}`;

    resetCanvas();
    clearMiniCanvases();
    hideOverlay();
    startTimer(duration);
    console.log(`🎯 Round ${round}: draw "${word}"`);
});

// Another player's stroke data
socket.on('remoteDrawingData', ({ playerId, strokeData }) => {
    const pc = playerCanvases[playerId];
    if (!pc) return;

    const scaleX = pc.canvas.width / canvas.width;
    const scaleY = pc.canvas.height / canvas.height;
    const { ctx: pCtx } = pc;

    if (strokeData.type === 'start') {
        pc.lastX = strokeData.x * scaleX;
        pc.lastY = strokeData.y * scaleY;
    } else if (strokeData.type === 'move') {
        pCtx.strokeStyle = strokeData.erasing ? 'white' : '#222';
        pCtx.lineWidth = strokeData.erasing ? 8 : 2;
        pCtx.lineCap = 'round';
        pCtx.beginPath();
        pCtx.moveTo(pc.lastX, pc.lastY);
        pCtx.lineTo(strokeData.x * scaleX, strokeData.y * scaleY);
        pCtx.stroke();
        pc.lastX = strokeData.x * scaleX;
        pc.lastY = strokeData.y * scaleY;
    } else if (strokeData.type === 'clear') {
        pCtx.fillStyle = 'white';
        pCtx.fillRect(0, 0, pc.canvas.width, pc.canvas.height);
    }
});

// Round ended — show results
socket.on('roundEnd', ({ round, totalRounds, word, results }) => {
    clearInterval(timerInterval);
    timerEl.textContent = '⏳ 0s';
    showRoundResults(round, totalRounds, word, results);
    updateScoreboard(results);
});

// Game over — redirect to leaderboard
socket.on('gameOver', ({ results }) => {
    localStorage.setItem('leaderboardData', JSON.stringify(results));
    setTimeout(() => {
        window.location.href = 'leaderboard.html';
    }, 1500);
});

// ─── Drawing ──────────────────────────────────────────────────────────────────
function startDrawing(e) {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
    emitStroke({ type: 'start', x: lastX, y: lastY });
}

function draw(e) {
    if (!isDrawing) return;

    const now = Date.now();
    ctx.strokeStyle = isErasing ? 'white' : '#222';
    ctx.lineWidth = isErasing ? 20 : 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();

    if (now - lastStrokeSent > STROKE_THROTTLE) {
        emitStroke({ type: 'move', x: e.offsetX, y: e.offsetY, erasing: isErasing });
        lastStrokeSent = now;
    }

    [lastX, lastY] = [e.offsetX, e.offsetY];
}

function stopDrawing() {
    if (isDrawing) emitStroke({ type: 'end' });
    isDrawing = false;
}

function emitStroke(strokeData) {
    socket.emit('drawingData', { roomCode, strokeData });
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Touch support
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    startDrawing({ offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top });
});
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    draw({ offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top });
});
canvas.addEventListener('touchend', stopDrawing);

// ─── Tools ────────────────────────────────────────────────────────────────────
document.querySelector('.pencilBtn').addEventListener('click', () => {
    isErasing = false;
    document.querySelector('.pencilBtn').classList.add('active');
    document.querySelector('.eraserBtn').classList.remove('active');
});

document.querySelector('.eraserBtn').addEventListener('click', () => {
    isErasing = true;
    document.querySelector('.eraserBtn').classList.add('active');
    document.querySelector('.pencilBtn').classList.remove('active');
});

document.querySelector('.eraseAllBtn').addEventListener('click', () => {
    resetCanvas();
    emitStroke({ type: 'clear' });
});

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer(duration) {
    clearInterval(timerInterval);
    timeLeft = duration;
    timerEl.textContent = `⏳ ${timeLeft}s`;

    timerInterval = setInterval(async () => {
        timeLeft--;
        timerEl.textContent = `⏳ ${timeLeft}s`;

        if (timeLeft <= 10) timerEl.classList.add('warning');
        else timerEl.classList.remove('warning');

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            await submitEvaluation();
        }
    }, 1000);
}

// ─── AI Evaluation ────────────────────────────────────────────────────────────
const LABELS = [
    'airplane', 'alarm clock', 'backpack', 'basketball', 'bicycle',
    'butterfly', 'cake', 'castle', 'elephant', 'flower',
    'guitar', 'laptop', 'pineapple', 'pizza', 'scissors',
    'snowflake', 'strawberry', 'tree', 'watermelon', 'wristwatch'
];

async function submitEvaluation() {
    if (scoreSubmitted) return;
    scoreSubmitted = true;

    drawWordEl.textContent = '⏳ Evaluating...';

    let score = 0;
    if (model) {
        try {
            const input = tf.tidy(() => {
                return tf.browser.fromPixels(canvas, 1)
                    .resizeNearestNeighbor([28, 28])
                    .toFloat()
                    .div(255.0)
                    .expandDims(0);
            });

            const prediction = model.predict(input);
            const probs = await prediction.data();
            const predictedIdx = probs.indexOf(Math.max(...probs));
            const confidence = probs[predictedIdx];
            const predictedWord = LABELS[predictedIdx];

            console.log(`🤖 Predicted: "${predictedWord}" (${(confidence * 100).toFixed(1)}%)`);
            console.log(`🎯 Target: "${currentWord}"`);

            if (predictedWord === currentWord) {
                score = Math.round(5 + confidence * 5); // 5–10 based on confidence
            } else {
                // Partial credit: top-3 match gives up to 3 pts
                const sortedProbs = [...probs].map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
                const targetIdx = LABELS.indexOf(currentWord);
                const targetRank = sortedProbs.findIndex(x => x.i === targetIdx);
                if (targetRank === 1) score = 3;
                else if (targetRank === 2) score = 1;
                else score = 0;
            }

            input.dispose();
            prediction.dispose();
        } catch (e) {
            console.error('Evaluation error:', e);
        }
    }

    console.log(`📊 Final score: ${score}`);
    socket.emit('submitScore', { roomCode, score });
}

// ─── Canvas Helpers ───────────────────────────────────────────────────────────
function resetCanvas() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── Mini Canvases (other players) ───────────────────────────────────────────
function syncMiniCanvases(players) {
    const myName = localStorage.getItem('playerName');
    players.forEach(p => {
        if (p.name === myName) return; // skip self
        if (!playerCanvases[p.id]) {
            createMiniCanvas(p);
        }
    });
    // Remove canvases for players who left
    Object.keys(playerCanvases).forEach(id => {
        if (!players.find(p => p.id === id)) {
            const el = document.getElementById(`mini-wrap-${id}`);
            if (el) el.remove();
            delete playerCanvases[id];
        }
    });
}

function createMiniCanvas(player) {
    const wrap = document.createElement('div');
    wrap.className = 'mini-canvas-wrap';
    wrap.id = `mini-wrap-${player.id}`;

    const c = document.createElement('canvas');
    c.width = 140;
    c.height = 120;
    const pCtx = c.getContext('2d');
    pCtx.fillStyle = 'white';
    pCtx.fillRect(0, 0, c.width, c.height);

    const label = document.createElement('p');
    label.textContent = player.name;

    wrap.appendChild(c);
    wrap.appendChild(label);
    miniCanvasesEl.appendChild(wrap);

    playerCanvases[player.id] = { canvas: c, ctx: pCtx, lastX: 0, lastY: 0 };
}

function clearMiniCanvases() {
    Object.values(playerCanvases).forEach(({ canvas: c, ctx: pCtx }) => {
        pCtx.fillStyle = 'white';
        pCtx.fillRect(0, 0, c.width, c.height);
    });
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────
function updateScoreboard(players) {
    const sorted = [...players].sort((a, b) => (b.totalScore || b.score || 0) - (a.totalScore || a.score || 0));
    scoreboardEl.innerHTML = sorted.map((p, i) =>
        `<li class="${i === 0 ? 'leader' : ''}">
            <span class="rank">${i + 1}</span>
            <span class="pname">${p.name}</span>
            <span class="pts">${p.totalScore ?? p.score ?? 0}pts</span>
        </li>`
    ).join('');
}

// ─── Round Result Overlay ────────────────────────────────────────────────────
function showRoundResults(round, totalRounds, word, results) {
    overlayContent.innerHTML = `
        <h2>Round ${round} Results</h2>
        <p class="word-reveal">The word was: <strong>${word}</strong></p>
        <ul class="results-list">
            ${results.map((p, i) => `
                <li class="${i === 0 ? 'winner' : ''}">
                    <span class="rank">${i + 1}.</span>
                    <span>${p.name}</span>
                    <span class="pts">+${p.roundScore}pts</span>
                    <span class="total">(${p.totalScore} total)</span>
                </li>
            `).join('')}
        </ul>
        ${round < totalRounds
            ? `<p class="next-round">Next round starting in <span id="countdown">6</span>s...</p>`
            : `<p class="next-round">🏆 Game over! Redirecting...</p>`
        }
    `;
    overlay.style.display = 'flex';

    // Live countdown
    if (round < totalRounds) {
        let c = 6;
        const countEl = document.getElementById('countdown');
        const iv = setInterval(() => {
            c--;
            if (countEl) countEl.textContent = c;
            if (c <= 0) clearInterval(iv);
        }, 1000);
    }
}

function hideOverlay() {
    overlay.style.display = 'none';
}

// ─── Startup ──────────────────────────────────────────────────────────────────
(async () => {
    await loadModel();
    if (!roomCode) {
        alert('No room code found. Redirecting...');
        window.location.href = 'index.html';
    }
})();
