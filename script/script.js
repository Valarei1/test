// Socket.io connection
let socket;

// Game state variables
let gameState = {
    playerName: '',
    players: [],
    gameId: null,
    playerRole: null,
    currentPresident: null,
    currentChancellor: null,
    previousPresident: null,
    previousChancellor: null,
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionTracker: 0,
    drawPile: [],
    discardPile: [],
    currentPolicies: [],
    gameStarted: false,
    isConnected: false,
    playerIndex: -1,
    isRoomOwner: false,
    phase: 'name-selection', // name-selection, lobby, election, legislative, executive, gameover
    votes: {},
    votesNeeded: 0,
    executiveAction: null
};

// DOM Elements
const nameSelectionScreen = document.getElementById('name-selection-screen');
const playerNameInput = document.getElementById('player-name-input');
const confirmNameBtn = document.getElementById('confirm-name-btn');
const loginScreen = document.getElementById('login-screen');
const playerNameDisplay = document.getElementById('player-name-display');
const gameBoard = document.getElementById('game-board');
const gameCodeInput = document.getElementById('game-code');
const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const changeNameBtn = document.getElementById('change-name-btn');
const gameCodeDisplay = document.getElementById('game-code-display');
const playersList = document.getElementById('players');
const playerRole = document.getElementById('player-role');
const electionPopup = document.getElementById('election-popup');
const presidentName = document.getElementById('president-name');
const chancellorName = document.getElementById('chancellor-name');
const jaBtn = document.querySelector('.ja-btn');
const neinBtn = document.querySelector('.nein-btn');
const policySelection = document.getElementById('policy-selection');
const executiveAction = document.getElementById('executive-action');
const gameOver = document.getElementById('game-over');
const winnerText = document.getElementById('winner-text');
const newGameBtn = document.getElementById('new-game-btn');
const startGameBtn = document.getElementById('start-game-btn');

// Initialize the game
function initGame() {
    // Event listeners for name selection
    confirmNameBtn.addEventListener('click', confirmPlayerName);
    playerNameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            confirmPlayerName();
        }
    });
    
    // Event listeners for login screen
    createGameBtn.addEventListener('click', createGame);
    joinGameBtn.addEventListener('click', joinGame);
    changeNameBtn.addEventListener('click', changeName);
    
    // Event listeners for game
    jaBtn.addEventListener('click', () => vote(true));
    neinBtn.addEventListener('click', () => vote(false));
    newGameBtn.addEventListener('click', resetGame);
    startGameBtn.addEventListener('click', startGame);
    
    // For frontend development, show mock election
    document.addEventListener('keydown', function(e) {
        if (e.key === 'e') {
            showMockElection();
        } else if (e.key === 'p') {
            showMockPolicySelection();
        } else if (e.key === 'g') {
            showMockGameOver('liberal');
        } else if (e.key === 'n') {
            showNotification('This is a test notification', 'info');
        }
    });
    
    // Initialize policy cards
    initializeCards();
    
    // Create notification container
    createNotificationContainer();
}

