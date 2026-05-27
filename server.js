const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

// Раздаем статические файлы из текущей папки
app.use(express.static(__dirname));

// При заходе на главную отдаем index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Логика работы с сокетами
io.on('connection', (socket) => {
    console.log('Пользователь подключился: ' + socket.id);
    
    // Отправляем текущий онлайн всем при подключении нового пользователя
    io.emit('updateOnline', io.engine.clientsCount);

    // Обработка ставок
    socket.on('bet', (data) => {
        console.log('Ставка получена:', data);
        io.emit('newBet', data);
    });

    // Обработка вывода средств
    socket.on('cashOut', (data) => {
        console.log('Вывод получен:', data);
        io.emit('cashOut', data);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
        // Обновляем онлайн при отключении
        io.emit('updateOnline', io.engine.clientsCount);
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('Сервер запущен на порту ' + PORT);
});
