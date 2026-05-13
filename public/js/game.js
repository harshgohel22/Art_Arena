// ─── State ────────────────────────────────────────────────────────────────────
const socket = io();

const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');
const timerEl       = document.getElementById('timer');
const drawWordEl    = document.getElementById('draw-word');
const roundInfoEl   = document.getElementById('round-info');
const miniCanvasesEl = document.getElementById('mini-canvases');
const scoreboardEl  = document.getElementById('scoreboard');
const overlay       = document.getElementById('round-overlay');
const overlayContent = document.getElementById('overlay-content');

let isDrawing   = false;
let isErasing   = false;
let lastX = 0, lastY = 0;
let timerInterval   = null;
let timeLeft        = 60;
let currentWord     = '';
let roomCode        = new URLSearchParams(window.location.search).get('roomCode');
let myId            = null;
let model           = null;
let scoreSubmitted  = false;
let playerCanvases  = {};
let allPlayers      = [];

let lastStrokeSent  = 0;
const STROKE_THROTTLE = 33;

// ─── Canvas ───────────────────────────────────────────────────────────────────
function setCanvasSize() {
    const area = document.querySelector('.drawing-area');
    const imageData = (canvas.width > 0 && canvas.height > 0)
        ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width  = area.clientWidth  - 4;
    canvas.height = area.clientHeight - 4;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (imageData) { try { ctx.putImageData(imageData, 0, 0); } catch(_) {} }
}
window.addEventListener('resize', setCanvasSize);
setCanvasSize();