// Create notification container
function createNotificationContainer() {
    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .notification-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            width: 300px;
        }
        
        .notification {
            background-color: #fff;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            margin-bottom: 15px;
            padding: 15px;
            animation: slideIn 0.3s ease-out;
            border-left: 5px solid #4d79ff;
        }
        
        .notification.error {
            border-left-color: #e53935;
        }
        
        .notification.success {
            border-left-color: #4CAF50;
        }
        
        .notification.warning {
            border-left-color: #ff8f00;
        }
        
        .notification-content {
            margin-bottom: 10px;
            font-family: 'Poppins', sans-serif;
        }
        
        .notification-btn {
            font-family: 'Poppins', sans-serif;
            background-color: #e53935;
            color: #fff;
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 0.9rem;
            border-radius: 50px;
            transition: all 0.3s;
            font-weight: bold;
            display: block;
            margin: 0 auto;
        }
        
        .notification-btn:hover {
            background-color: #ff8f00;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// Show notification
function showNotification(message, type = 'info') {
    const notificationContainer = document.getElementById('notification-container');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const content = document.createElement('div');
    content.className = 'notification-content';
    content.textContent = message;
    
    const button = document.createElement('button');
    button.className = 'notification-btn';
    button.textContent = 'OK';
    button.onclick = function() {
        notification.remove();
    };
    
    notification.appendChild(content);
    notification.appendChild(button);
    notificationContainer.appendChild(notification);
}

// Confirm player name
function confirmPlayerName() {
    const name = playerNameInput.value.trim();
    if (!name) {
        showNotification('Please enter your name', 'error');
        return;
    }
    
    // Save player name
    gameState.playerName = name;
    playerNameDisplay.textContent = name;
    
    // Show login screen
    nameSelectionScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    
    // Connect to server
    connectToServer();
}

// Change player name
function changeName() {
    // Reset to name selection screen
    loginScreen.classList.add('hidden');
    nameSelectionScreen.classList.remove('hidden');
    
    // Disconnect from server
    if (socket) {
        socket.disconnect();
    }
}

// Connect to server
function connectToServer() {
    // Connect to the same domain that's serving the page
    socket = io(window.location.origin);
    
    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        gameState.isConnected = true;
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        gameState.isConnected = false;
        showNotification('Disconnected from server', 'error');
    });
    
    socket.on('error', (data) => {
        showNotification(data.message, 'error');
    });
    
    socket.on('gameCreated', (data) => {
        gameState.gameId = data.gameId;
        gameState.players = data.players;
        gameState.playerIndex = data.playerIndex;
        gameState.isRoomOwner = true;
        
        // Update UI
        gameCodeDisplay.textContent = gameState.gameId;
        updatePlayersList();
        
        // Show game board
        loginScreen.classList.add('hidden');
        gameBoard.classList.remove('hidden');
        
        // Show start game button for room owner
        startGameBtn.classList.remove('hidden');
        updateStartGameButton();
        
        showNotification('Game created successfully! Share the code with friends to join.', 'success');
    });
    
    socket.on('gameJoined', (data) => {
        gameState.gameId = data.gameId;
        gameState.players = data.players;
        gameState.playerIndex = data.playerIndex;
        gameState.isRoomOwner = false;
        
        // Update UI
        gameCodeDisplay.textContent = gameState.gameId;
        updatePlayersList();
        
        // Show game board
        loginScreen.classList.add('hidden');
        gameBoard.classList.remove('hidden');
        
        // Hide start game button for non-owners
        startGameBtn.classList.add('hidden');
        
        showNotification('Joined game successfully!', 'success');
    });
    
    socket.on('playerJoined', (data) => {
        gameState.players = data.players;
        updatePlayersList();
        updateStartGameButton();
        
        showNotification(`${data.playerName} joined the game`, 'info');
    });
    
    socket.on('canStartGame', () => {
        showNotification('Enough players have joined! You can start the game.', 'success');
        updateStartGameButton();
    });
    
    socket.on('gameStarted', (data) => {
        gameState.gameStarted = true;
        gameState.players = data.players;
        gameState.currentPresident = data.currentPresident;
        
        // Update UI
        updatePlayersList();
        updateGameBoard();
        
        showNotification('Game started! Roles have been assigned.', 'success');
    });
    
    socket.on('roleAssigned', (data) => {
        gameState.playerRole = data.role;
        
        // Update role card
        playerRole.className = 'role-card';
        playerRole.classList.add(`${data.role}-role`);
        
        // If player can see other players' roles
        if (data.visiblePlayers && data.visiblePlayers.length > 0) {
            let message = 'You can see: ';
            data.visiblePlayers.forEach(player => {
                message += `\n${gameState.players[player.index].name} is ${player.role}`;
            });
            showNotification(message, 'info');
        }
    });
    
    socket.on('electionStarted', (data) => {
        // Update election popup
        presidentName.textContent = gameState.players[data.president].name;
        chancellorName.textContent = gameState.players[data.chancellor].name;
        
        // Show election popup
        electionPopup.classList.remove('hidden');
        
        showNotification('Election started! Vote for the government.', 'info');
    });
    
    socket.on('playerVoted', (data) => {
        // Update UI to show player voted
        const playerItem = playersList.children[data.playerIndex];
        if (playerItem) {
            playerItem.style.opacity = '0.5';
        }
        
        showNotification(`${gameState.players[data.playerIndex].name} has voted`, 'info');
    });
    
    socket.on('voteResults', (data) => {
        // Hide election popup
        electionPopup.classList.add('hidden');
        
        // Count votes
        let jaVotes = 0;
        let neinVotes = 0;
        
        for (const playerIndex in data.votes) {
            if (data.votes[playerIndex]) {
                jaVotes++;
            } else {
                neinVotes++;
            }
        }
        
        // Show results
        let message = `Voting Results:\nJa: ${jaVotes}\nNein: ${neinVotes}\n\n`;
        message += data.passed ? 'Government established!' : 'Government rejected!';
        
        showNotification(message, data.passed ? 'success' : 'warning');
        
        // Reset player opacity
        for (let i = 0; i < playersList.children.length; i++) {
            playersList.children[i].style.opacity = '1';
        }
    });
    
    socket.on('selectPolicies', (data) => {
        showPolicySelection(data.policies, data.role);
        
        if (data.role === 'president') {
            showNotification('You are President. Select a policy to discard.', 'info');
        } else if (data.role === 'chancellor') {
            showNotification('You are Chancellor. Select a policy to enact.', 'info');
        }
    });
    
    socket.on('policyDiscarded', () => {
        showNotification('You have discarded a policy. Waiting for Chancellor to select a policy.', 'info');
    });
    
    socket.on('legislativeStarted', (data) => {
        showNotification(`Legislative session started. President: ${gameState.players[data.president].name}, Chancellor: ${gameState.players[data.chancellor].name}`, 'info');
    });
    
    socket.on('policyEnacted', (data) => {
        if (data.policy === 'liberal') {
            gameState.liberalPolicies = data.count;
            showNotification('A Liberal policy was enacted!', 'success');
        } else {
            gameState.fascistPolicies = data.count;
            showNotification('A Fascist policy was enacted!', 'warning');
        }
        
        // Update game board
        updateGameBoard();
    });
    
    socket.on('chaosPolicyEnacted', () => {
        showNotification('Election tracker reached 3! Top policy enacted due to government chaos.', 'warning');
    });
    
    socket.on('executiveAction', (data) => {
        showExecutiveAction(data.action);
        
        showNotification(`You must perform executive action: ${getActionName(data.action)}`, 'info');
    });
    
    socket.on('executiveActionStarted', (data) => {
        showNotification(`President is performing executive action: ${getActionName(data.action)}`, 'info');
    });
    
    socket.on('investigationResult', (data) => {
        showNotification(`Investigation result: ${gameState.players[data.playerIndex].name} is a ${data.party} party member.`, 'info');
    });
    
    socket.on('playerInvestigated', (data) => {
        if (gameState.playerIndex !== data.investigator) {
            showNotification(`${gameState.players[data.investigator].name} investigated ${gameState.players[data.target].name}.`, 'info');
        }
    });
    
    socket.on('peekResult', (data) => {
        let message = 'Top 3 policies:';
        data.policies.forEach(policy => {
            message += `\n- ${policy.charAt(0).toUpperCase() + policy.slice(1)}`;
        });
        showNotification(message, 'info');
    });
    
    socket.on('presidentPeeked', () => {
        showNotification('President peeked at the top 3 policies.', 'info');
    });
    
    socket.on('specialElection', (data) => {
        showNotification(`Special election! ${gameState.players[data.newPresident].name} is the new President.`, 'info');
    });
    
    socket.on('playerExecuted', (data) => {
        showNotification(`${gameState.players[data.playerIndex].name} has been executed!`, 'warning');
    });
    
    socket.on('newPresident', (data) => {
        showNotification(`${gameState.players[data.president].name} is the new President.`, 'info');
    });
    
    socket.on('playerDisconnected', (data) => {
        showNotification(`${gameState.players[data.playerIndex].name} has disconnected.`, 'warning');
        
        // Mark player as disconnected
        gameState.players[data.playerIndex].disconnected = true;
        updatePlayersList();
        updateStartGameButton();
    });
    
    socket.on('playerKicked', (data) => {
        showNotification(`${data.playerName} has been kicked from the game.`, 'warning');
    });
    
    socket.on('playerBanned', (data) => {
        showNotification(`${data.playerName} has been banned from the game.`, 'warning');
    });
    
    socket.on('youWereKicked', () => {
        showNotification('You were kicked from the game.', 'error');
        resetGame();
    });
    
    socket.on('youWereBanned', () => {
        showNotification('You were banned from the game.', 'error');
        resetGame();
    });
    
    socket.on('gameOver', (data) => {
        // Update winner text
        if (data.winner === 'liberal') {
            winnerText.textContent = 'Liberals Win! ' + data.reason;
            winnerText.style.color = '#4d79ff';
        } else if (data.winner === 'fascist') {
            winnerText.textContent = 'Fascists Win! ' + data.reason;
            winnerText.style.color = '#ff4d4d';
        } else {
            winnerText.textContent = 'Game Over! ' + data.reason;
            winnerText.style.color = '#fff';
        }
        
        // Show roles
        let rolesMessage = 'Player Roles:';
        data.roles.forEach(player => {
            rolesMessage += `\n${player.name}: ${player.role.charAt(0).toUpperCase() + player.role.slice(1)}`;
        });
        
        setTimeout(() => {
            showNotification(rolesMessage, 'info');
        }, 1000);
        
        // Show game over
        gameOver.classList.remove('hidden');
    });
}

