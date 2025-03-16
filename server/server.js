const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Game state storage
const games = {};

// Player connections
const players = {};

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Create a new game
    socket.on('createGame', (playerName) => {
        const gameId = generateGameId();
        const playerId = uuidv4();
        
        // Initialize game state
        games[gameId] = {
            id: gameId,
            players: [{
                id: playerId,
                name: playerName,
                socketId: socket.id,
                isPresident: false,
                isChancellor: false,
                role: null,
                connected: true
            }],
            gameStarted: false,
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
            phase: 'lobby',
            votes: {},
            votesNeeded: 0,
            executiveAction: null
        };
        
        // Associate player with game
        players[socket.id] = {
            id: playerId,
            gameId: gameId,
            name: playerName
        };
        
        // Join socket room for this game
        socket.join(gameId);
        
        // Send game info back to creator
        socket.emit('gameCreated', {
            gameId: gameId,
            playerId: playerId,
            players: games[gameId].players,
            playerIndex: 0
        });
        
        console.log(`Game created: ${gameId} by player ${playerName}`);
    });
    
    // Join an existing game
    socket.on('joinGame', (data) => {
        const { gameId, playerName } = data;
        
        // Check if game exists
        if (!games[gameId]) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        // Check if game has already started
        if (games[gameId].gameStarted) {
            socket.emit('error', { message: 'Game already started' });
            return;
        }
        
        // Check if game is full (max 10 players)
        if (games[gameId].players.length >= 10) {
            socket.emit('error', { message: 'Game is full' });
            return;
        }
        
        const playerId = uuidv4();
        const playerIndex = games[gameId].players.length;
        
        // Add player to game
        games[gameId].players.push({
            id: playerId,
            name: playerName,
            socketId: socket.id,
            isPresident: false,
            isChancellor: false,
            role: null,
            connected: true
        });
        
        // Associate player with game
        players[socket.id] = {
            id: playerId,
            gameId: gameId,
            name: playerName
        };
        
        // Join socket room for this game
        socket.join(gameId);
        
        // Send game info back to player
        socket.emit('gameJoined', {
            gameId: gameId,
            playerId: playerId,
            players: games[gameId].players,
            playerIndex: playerIndex
        });
        
        // Notify all players in the game
        io.to(gameId).emit('playerJoined', {
            players: games[gameId].players
        });
        
        console.log(`Player ${playerName} joined game ${gameId}`);
        
        // Auto-start game if we have enough players (5+)
        if (games[gameId].players.length >= 5) {
            console.log(`Game ${gameId} has enough players to start`);
            socket.to(gameId).emit('canStartGame');
        }
    });
    
    // Start the game
    socket.on('startGame', () => {
        const player = players[socket.id];
        
        if (!player) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }
        
        const gameId = player.gameId;
        const game = games[gameId];
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        // Check if we have enough players
        if (game.players.length < 5) {
            socket.emit('error', { message: 'Need at least 5 players to start' });
            return;
        }
        
        // Start the game
        game.gameStarted = true;
        game.phase = 'start';
        
        // Assign roles
        assignRoles(game);
        
        // Initialize the draw pile
        initializeDrawPile(game);
        
        // Select the first president randomly
        const firstPresidentIndex = Math.floor(Math.random() * game.players.length);
        game.currentPresident = firstPresidentIndex;
        game.players[firstPresidentIndex].isPresident = true;
        
        // Notify all players that the game has started
        io.to(gameId).emit('gameStarted', {
            players: game.players,
            currentPresident: game.currentPresident
        });
        
        // Send role information to each player privately
        game.players.forEach((player, index) => {
            const socket = io.sockets.sockets.get(player.socketId);
            if (socket) {
                // Determine which other players this player can see
                let visiblePlayers = [];
                
                if (player.role === 'fascist' || player.role === 'hitler') {
                    // Fascists can see other fascists and Hitler
                    game.players.forEach((otherPlayer, otherIndex) => {
                        if (otherIndex !== index && (otherPlayer.role === 'fascist' || otherPlayer.role === 'hitler')) {
                            visiblePlayers.push({
                                index: otherIndex,
                                role: otherPlayer.role
                            });
                        }
                    });
                }
                
                // In games with 5-6 players, Hitler knows who the Fascist is
                if (player.role === 'hitler' && game.players.length <= 6) {
                    game.players.forEach((otherPlayer, otherIndex) => {
                        if (otherIndex !== index && otherPlayer.role === 'fascist') {
                            visiblePlayers.push({
                                index: otherIndex,
                                role: otherPlayer.role
                            });
                        }
                    });
                }
                
                socket.emit('roleAssigned', {
                    role: player.role,
                    visiblePlayers: visiblePlayers
                });
            }
        });
        
        // Start the first election
        startElection(game);
        
        console.log(`Game ${gameId} started`);
    });
    
    // Handle player vote
    socket.on('vote', (vote) => {
        const player = players[socket.id];
        
        if (!player) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }
        
        const gameId = player.gameId;
        const game = games[gameId];
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        // Find player index
        const playerIndex = game.players.findIndex(p => p.id === player.id);
        
        if (playerIndex === -1) {
            socket.emit('error', { message: 'Player not in game' });
            return;
        }
        
        // Record the vote
        game.votes[playerIndex] = vote;
        
        // Notify all players that this player has voted
        io.to(gameId).emit('playerVoted', {
            playerIndex: playerIndex
        });
        
        // Check if all votes are in
        if (Object.keys(game.votes).length === game.players.length) {
            // Count the votes
            let jaVotes = 0;
            for (const index in game.votes) {
                if (game.votes[index]) {
                    jaVotes++;
                }
            }
            
            // Determine if the election passed
            const electionPassed = jaVotes > game.players.length / 2;
            
            // Notify all players of the results
            io.to(gameId).emit('voteResults', {
                votes: game.votes,
                passed: electionPassed
            });
            
            if (electionPassed) {
                // Election passed
                game.electionTracker = 0;
                game.currentChancellor = game.chancellorCandidate;
                game.players[game.currentChancellor].isChancellor = true;
                
                // Check if Hitler was elected Chancellor with 3+ fascist policies
                if (game.players[game.currentChancellor].role === 'hitler' && game.fascistPolicies >= 3) {
                    // Fascists win
                    endGame(game, 'fascist', 'Hitler was elected Chancellor after 3 Fascist policies!');
                    return;
                }
                
                // Start legislative session
                startLegislativeSession(game);
            } else {
                // Election failed
                game.electionTracker++;
                
                // Check if election tracker reached the limit
                if (game.electionTracker >= 3) {
                    // Chaos: enact top policy
                    enactTopPolicy(game);
                } else {
                    // Move to next president
                    game.previousPresident = game.currentPresident;
                    game.players[game.currentPresident].isPresident = false;
                    
                    // Select next president
                    game.currentPresident = (game.currentPresident + 1) % game.players.length;
                    game.players[game.currentPresident].isPresident = true;
                    
                    // Start new election
                    startElection(game);
                }
            }
        }
    });
    
    // Handle policy selection
    socket.on('selectPolicy', (index) => {
        const player = players[socket.id];
        
        if (!player) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }
        
        const gameId = player.gameId;
        const game = games[gameId];
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        // Find player index
        const playerIndex = game.players.findIndex(p => p.id === player.id);
        
        if (playerIndex === -1) {
            socket.emit('error', { message: 'Player not in game' });
            return;
        }
        
        if (game.phase === 'legislative-president' && playerIndex === game.currentPresident) {
            // President discards a policy
            const discardedPolicy = game.currentPolicies.splice(index, 1)[0];
            game.discardPile.push(discardedPolicy);
            
            // Move to chancellor phase
            game.phase = 'legislative-chancellor';
            
            // Notify president
            socket.emit('policyDiscarded');
            
            // Notify chancellor
            const chancellorSocket = io.sockets.sockets.get(game.players[game.currentChancellor].socketId);
            if (chancellorSocket) {
                chancellorSocket.emit('selectPolicies', {
                    policies: game.currentPolicies,
                    role: 'chancellor'
                });
            }
        } else if (game.phase === 'legislative-chancellor' && playerIndex === game.currentChancellor) {
            // Chancellor enacts a policy
            const enactedPolicy = game.currentPolicies.splice(index, 1)[0];
            
            // Add the remaining policy to the discard pile
            game.discardPile.push(game.currentPolicies[0]);
            
            // Enact the selected policy
            enactPolicy(game, enactedPolicy);
        } else {
            socket.emit('error', { message: 'Not your turn or wrong game phase' });
        }
    });
    
    // Handle executive action
    socket.on('executiveAction', (data) => {
        const player = players[socket.id];
        
        if (!player) {
            socket.emit('error', { message: 'Player not found' });
            return;
        }
        
        const gameId = player.gameId;
        const game = games[gameId];
        
        if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        
        // Find player index
        const playerIndex = game.players.findIndex(p => p.id === player.id);
        
        if (playerIndex === -1) {
            socket.emit('error', { message: 'Player not in game' });
            return;
        }
        
        // Check if it's the president's turn
        if (playerIndex !== game.currentPresident) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }
        
        const { action, targetIndex } = data;
        
        switch (action) {
            case 'investigate':
                // Investigate a player's loyalty
                const targetRole = game.players[targetIndex].role;
                const party = targetRole === 'liberal' ? 'Liberal' : 'Fascist';
                
                // Send result only to the president
                socket.emit('investigationResult', {
                    playerIndex: targetIndex,
                    party: party
                });
                
                // Notify all players that an investigation happened
                io.to(gameId).emit('playerInvestigated', {
                    investigator: playerIndex,
                    target: targetIndex
                });
                
                // Move to next president
                moveToNextPresident(game);
                break;
                
            case 'peek':
                // Peek at the top 3 policies
                const topPolicies = game.drawPile.slice(0, 3);
                
                // Send result only to the president
                socket.emit('peekResult', {
                    policies: topPolicies
                });
                
                // Notify all players that a peek happened
                io.to(gameId).emit('presidentPeeked');
                
                // Move to next president
                moveToNextPresident(game);
                break;
                
            case 'special_election':
                // Choose the next presidential candidate
                game.previousPresident = game.currentPresident;
                game.players[game.currentPresident].isPresident = false;
                game.currentPresident = targetIndex;
                game.players[game.currentPresident].isPresident = true;
                
                // Notify all players
                io.to(gameId).emit('specialElection', {
                    newPresident: targetIndex
                });
                
                // Start new election
                startElection(game);
                break;
                
            case 'execute':
                // Execute a player
                const executedPlayer = game.players[targetIndex];
                
                // Notify all players
                io.to(gameId).emit('playerExecuted', {
                    playerIndex: targetIndex
                });
                
                // Check if Hitler was executed
                if (executedPlayer.role === 'hitler') {
                    endGame(game, 'liberal', 'Hitler was executed!');
                    return;
                }
                
                // Remove the player from the game
                game.players.splice(targetIndex, 1);
                
                // Update indices if needed
                if (game.currentPresident > targetIndex) {
                    game.currentPresident--;
                }
                if (game.currentChancellor > targetIndex) {
                    game.currentChancellor--;
                }
                if (game.previousPresident > targetIndex) {
                    game.previousPresident--;
                }
                if (game.previousChancellor > targetIndex) {
                    game.previousChancellor--;
                }
                
                // Move to next president
                moveToNextPresident(game);
                break;
                
            default:
                socket.emit('error', { message: 'Invalid executive action' });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        const player = players[socket.id];
        
        if (player) {
            const gameId = player.gameId;
            const game = games[gameId];
            
            if (game) {
                // Find player in game
                const playerIndex = game.players.findIndex(p => p.id === player.id);
                
                if (playerIndex !== -1) {
                    // Mark player as disconnected
                    game.players[playerIndex].connected = false;
                    
                    // Notify other players
                    socket.to(gameId).emit('playerDisconnected', {
                        playerIndex: playerIndex
                    });
                    
                    // Check if game should end
                    if (game.gameStarted) {
                        const connectedPlayers = game.players.filter(p => p.connected);
                        
                        if (connectedPlayers.length < 3) {
                            // Not enough players to continue
                            endGame(game, 'none', 'Not enough players to continue');
                        }
                    }
                }
            }
            
            // Remove player from players list
            delete players[socket.id];
        }
    });
});

