// Retrieve leaderboard data from localStorage
const leaderboardData = JSON.parse(localStorage.getItem("leaderboardData"));

if (leaderboardData && leaderboardData.length > 0) {
    const leaderboardList = document.querySelector(".left-panel ul");
    leaderboardList.innerHTML = ""; // Clear the current list

    leaderboardData.forEach((player, index) => {
        const listItem = document.createElement("li");
        listItem.innerHTML = `
            <img src="${player.avatar}" class="avatar"> 
            <span>${index + 1}. ${player.name}</span>`;
        leaderboardList.appendChild(listItem);
    });

    // Display the winner
    const winnerName = leaderboardData[0]?.name || "No Winner";
    document.querySelector(".winner-text").textContent = `🏆 ${winnerName} is the Winner! 🏆`;
} else {
    alert("No leaderboard data found!");
    window.location.href = "game.html";
}