// Create a new game
function createGame() {
    if (!gameState.isConnected) {
        showNotification('Not connected to server', 'error');
        return;
    }
    
    socket.emit('createGame', gameState.playerName);
}

// Join an existing game
function joinGame() {
    if (!gameState.isConnected) {
        showNotification('Not connected to server', 'error');
        return;
    }
    
    const gameCode = gameCodeInput.value.trim();
    
    if (!gameCode) {
        showNotification('Please enter a game code', 'error');
        return;
    }
    
    socket.emit('joinGame', {
        gameId: gameCode,
        playerName: gameState.playerName
    });
}

// Start the game
function startGame() {
    if (!gameState.isConnected) {
        showNotification('Not connected to server', 'error');
        return;
    }
    
    if (!gameState.isRoomOwner) {
        showNotification('Only the room owner can start the game', 'error');
        return;
    }
    
    if (gameState.players.length < 5) {
        showNotification('Not enough players. At least 5 players are needed to start.', 'warning');
        return;
    }
    
    socket.emit('startGame');
}

// Update start game button
function updateStartGameButton() {
    if (!gameState.isRoomOwner) {
        startGameBtn.classList.add('hidden');
        return;
    }
    
    startGameBtn.classList.remove('hidden');
    
    if (gameState.players.length >= 5) {
        startGameBtn.classList.add('ready');
        startGameBtn.classList.remove('not-ready');
    } else {
        startGameBtn.classList.add('not-ready');
        startGameBtn.classList.remove('ready');
    }
}

