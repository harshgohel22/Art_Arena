# Art-Arena 
**Multiplayer AI-Powered Drawing Game**

Art-Arena is a real-time multiplayer drawing and recognition game . Players compete to draw a specific word within a time limit, and a custom-trained AI model judges the accuracy of their artwork to determine the winner.

---

## Features
- **Real-time Multiplayer:** Create or join rooms to compete with friends using WebSockets.
- **Solo Play Mode:** Practice your skills against the AI in a dedicated solo environment.
- **AI Scoring System:** A Convolutional Neural Network (CNN) trained on the Google Quick, Draw! dataset evaluates your drawings.
- **Character Selection:** Personalize your profile with various character avatars before joining a game.
- **Live Leaderboard:** Track cumulative scores and round results in real-time.

---

## Tech Stack
- **Backend:** Node.js with Express.
- **Real-time Communication:** Socket.io.
- **Frontend:** HTML5, CSS3, and Vanilla JavaScript.
- **Machine Learning:** - **Training:** TensorFlow/Keras & NumPy.
  - **In-browser Inference:** TensorFlow.js.

---

## Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- [Python 3.x](https://www.python.org/) (only if you wish to retrain the AI model)

