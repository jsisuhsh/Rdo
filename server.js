const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
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

    // Пример обработки сообщения от клиента
    socket.on('bet', (data) => {
        console.log('Ставка получена:', data);
        // Отправляем всем остальным игрокам
        io.emit('newBet', data);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('Сервер запущен на порту ' + PORT);
});