// Vote in an election
function vote(isJa) {
    if (!gameState.isConnected) {
        showNotification('Not connected to server', 'error');
        return;
    }
    
    socket.emit('vote', isJa);
    
    // Hide election popup
    electionPopup.classList.add('hidden');
}

// Select a policy
function selectPolicy(index, role) {
    if (!gameState.isConnected) {
        showNotification('Not connected to server', 'error');
        return;
    }
    
    socket.emit('selectPolicy', index);
    
    // Hide policy selection
    policySelection.classList.add('hidden');
}

// Perform executive action
function performExecutiveAction(action, targetIndex) {
    if (!gameState.isConnected) {
        showNotification('Not connected to server', 'error');
        return;
    }
    
    socket.emit('executiveAction', {
        action: action,
        targetIndex: targetIndex
    });
    
    // Hide executive action
    executiveAction.classList.add('hidden');
}

// Kick a player
function kickPlayer(playerIndex) {
    if (!gameState.isConnected || !gameState.isRoomOwner) {
        showNotification('Only the room owner can kick players', 'error');
        return;
    }
    
    socket.emit('kickPlayer', playerIndex);
}

// Ban a player
function banPlayer(playerIndex) {
    if (!gameState.isConnected || !gameState.isRoomOwner) {
        showNotification('Only the room owner can ban players', 'error');
        return;
    }
    
    socket.emit('banPlayer', playerIndex);
}

