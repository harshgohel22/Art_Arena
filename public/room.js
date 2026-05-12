const socket = io();

let createdRoomCode = null; // Store the created room code for the creator

// Handle "Create Room" button click
document.getElementById('createRoomBtn').addEventListener('click', () => {
    socket.emit('createRoom'); // Emit the createRoom event to the server
});

// Listen for the roomCreated event from the server
socket.on('roomCreated', (roomCode) => {
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    const roomCodeSpan = document.getElementById('roomCode');
    const joinRoomBtn = document.getElementById('joinRoomBtn');

    createdRoomCode = roomCode; // Store the created room code
    roomCodeSpan.textContent = roomCode; // Display the room code
    roomCodeDisplay.style.display = 'block'; // Show the room code display

    // Change the Join Room button to "Join Game" for the creator
    joinRoomBtn.textContent = 'Join Game';
    joinRoomBtn.onclick = () => {
        // Directly join the created room without validation
        socket.emit('joinRoom', { roomCode: createdRoomCode, playerName: 'Creator', selectedCharacter: null });
        window.location.href = `/game.html?roomCode=${createdRoomCode}`;
    };

    alert(`Room Created: ${roomCode}`); // Alert the user with the room code
});

// Handle "Join Room" button click for other players
document.getElementById('joinRoomBtn').addEventListener('click', () => {
    const enteredCode = document.getElementById('roomCodeInput').value.trim(); // Get the entered room code

    if (!enteredCode) {
        alert('Please enter a room code.'); // Alert if no room code is entered
        return;
    }

    // Validate the room code with the server
    fetch(`/validate-room/${enteredCode}`)
        .then(response => response.json())
        .then(data => {
            if (data.valid) {
                // Redirect to game.html with the room code as a query parameter
                socket.emit('joinRoom', { roomCode: enteredCode, playerName: 'Player', selectedCharacter: null });
                window.location.href = `/game.html?roomCode=${enteredCode}`;
            } else {
                // Show an error popup for invalid room code
                alert('Invalid room code. Please try again.');
            }
        })
        .catch(err => {
            console.error('Error validating room code:', err);
            alert('An error occurred. Please try again.');
        });
});

// Listen for the roomJoined event from the server
socket.on('roomJoined', (roomCode) => {
    document.getElementById('joinStatus').textContent = `Successfully joined room: ${roomCode}`;
    document.getElementById('joinStatus').style.color = 'green'; // Display success message
});

// Listen for roomError event from the server
socket.on('roomError', (message) => {
    document.getElementById('joinStatus').textContent = message;
    document.getElementById('joinStatus').style.color = 'red'; // Display error message
});

// Listen for playerJoined event
socket.on('playerJoined', (playerCount) => {
    console.log(`Player joined. Total players: ${playerCount}`);
});

// Listen for playerLeft event
socket.on('playerLeft', (playerCount) => {
    console.log(`Player left. Total players: ${playerCount}`);
});


