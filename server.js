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

// Справочник подключенных пользователей (username -> socket.id)
// Необходим для того, чтобы сервер знал, кому именно начислять TON и NFT
const connectedUsers = {};

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

    // Вычисляем точное время полёта до точки краша
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

    // Регистрация пользователя по username (чтобы админ мог его найти системно)
    socket.on('register', (username) => {
        if (username) {
            connectedUsers[username.toLowerCase()] = socket.id;
        }
    });

    // Обработка и трансляция ставки игрока остальным участникам
    socket.on('bet', (data) => {
        socket.broadcast.emit('bet', data);
    });

    // Обработка и трансляция вывода (кэшаута) игрока
    socket.on('cashOut', (data) => {
        socket.broadcast.emit('cashOut', data);
    });

    // ===========================================
    // СИСТЕМНАЯ АДМИН ПАНЕЛЬ
    // ===========================================
    
    // Запрос от админа на получение текущей статистики игрока
    socket.on('request_user_stats', (targetUser) => {
        const targetSocketId = connectedUsers[targetUser.toLowerCase()];
        if (targetSocketId) {
            // Запрашиваем статистику у самого игрока
            io.to(targetSocketId).emit('get_stats_for_admin', socket.id);
        } else {
            socket.emit('admin_error', { msg: `Игрок ${targetUser} не в сети! Чтобы выдать предмет системно, он должен быть онлайн.` });
        }
    });

    // Пересылка статистики от игрока обратно админу
    socket.on('send_stats_to_admin', (data) => {
        io.to(data.adminSocketId).emit('admin_user_stats', data);
    });

    // Отправка команды на пополнение баланса или выдачу NFT
    socket.on('admin_action', (data) => {
        const targetUser = data.targetUser.toLowerCase();
        const targetSocketId = connectedUsers[targetUser];

        if (targetSocketId) {
            // Отправляем команду системно напрямую целевому игроку
            io.to(targetSocketId).emit('admin_receive', data);
            socket.emit('admin_success', { msg: `Действие успешно применено к игроку ${data.targetUser}!` });
        } else {
            socket.emit('admin_error', { msg: `Игрок ${data.targetUser} покинул игру!` });
        }
    });

    // ===========================================

    socket.on('disconnect', () => {
        onlineCount--;
        if (onlineCount < 0) onlineCount = 0;
        io.emit('updateOnline', onlineCount);

        // Удаляем пользователя из системы при выходе
        for (let uname in connectedUsers) {
            if (connectedUsers[uname] === socket.id) {
                delete connectedUsers[uname];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
const path = require('path');

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
server.listen(PORT, () => {
    console.log(`Сервер успешно запущен на порту ${PORT}`);
});