// Show executive action
function showExecutiveAction(action) {
    const actionDescription = document.getElementById('action-description');
    const actionOptions = document.getElementById('action-options');
    
    // Clear previous options
    actionOptions.innerHTML = '';
    
    // Set description based on action
    switch (action) {
        case 'investigate':
            actionDescription.textContent = 'Investigate a player\'s loyalty';
            
            // Create buttons for each player
            for (let i = 0; i < gameState.players.length; i++) {
                if (i !== gameState.playerIndex && i !== gameState.currentChancellor) {
                    const button = document.createElement('button');
                    button.textContent = gameState.players[i].name;
                    button.onclick = () => performExecutiveAction('investigate', i);
                    actionOptions.appendChild(button);
                }
            }
            break;
        case 'peek':
            actionDescription.textContent = 'Peek at the top 3 policies';
            
            // Add continue button
            const continueButton = document.createElement('button');
            continueButton.textContent = 'Peek at Policies';
            continueButton.onclick = () => performExecutiveAction('peek');
            actionOptions.appendChild(continueButton);
            break;
        case 'special_election':
            actionDescription.textContent = 'Choose the next presidential candidate';
            
            // Create buttons for each player
            for (let i = 0; i < gameState.players.length; i++) {
                if (i !== gameState.playerIndex) {
                    const button = document.createElement('button');
                    button.textContent = gameState.players[i].name;
                    button.onclick = () => performExecutiveAction('special_election', i);
                    actionOptions.appendChild(button);
                }
            }
            break;
        case 'execute':
            actionDescription.textContent = 'Execute a player';
            
            // Create buttons for each player
            for (let i = 0; i < gameState.players.length; i++) {
                if (i !== gameState.playerIndex) {
                    const button = document.createElement('button');
                    button.textContent = gameState.players[i].name;
                    button.onclick = () => performExecutiveAction('execute', i);
                    actionOptions.appendChild(button);
                }
            }
            break;
    }
    
    // Show executive action
    executiveAction.classList.remove('hidden');
}

// Show policy selection
function showPolicySelection(policies, role) {
    const policyCards = document.querySelectorAll('.policy-card');
    const selectionTitle = document.querySelector('#policy-selection h2');
    
    // Update title based on role
    if (role === 'president') {
        selectionTitle.textContent = 'Select a policy to discard';
    } else if (role === 'chancellor') {
        selectionTitle.textContent = 'Select a policy to enact';
    }
    
    // Update policy cards
    for (let i = 0; i < policyCards.length; i++) {
        if (i < policies.length) {
            policyCards[i].className = 'policy-card';
            policyCards[i].classList.add(`${policies[i]}-policy`);
            policyCards[i].style.display = 'block';
            
            // Add click event
            policyCards[i].onclick = () => selectPolicy(i, role);
        } else {
            policyCards[i].style.display = 'none';
        }
    }
    
    // Show policy selection
    policySelection.classList.remove('hidden');
}