// Helper Functions

// Generate a random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Assign roles to players
function assignRoles(game) {
    const playerCount = game.players.length;
    let liberalCount, fascistCount;
    
    // Determine role counts based on player count
    if (playerCount === 5 || playerCount === 6) {
        liberalCount = playerCount - 2;
        fascistCount = 1;
    } else if (playerCount === 7 || playerCount === 8) {
        liberalCount = playerCount - 3;
        fascistCount = 2;
    } else if (playerCount === 9 || playerCount === 10) {
        liberalCount = playerCount - 4;
        fascistCount = 3;
    } else {
        // Default for testing
        liberalCount = 3;
        fascistCount = 1;
    }
    
    // Create role array
    let roles = [];
    for (let i = 0; i < liberalCount; i++) {
        roles.push('liberal');
    }
    for (let i = 0; i < fascistCount; i++) {
        roles.push('fascist');
    }
    roles.push('hitler');
    
    // Shuffle roles
    roles = shuffleArray(roles);
    
    // Assign roles to players
    for (let i = 0; i < game.players.length; i++) {
        game.players[i].role = roles[i];
    }
}

// Initialize the draw pile
function initializeDrawPile(game) {
    game.drawPile = [];
    game.discardPile = [];
    
    // Add liberal and fascist policies
    for (let i = 0; i < 6; i++) {
        game.drawPile.push('liberal');
    }
    for (let i = 0; i < 11; i++) {
        game.drawPile.push('fascist');
    }
    
    // Shuffle the draw pile
    game.drawPile = shuffleArray(game.drawPile);
}

