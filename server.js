const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let currentPhase = 'wait'; 
let targetMultiplier = 1.00;
let phaseStartTime = Date.now();

function generateMultiplier() {
    let r = Math.random() * 100;
    if (r < 20) return 1.00 + Math.random() * 0.2;
    if (r < 50) return 1.20 + Math.random() * 0.8;
    return 2.00 + Math.random() * 8.0;
}

// Игровой цикл
setInterval(() => {
    let now = Date.now();
    let elapsed = now - phaseStartTime;

    if (currentPhase === 'wait' && elapsed >= 5000) {
        currentPhase = 'flight';
        targetMultiplier = parseFloat(generateMultiplier().toFixed(2));
        phaseStartTime = now;
        io.emit('gameSync', { phase: 'flight', targetMultiplier, elapsed: 0 });
    } else if (currentPhase === 'flight') {
        let currentMult = Math.pow(1.001, elapsed / 20);
        if (currentMult >= targetMultiplier) {
            currentPhase = 'crash';
            phaseStartTime = now;
            io.emit('gameSync', { phase: 'crash', targetMultiplier, elapsed: 0 });
        }
    } else if (currentPhase === 'crash' && elapsed >= 3000) {
        currentPhase = 'wait';
        phaseStartTime = now;
        io.emit('gameSync', { phase: 'wait', targetMultiplier: 0, elapsed: 0 });
    }
}, 100);

io.on('connection', (socket) => {
    // Синхронизируем новичка сразу при подключении
    socket.emit('gameSync', { phase: currentPhase, targetMultiplier, elapsed: Date.now() - phaseStartTime });
    
    socket.on('bet', (data) => io.emit('newBet', data));
    socket.on('cashOut', (data) => io.emit('cashOut', data));
});

http.listen(process.env.PORT || 3000);