// Update the players list in the UI
function updatePlayersList() {
    playersList.innerHTML = '';
    
    gameState.players.forEach((player, index) => {
        const li = document.createElement('li');
        let playerStatus = '';
        
        if (player.isPresident) {
            playerStatus = ' (President)';
            li.style.backgroundColor = '#ff8c00';
        } else if (player.isChancellor) {
            playerStatus = ' (Chancellor)';
            li.style.backgroundColor = '#ff4d4d';
        }
        
        li.textContent = player.name + playerStatus;
        
        // Mark disconnected players
        if (player.disconnected) {
            li.classList.add('disconnected');
        }
        
        // Highlight current player
        if (index === gameState.playerIndex) {
            li.style.fontWeight = 'bold';
            li.style.border = '2px solid #fff';
        }
        
        // Add kick/ban controls for room owner
        if (gameState.isRoomOwner && index !== gameState.playerIndex && !gameState.gameStarted) {
            const controls = document.createElement('div');
            controls.className = 'player-controls';
            
            const kickBtn = document.createElement('button');
            kickBtn.className = 'kick-btn';
            kickBtn.textContent = 'Kick';
            kickBtn.onclick = (e) => {
                e.stopPropagation();
                kickPlayer(index);
            };
            
            const banBtn = document.createElement('button');
            banBtn.className = 'ban-btn';
            banBtn.textContent = 'Ban';
            banBtn.onclick = (e) => {
                e.stopPropagation();
                banPlayer(index);
            };
            
            controls.appendChild(kickBtn);
            controls.appendChild(banBtn);
            li.appendChild(controls);
        }
        
        playersList.appendChild(li);
    });
}

// Update the game board
function updateGameBoard() {
    // Update liberal policies
    for (let i = 1; i <= 5; i++) {
        const slot = document.getElementById(`liberal-${i}`);
        if (i <= gameState.liberalPolicies) {
            slot.classList.add('liberal-policy');
        } else {
            slot.classList.remove('liberal-policy');
        }
    }
    
    // Update fascist policies
    for (let i = 1; i <= 6; i++) {
        const slot = document.getElementById(`fascist-${i}`);
        if (i <= gameState.fascistPolicies) {
            slot.classList.add('fascist-policy');
        } else {
            slot.classList.remove('fascist-policy');
        }
    }
}

// Initialize cards
function initializeCards() {
    // Create liberal policy card
    const liberalCardUrl = createPixelArtCard('liberal');
    const liberalCardStyle = document.createElement('style');
    liberalCardStyle.textContent = `.liberal-policy { background-image: url('${liberalCardUrl}'); background-size: cover; }`;
    document.head.appendChild(liberalCardStyle);
    
    // Create fascist policy card
    const fascistCardUrl = createPixelArtCard('fascist');
    const fascistCardStyle = document.createElement('style');
    fascistCardStyle.textContent = `.fascist-policy { background-image: url('${fascistCardUrl}'); background-size: cover; }`;
    document.head.appendChild(fascistCardStyle);
    
    // Create role cards
    const liberalRoleUrl = createPixelArtCard('liberal');
    const liberalRoleStyle = document.createElement('style');
    liberalRoleStyle.textContent = `.liberal-role { background-image: url('${liberalRoleUrl}'); background-size: cover; }`;
    document.head.appendChild(liberalRoleStyle);
    
    const fascistRoleUrl = createPixelArtCard('fascist');
    const fascistRoleStyle = document.createElement('style');
    fascistRoleStyle.textContent = `.fascist-role { background-image: url('${fascistRoleUrl}'); background-size: cover; }`;
    document.head.appendChild(fascistRoleStyle);
    
    const hitlerRoleUrl = createPixelArtCard('hitler');
    const hitlerRoleStyle = document.createElement('style');
    hitlerRoleStyle.textContent = `.hitler-role { background-image: url('${hitlerRoleUrl}'); background-size: cover; }`;
    document.head.appendChild(hitlerRoleStyle);
    
    // Add start game button styles
    const startGameBtnStyle = document.createElement('style');
    startGameBtnStyle.textContent = `
        #start-game-btn {
            padding: 10px 20px;
            margin-top: 10px;
            transition: all 0.3s;
        }
        
        #start-game-btn.ready {
            background-color: #4CAF50;
            color: white;
            box-shadow: 0 4px 8px rgba(76, 175, 80, 0.3);
        }
        
        #start-game-btn.not-ready {
            background-color: #9e9e9e;
            color: #f5f5f5;
            cursor: not-allowed;
            box-shadow: none;
        }
    `;
    document.head.appendChild(startGameBtnStyle);
}

