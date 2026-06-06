const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const https = require('https'); // Встроенный модуль для запросов к API TON

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
const connectedUsers = {};

// ===========================================
// ЛОГИКА РЕАЛЬНОГО ПОПОЛНЕНИЯ БАЛАНСА TON
// ===========================================
const TARGET_WALLET = "UQCZjh69M_qPGdQphQyTfZXDpqyNoCfRjALRYe5hyiQBFgLn"; // Ваш кошелек
const processedTransactions = new Set(); // Хранилище обработанных хэшей транзакций

function checkTONPayments() {
    // Делаем запрос к блокчейну TON (бесплатный Toncenter API) на проверку последних 10 транзакций
    const url = `https://toncenter.com/api/v2/getTransactions?address=${TARGET_WALLET}&limit=10`;
    
    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.ok && json.result) {
                    json.result.forEach(tx => {
                        const hash = tx.transaction_id.hash;
                        
                        // Если мы уже обработали эту транзакцию, пропускаем её
                        if (processedTransactions.has(hash)) return;
                        
                        const inMsg = tx.in_msg;
                        // Проверяем, что это входящий перевод и в нём есть значение > 0
                        if (inMsg && inMsg.value > 0) {
                            const amountTon = inMsg.value / 1000000000; // Переводим нанотоны в TON
                            const comment = inMsg.message || ""; // Комментарий, который мы передали (username)
                            
                            if (comment) {
                                const usernameKey = comment.toLowerCase().trim();
                                const targetSocketId = connectedUsers[usernameKey];
                                
                                // Если игрок с таким ником сейчас онлайн в игре
                                if (targetSocketId) {
                                    processedTransactions.add(hash); // Запоминаем транзакцию, чтобы не начислить дважды
                                    
                                    // Отправляем команду конкретному игроку об успешном пополнении
                                    io.to(targetSocketId).emit('payment_success', {
                                        amount: amountTon,
                                        hash: hash
                                    });
                                    console.log(`[TON] Успешный платеж: ${amountTon} TON от ${usernameKey}`);
                                }
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Ошибка парсинга TON API:", e);
            }
        });
    }).on('error', (e) => {
        console.error("Ошибка сети TON API:", e);
    });
}

// Запускаем проверку блокчейна каждые 10 секунд
setInterval(checkTONPayments, 10000);
// ===========================================

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

    // Регистрация пользователя по username
    socket.on('register', (username) => {
        if (username) {
            connectedUsers[username.toLowerCase().trim()] = socket.id;
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
        const targetSocketId = connectedUsers[targetUser.toLowerCase().trim()];
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
        const targetUser = data.targetUser.toLowerCase().trim();
        const targetSocketId = connectedUsers[targetUser];

        if (targetSocketId) {
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
