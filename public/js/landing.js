const characters = [
    "images/character1.png", "images/character2.png", "images/character3.png",
    "images/character4.png", "images/character5.png", "images/character6.png",
    "images/character7.png", "images/character8.png", "images/character9.png",
    "images/character10.png"
];

let currentIndex = 0;
const characterImage = document.getElementById('characterImage');
const playButton = document.getElementById('playButton');
const roomButton = document.getElementById('roomButton');
const playerNameInput = document.getElementById('playerName');

// Character navigation
document.getElementById('prevCharacter').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + characters.length) % characters.length;
    characterImage.src = characters[currentIndex];
    checkEnableButtons();
});

document.getElementById('nextCharacter').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % characters.length;
    characterImage.src = characters[currentIndex];
    checkEnableButtons();
});

playerNameInput.addEventListener('input', checkEnableButtons);

function checkEnableButtons() {
    const ready = playerNameInput.value.trim() !== '';
    playButton.disabled = !ready;
    roomButton.disabled = !ready;
}

// Solo play
playButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) { alert('Please enter your name.'); return; }
    savePlayer(name);

    fetch('/create-room')
        .then(r => r.json())
        .then(data => {
            window.location.href = `game.html?roomCode=${data.roomCode}`;
        });
});

// Multiplayer room
roomButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) { alert('Please enter your name.'); return; }
    savePlayer(name);
    window.location.href = 'room.html';
});

function savePlayer(name) {
    localStorage.setItem('playerName', name);
    localStorage.setItem('selectedCharacter', characters[currentIndex]);
}