// Create pixel art cards programmatically
function createPixelArtCard(type) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = 120;
    canvas.height = 180;
    
    // Draw card background
    ctx.fillStyle = type === 'liberal' ? '#4d79ff' : '#ff4d4d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw pixel border
    ctx.fillStyle = '#000';
    for (let i = 0; i < canvas.width; i += 4) {
        ctx.fillRect(i, 0, 2, 2); // Top border
        ctx.fillRect(i, canvas.height - 2, 2, 2); // Bottom border
    }
    for (let i = 0; i < canvas.height; i += 4) {
        ctx.fillRect(0, i, 2, 2); // Left border
        ctx.fillRect(canvas.width - 2, i, 2, 2); // Right border
    }
    
    // Draw card text
    ctx.fillStyle = '#fff';
    ctx.font = '16px "Press Start 2P", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw different text based on card type
    if (type === 'liberal') {
        ctx.fillText('LIBERAL', canvas.width / 2, canvas.height / 2 - 20);
    } else if (type === 'fascist') {
        ctx.fillText('FASCIST', canvas.width / 2, canvas.height / 2 - 20);
    } else if (type === 'hitler') {
        ctx.fillText('HITLER', canvas.width / 2, canvas.height / 2 - 20);
    }
    
    return canvas.toDataURL();
}

// Get action name for display
function getActionName(action) {
    switch (action) {
        case 'investigate':
            return 'Investigate Loyalty';
        case 'peek':
            return 'Peek at Policies';
        case 'special_election':
            return 'Special Election';
        case 'execute':
            return 'Execution';
        default:
            return action;
    }
}

// Show a mock election for frontend development
function showMockElection() {
    // Set president and chancellor
    const presidentIndex = Math.floor(Math.random() * gameState.players.length);
    let chancellorIndex;
    do {
        chancellorIndex = Math.floor(Math.random() * gameState.players.length);
    } while (chancellorIndex === presidentIndex);
    
    const president = gameState.players[presidentIndex];
    const chancellor = gameState.players[chancellorIndex];
    
    // Update the election popup
    presidentName.textContent = president.name;
    chancellorName.textContent = chancellor.name;
    
    // Show the election popup
    electionPopup.classList.remove('hidden');
}

// Show mock policy selection for frontend development
function showMockPolicySelection() {
    // Create mock policies
    const mockPolicies = ['liberal', 'fascist', 'liberal'];
    
    // Show policy selection
    showPolicySelection(mockPolicies, 'president');
}

// Show mock game over for frontend development
function showMockGameOver(winner) {
    // Set winner text
    if (winner === 'liberal') {
        winnerText.textContent = 'Liberals Win! Hitler was executed!';
        winnerText.style.color = '#4d79ff';
    } else {
        winnerText.textContent = 'Fascists Win! Hitler was elected Chancellor!';
        winnerText.style.color = '#ff4d4d';
    }
    
    // Show game over
    gameOver.classList.remove('hidden');
}

// Reset the game
function resetGame() {
    // Reset game state
    gameState.players = [];
    gameState.gameId = null;
    gameState.playerRole = null;
    gameState.currentPresident = null;
    gameState.currentChancellor = null;
    gameState.previousPresident = null;
    gameState.previousChancellor = null;
    gameState.liberalPolicies = 0;
    gameState.fascistPolicies = 0;
    gameState.electionTracker = 0;
    gameState.drawPile = [];
    gameState.discardPile = [];
    gameState.currentPolicies = [];
    gameState.gameStarted = false;
    gameState.playerIndex = -1;
    gameState.isRoomOwner = false;
    gameState.phase = 'lobby';
    gameState.votes = {};
    gameState.votesNeeded = 0;
    gameState.executiveAction = null;
    
    // Reset UI
    gameBoard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    electionPopup.classList.add('hidden');
    policySelection.classList.add('hidden');
    executiveAction.classList.add('hidden');
    gameOver.classList.add('hidden');
    
    // Clear game code input
    gameCodeInput.value = '';
    
    // Reset role card
    playerRole.className = 'role-card';
    
    // Disconnect from server
    if (socket) {
        socket.disconnect();
    }
    
    // Reconnect to server
    connectToServer();
}

// Initialize the game when the page loads
window.addEventListener('load', initGame);