// ─── Loading overlay ──────────────────────────────────────────────────────────
function showLoadingOverlay(msg) {
    let el = document.getElementById('loading-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loading-overlay';
        el.style.cssText = `
            position:fixed;inset:0;z-index:9999;
            background:rgba(11,23,54,0.93);
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:16px;
            color:white;font-family:Arial,sans-serif;
        `;
        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width:48px;height:48px;border-radius:50%;
            border:5px solid rgba(255,255,255,0.2);
            border-top-color:#fff;
            animation:_spin 0.8s linear infinite;
        `;
        if (!document.getElementById('_spin_style')) {
            const s = document.createElement('style');
            s.id = '_spin_style';
            s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(s);
        }
        el.appendChild(spinner);
        const txt = document.createElement('p');
        txt.id = 'loading-overlay-msg';
        txt.style.cssText = 'margin:0;font-size:17px;font-weight:600;';
        el.appendChild(txt);
        document.body.appendChild(el);
        canvas.style.pointerEvents = 'none';
        canvas.style.opacity = '0.4';
    }
    document.getElementById('loading-overlay-msg').textContent = msg;
}

function hideLoadingOverlay() {
    const el = document.getElementById('loading-overlay');
    if (el) el.remove();
    canvas.style.pointerEvents = '';
    canvas.style.opacity = '';
}

// ─── Load TF.js model ─────────────────────────────────────────────────────────
async function loadModel() {
    showLoadingOverlay('🤖 Loading AI model…');
    try {
        model = await tf.loadLayersModel('/model/model.json');
        // warm-up
        const dummy = tf.zeros([1, 28, 28, 1]);
        model.predict(dummy).dispose();
        dummy.dispose();
        console.log('✅ AI model loaded');
        showLoadingOverlay('✅ AI ready! Joining game…');
        await new Promise(r => setTimeout(r, 600));
    } catch (e) {
        console.error('❌ Model load failed:', e);
        showLoadingOverlay('⚠️ AI unavailable — joining game anyway…');
        await new Promise(r => setTimeout(r, 1200));
    }
}

// ─── Socket connection + join ─────────────────────────────────────────────────
// We DON'T call joinGame on 'connect' — we call it manually after the model
// loads, so the server's 1.5 s auto-start delay lands AFTER the client is ready.
socket.on('connect', () => {
    myId = socket.id;
    console.log('Socket connected:', myId);
    // joinGame is called from the startup block below, after loadModel()
});

function joinGame() {
    const playerName        = localStorage.getItem('playerName') || 'Player';
    const selectedCharacter = localStorage.getItem('selectedCharacter') || '';
    console.log('Emitting joinGame — room:', roomCode, 'player:', playerName);
    socket.emit('joinGame', { roomCode, playerName, selectedCharacter });
}

socket.on('joinedGame', ({ hostId }) => {
    console.log('joinedGame ack. hostId:', hostId);
    hideLoadingOverlay();
});

socket.on('updatePlayerList', (players) => {
    allPlayers = players;
    updateScoreboard(players);
    syncMiniCanvases(players);
});

socket.on('roundStart', ({ round, totalRounds, word, duration }) => {
    currentWord    = word;
    scoreSubmitted = false;
    timeLeft       = duration;

    drawWordEl.textContent  = word;
    roundInfoEl.textContent = `Round ${round} / ${totalRounds}`;

    resetCanvas();
    clearMiniCanvases();
    hideOverlay();
    startTimer(duration);
    console.log(`🎯 Round ${round}: draw "${word}"`);
});

socket.on('remoteDrawingData', ({ playerId, strokeData }) => {
    const pc = playerCanvases[playerId];
    if (!pc) return;
    const scaleX = pc.canvas.width  / canvas.width;
    const scaleY = pc.canvas.height / canvas.height;
    const { ctx: pCtx } = pc;
    if (strokeData.type === 'start') {
        pc.lastX = strokeData.x * scaleX;
        pc.lastY = strokeData.y * scaleY;
    } else if (strokeData.type === 'move') {
        pCtx.strokeStyle = strokeData.erasing ? 'white' : '#222';
        pCtx.lineWidth   = strokeData.erasing ? 8 : 2;
        pCtx.lineCap     = 'round';
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

socket.on('roundEnd', ({ round, totalRounds, word, results }) => {
    clearInterval(timerInterval);
    timerEl.textContent = '⏳ 0s';
    timerEl.classList.remove('warning');
    showRoundResults(round, totalRounds, word, results);
    updateScoreboard(results);
});

socket.on('gameOver', ({ results }) => {
    const clean = (results || []).map(p => ({
        name:       p.name      || 'Unknown',
        totalScore: p.totalScore ?? p.score ?? 0,
        character:  p.character || 'images/character1.png',
    }));
    localStorage.setItem('leaderboardData', JSON.stringify(clean));
    setTimeout(() => { window.location.href = 'leaderboard.html'; }, 1500);
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
    ctx.lineWidth   = isErasing ? 20 : 3;
    ctx.lineCap     = 'round';
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
canvas.addEventListener('mouseup',   stopDrawing);
canvas.addEventListener('mouseout',  stopDrawing);

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0], rect = canvas.getBoundingClientRect();
    startDrawing({ offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top });
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0], rect = canvas.getBoundingClientRect();
    draw({ offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top });
}, { passive: false });
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
    'airplane','alarm clock','backpack','basketball','bicycle',
    'butterfly','cake','castle','elephant','flower',
    'guitar','laptop','pineapple','pizza','scissors',
    'snowflake','strawberry','tree','watermelon','wristwatch'
];

async function submitEvaluation() {
    if (scoreSubmitted) return;
    scoreSubmitted = true;
    drawWordEl.textContent = '⏳ Evaluating…';

    let score = 0;
    if (model) {
        try {
            const input = tf.tidy(() =>
                tf.browser.fromPixels(canvas, 1)
                    .resizeNearestNeighbor([28, 28])
                    .toFloat().div(255.0).expandDims(0)
            );
            const prediction  = model.predict(input);
            const probs       = await prediction.data();
            const predictedIdx = probs.indexOf(Math.max(...probs));
            const confidence   = probs[predictedIdx];
            const predictedWord = LABELS[predictedIdx];

            console.log(`🤖 Predicted: "${predictedWord}" (${(confidence*100).toFixed(1)}%)`);
            console.log(`🎯 Target: "${currentWord}"`);

            if (predictedWord === currentWord) {
                score = Math.round(5 + confidence * 5);
            } else {
                const sorted = [...probs].map((p,i)=>({p,i})).sort((a,b)=>b.p-a.p);
                const rank = sorted.findIndex(x => x.i === LABELS.indexOf(currentWord));
                score = rank === 1 ? 3 : rank === 2 ? 1 : 0;
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

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function resetCanvas() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── Mini canvases ────────────────────────────────────────────────────────────
function syncMiniCanvases(players) {
    const myName = localStorage.getItem('playerName');
    players.forEach(p => {
        if (p.name === myName) return;
        if (!playerCanvases[p.id]) createMiniCanvas(p);
    });
    Object.keys(playerCanvases).forEach(id => {
        if (!players.find(p => p.id === id)) {
            document.getElementById(`mini-wrap-${id}`)?.remove();
            delete playerCanvases[id];
        }
    });
}

function createMiniCanvas(player) {
    const wrap = document.createElement('div');
    wrap.className = 'mini-canvas-wrap';
    wrap.id = `mini-wrap-${player.id}`;
    const c = document.createElement('canvas');
    c.width = 140; c.height = 120;
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
    const sorted = [...players].sort((a,b) =>
        (b.totalScore ?? b.score ?? 0) - (a.totalScore ?? a.score ?? 0)
    );
    scoreboardEl.innerHTML = sorted.map((p, i) => `
        <li class="${i === 0 ? 'leader' : ''}">
            <span class="rank">${i + 1}</span>
            <span class="pname">${p.name}</span>
            <span class="pts">${p.totalScore ?? p.score ?? 0}pts</span>
        </li>`
    ).join('');
}

// ─── Round overlay ────────────────────────────────────────────────────────────
function showRoundResults(round, totalRounds, word, results) {
    overlayContent.innerHTML = `
        <h2>Round ${round} Results</h2>
        <p class="word-reveal">The word was: <strong>${word}</strong></p>
        <ul class="results-list">
            ${results.map((p, i) => `
                <li class="${i === 0 ? 'winner' : ''}">
                    <span class="rank">${i + 1}.</span>
                    <span>${p.name}</span>
                    <span class="pts">+${p.roundScore ?? 0}pts</span>
                    <span class="total">(${p.totalScore ?? 0} total)</span>
                </li>`).join('')}
        </ul>
        ${round < totalRounds
            ? `<p class="next-round">Next round starting in <span id="countdown">6</span>s…</p>`
            : `<p class="next-round">🏆 Game over! Redirecting…</p>`}
    `;
    overlay.style.display = 'flex';
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

function hideOverlay() { overlay.style.display = 'none'; }

// ─── Solo room created by server ──────────────────────────────────────────────
socket.on('soloRoomCreated', (code) => {
    roomCode = code;
    history.replaceState(null, '', `game.html?roomCode=${code}`);
    joinGame();
});

socket.on('roomError', (msg) => {
    console.error('Room error:', msg);
    hideLoadingOverlay();
    alert('Room error: ' + msg + '\nRedirecting to home.');
    window.location.href = 'index.html';
});

// ─── Startup ──────────────────────────────────────────────────────────────────
// Load model first, then either create a solo room via socket
// or join an existing multiplayer room — all in the same server process.
(async () => {
    await loadModel();

    const isSolo = new URLSearchParams(window.location.search).get('solo');

    if (isSolo) {
        // Solo: server creates room in same memory, emits soloRoomCreated back
        if (socket.connected) {
            socket.emit('createSoloRoom');
        } else {
            socket.once('connect', () => socket.emit('createSoloRoom'));
        }
    } else if (roomCode) {
        // Multiplayer: join existing room
        if (socket.connected) {
            joinGame();
        } else {
            socket.once('connect', () => joinGame());
        }
    } else {
        alert('No room code found. Redirecting…');
        window.location.href = 'index.html';
    }
})();