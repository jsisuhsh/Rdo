const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Указываем, что все статические файлы (html, css, js) лежат в папке public
app.use(express.static(path.join(__dirname, 'public')));

// Обработка подключения игроков
io.on('connection', (socket) => {
  console.log('Игрок подключился: ' + socket.id);

  // Когда игрок делает ставку, мы рассылаем её всем остальным
  socket.on('bet', (data) => {
    // Рассылаем всем информацию о новой ставке
    io.emit('new_bet', { 
      id: socket.id, 
      username: data.username, 
      amount: data.amount 
    });
  });

  // Когда игрок выводит ставку
  socket.on('cashout', (data) => {
    io.emit('player_cashout', {
      id: socket.id,
      multiplier: data.multiplier
    });
  });

  socket.on('disconnect', () => {
    console.log('Игрок ушел');
  });
});

// Используем порт, который предоставляет сервер, или 3000 по умолчанию
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('Сервер запущен на порту ' + PORT);
});