// Start an election round
function startElection(game) {
    game.phase = 'election';
    game.votes = {};
    game.votesNeeded = game.players.length;
    
    // Clear previous chancellor
    if (game.currentChancellor !== null) {
        game.previousChancellor = game.currentChancellor;
        game.players[game.currentChancellor].isChancellor = false;
        game.currentChancellor = null;
    }
    
    // Select a chancellor candidate
    let chancellorCandidateIndex;
    do {
        chancellorCandidateIndex = Math.floor(Math.random() * game.players.length);
    } while (
        chancellorCandidateIndex === game.currentPresident || 
        chancellorCandidateIndex === game.previousPresident || 
        chancellorCandidateIndex === game.previousChancellor
    );
    
    // Store the chancellor candidate
    game.chancellorCandidate = chancellorCandidateIndex;
    
    // Notify all players about the election
    io.to(game.id).emit('electionStarted', {
        president: game.currentPresident,
        chancellor: chancellorCandidateIndex
    });
}

// Start legislative session
function startLegislativeSession(game) {
    game.phase = 'legislative-president';
    
    // Draw 3 policies
    game.currentPolicies = drawPolicies(game, 3);
    
    // Notify president
    const presidentSocket = io.sockets.sockets.get(game.players[game.currentPresident].socketId);
    if (presidentSocket) {
        presidentSocket.emit('selectPolicies', {
            policies: game.currentPolicies,
            role: 'president'
        });
    }
    
    // Notify all players that legislative session started
    io.to(game.id).emit('legislativeStarted', {
        president: game.currentPresident,
        chancellor: game.currentChancellor
    });
}

