const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let onlineCount = 0;
let currentPhase = 'wait'; // Возможные фазы: 'wait', 'flight', 'crash'
let phaseStartTime = Date.now();
let targetMultiplier = 1.00;

// Математическая функция генерации точки взрыва (Crash)
function generateCrashMultiplier() {
    const r = Math.random();
    if (r < 0.03) return 1.00; // 3% шанс моментального взрыва на 1.00x
    return parseFloat((99 / (100 - r * 100)).toFixed(2));
}

// Фаза ожидания ставок (5 секунд)
function startWaitPhase() {
    currentPhase = 'wait';
    phaseStartTime = Date.now();
    targetMultiplier = generateCrashMultiplier();
    
    io.emit('gameSync', {
        phase: currentPhase,
        elapsed: 0,
        targetMultiplier: targetMultiplier
    });

    setTimeout(startFlightPhase, 5000);
}

// Фаза полёта ракеты
function startFlightPhase() {
    currentPhase = 'flight';
    phaseStartTime = Date.now();

    io.emit('gameSync', {
        phase: currentPhase,
        elapsed: 0,
        targetMultiplier: targetMultiplier
    });

    // Вычисляем точное время полёта до точки краша по формуле из клиента:
    // mult = Math.pow(1.001, timeElapsed / 20)
    let flightDuration = 0;
    if (targetMultiplier > 1.00) {
        flightDuration = (20 * Math.log(targetMultiplier)) / Math.log(1.001);
    }

    setTimeout(startCrashPhase, flightDuration);
}

// Фаза взрыва (3 секунды перед новым раундом)
function startCrashPhase() {
    currentPhase = 'crash';
    phaseStartTime = Date.now();

    io.emit('gameSync', {
        phase: currentPhase,
        elapsed: 0,
        targetMultiplier: targetMultiplier
    });

    setTimeout(startWaitPhase, 3000);
}

// Запуск бесконечного игрового цикла на сервере
startWaitPhase();

io.on('connection', (socket) => {
    onlineCount++;
    io.emit('updateOnline', onlineCount);

    // Синхронизируем вошедшего игрока с текущим состоянием игры
    socket.emit('gameSync', {
        phase: currentPhase,
        elapsed: Date.now() - phaseStartTime,
        targetMultiplier: targetMultiplier
    });

    // Обработка и трансляция ставки игрока остальным участникам
    socket.on('bet', (data) => {
        socket.broadcast.emit('bet', data);
    });

    // Обработка и трансляция вывода (кэшаута) игрока остальным участникам
    socket.on('cashOut', (data) => {
        socket.broadcast.emit('cashOut', data);
    });

    socket.on('disconnect', () => {
        onlineCount--;
        if (onlineCount < 0) onlineCount = 0;
        io.emit('updateOnline', onlineCount);
    });
});

const PORT = process.env.PORT || 3000;
const path = require('path');

// Укажите, что статические файлы лежат в папке, где находится server.js
app.use(express.static(path.join(__dirname)));

// Маршрут для отдачи index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
server.listen(PORT, () => {
    console.log(`Сервер успешно запущен на порту ${PORT}`);
});
