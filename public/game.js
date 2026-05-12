const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const pencilBtn = document.querySelector(".pencilBtn");
const eraserBtn = document.querySelector(".eraserBtn");
const eraseAllBtn = document.querySelector(".eraseAllBtn");
const timerElement = document.getElementById("timer");
const drawWordElement = document.getElementById("draw-word");

let isDrawing = false;
let isErasing = false;
let lastX = 0, lastY = 0;
let timeLeft = 60; // 60 seconds
let timerStarted = false;
let timerInterval;
let currentRound = 1;
const totalRounds = 5;

let model; // TensorFlow.js model for AI

const words = ["airplane", "alarm clock", "backpack", "basketball", "bicycle", "butterfly", "cake", "castle", "elephant", "flower",
    "guitar", "laptop", "pineapple", "pizza", "scissors", "snowflake", "strawberry", "tree", "watermelon", "wristwatch"];


    
// Set canvas size dynamically
function setCanvasSize() {
    canvas.width = canvas.parentElement.clientWidth * 0.9;
    canvas.height = canvas.parentElement.clientHeight * 0.9;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

window.addEventListener("resize", setCanvasSize);
setCanvasSize();

// Load the TensorFlow.js model
async function loadModel() {
    try {
        model = await tf.loadLayersModel('/model/model.json');
        console.log('AI model loaded successfully');
    } catch (error) {
        console.error('Error loading the AI model:', error);
    }
}

// Preprocess the canvas drawing for AI input
function preprocessCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = tf.browser.fromPixels(imageData, 1) // Convert to grayscale
        .resizeNearestNeighbor([28, 28]) // Resize to 28x28 (model input size)
        .toFloat()
        .div(255.0) // Normalize pixel values to [0, 1]
        .expandDims(0); // Add batch dimension
    return data;
}

// Evaluate the drawing and calculate the score
async function evaluateDrawing(canvas, targetWord) {
    if (!model) {
        console.error('Model is not loaded yet!');
        return 0;
    }

    const input = preprocessCanvas(canvas);
    const prediction = model.predict(input);
    const predictedIndex = prediction.argMax(-1).dataSync()[0]; // Get the predicted class index
    const confidence = prediction.max().dataSync()[0]; // Get the confidence score (max probability)

    // List of words corresponding to the model's classes

    const predictedWord = words[predictedIndex];

    console.log(`AI Prediction: ${predictedWord} (Confidence: ${confidence})`);

    // Scoring logic
    if (predictedWord === targetWord) {
        const baseScore = 5;
        const additionalScore = Math.round(confidence * 5);
        return Math.min(baseScore + additionalScore, 10); // Max score is 10
    } else {
        return 0;
    }
}

// Start drawing function
function startDrawing(e) {
    if (!timerStarted) {
        startTimer(timeLeft, timerElement);
        timerStarted = true;
    }
    isDrawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
}

// Draw function
function draw(e) {
    if (!isDrawing) return;

    ctx.strokeStyle = isErasing ? "white" : "black";
    ctx.lineWidth = isErasing ? 20 : 3;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();

    [lastX, lastY] = [e.offsetX, e.offsetY];
}

// Stop drawing function
function stopDrawing() {
    isDrawing = false;
}

// Attach event listeners
canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseout", stopDrawing);

// Handle a single round of the game
async function handleRound(targetWord) {
    const score = await evaluateDrawing(canvas, targetWord);
    console.log(`Score for this round: ${score}`);
    alert(`Your score: ${score}`);

    // Proceed to the next round
    currentRound++;
    if (currentRound > totalRounds) {
        endGame();
    } else {
        startNextRound();
    }
}

// Start the next round
function startNextRound() {
    console.log(`Starting round ${currentRound}...`);
    resetCanvas();
    const targetWord = getRandomWord();
    drawWordElement.textContent = targetWord;
}

// End the game
function endGame() {
    console.log('Game over!');
    alert('Game over! Thanks for playing.');
}

// Utility functions
function resetCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Function to randomly select a word
function getRandomWord() {
    const randomIndex = Math.floor(Math.random() * words.length);
    return words[randomIndex];
}

// Initialize the game
document.addEventListener('DOMContentLoaded', async () => {
    await loadModel(); // Load the AI model when the page loads
    startNextRound(); // Start the first round
});

function startTimer(duration, display) {
    let timer = duration;
    timerInterval = setInterval(() => {
        let seconds = timer % 60;
        display.textContent = seconds < 10 ? `0:${seconds}` : `0:${seconds}`;
        if (--timer < 0) {
            clearInterval(timerInterval);
            handleRound(drawWordElement.textContent); // Call handleRound on time up
        }
    }, 1000);
}