// Enact a policy
function enactPolicy(game, policy) {
    if (policy === 'liberal') {
        game.liberalPolicies++;
        
        // Notify all players
        io.to(game.id).emit('policyEnacted', {
            policy: 'liberal',
            count: game.liberalPolicies
        });
        
        // Check if liberals won
        if (game.liberalPolicies >= 5) {
            endGame(game, 'liberal', 'Liberals enacted 5 Liberal policies!');
            return;
        }
    } else {
        game.fascistPolicies++;
        
        // Notify all players
        io.to(game.id).emit('policyEnacted', {
            policy: 'fascist',
            count: game.fascistPolicies
        });
        
        // Check if fascists won
        if (game.fascistPolicies >= 6) {
            endGame(game, 'fascist', 'Fascists enacted 6 Fascist policies!');
            return;
        }
        
        // Check for executive action
        const executiveAction = checkExecutiveAction(game);
        
        if (executiveAction) {
            game.phase = 'executive';
            
            // Notify president
            const presidentSocket = io.sockets.sockets.get(game.players[game.currentPresident].socketId);
            if (presidentSocket) {
                presidentSocket.emit('executiveAction', {
                    action: executiveAction
                });
            }
            
            // Notify all players
            io.to(game.id).emit('executiveActionStarted', {
                action: executiveAction
            });
            
            return;
        }
    }
    
    // Move to next president
    moveToNextPresident(game);
}

// Check for executive action
function checkExecutiveAction(game) {
    const playerCount = game.players.length;
    
    // Determine action based on fascist policies and player count
    switch (game.fascistPolicies) {
        case 1:
            if (playerCount >= 9) {
                return 'investigate';
            }
            break;
        case 2:
            if (playerCount >= 7) {
                return 'investigate';
            }
            break;
        case 3:
            if (playerCount <= 6) {
                return 'peek';
            } else {
                return 'special_election';
            }
            break;
        case 4:
        case 5:
            return 'execute';
            break;
    }
    
    return null;
}

// Enact top policy (chaos)
function enactTopPolicy(game) {
    // Draw top policy
    const topPolicy = drawPolicies(game, 1)[0];
    
    // Notify all players
    io.to(game.id).emit('chaosPolicyEnacted');
    
    // Enact the policy
    enactPolicy(game, topPolicy);
}

// Draw policies from the draw pile
function drawPolicies(game, count) {
    // Check if we need to reshuffle
    if (game.drawPile.length < count) {
        // Shuffle discard pile into draw pile
        game.drawPile = game.drawPile.concat(shuffleArray(game.discardPile));
        game.discardPile = [];
    }
    
    // Draw policies
    return game.drawPile.splice(0, count);
}

// Move to next president
function moveToNextPresident(game) {
    game.previousPresident = game.currentPresident;
    game.players[game.currentPresident].isPresident = false;
    
    // Select next president
    game.currentPresident = (game.currentPresident + 1) % game.players.length;
    game.players[game.currentPresident].isPresident = true;
    
    // Notify all players
    io.to(game.id).emit('newPresident', {
        president: game.currentPresident
    });
    
    // Start new election
    startElection(game);
}

// End the game
function endGame(game, winner, reason) {
    game.phase = 'gameover';
    
    // Notify all players
    io.to(game.id).emit('gameOver', {
        winner: winner,
        reason: reason,
        roles: game.players.map(p => ({ name: p.name, role: p.role }))
    });
    
    // Clean up game data after a delay
    setTimeout(() => {
        delete games[game.id];
    }, 3600000); // Keep game data for 1 hour
}

// Shuffle an array
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
