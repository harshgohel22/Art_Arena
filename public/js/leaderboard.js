const data = JSON.parse(localStorage.getItem('leaderboardData'));

if (!data || data.length === 0) {
    document.querySelector('.winner-text').textContent = '🏆 No results found!';
} else {
    const winner = data[0];
    document.querySelector('.winner-text').textContent = `🏆 ${winner.name} wins with ${winner.totalScore} pts!`;

    const list = document.querySelector('.leaderboard-list');
    list.innerHTML = data.map((p, i) => `
        <li class="lb-item ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">
            <span class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
            <img src="${p.character || 'images/character1.png'}" class="lb-avatar" alt="${p.name}">
            <span class="lb-name">${p.name}</span>
            <span class="lb-score">${p.totalScore} pts</span>
        </li>
    `).join('');
}
