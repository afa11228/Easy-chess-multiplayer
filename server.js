const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
let waiting = null;
const rooms = new Map();

function checkWin(b) {
  for (const [a,x,c] of LINES) if (b[a] && b[a] === b[x] && b[a] === b[c]) return b[a];
  return null;
}

io.on('connection', (socket) => {
  socket.on('find-match', () => {
    if (waiting && waiting.connected && waiting.id !== socket.id) {
      const roomId = 'r-' + Date.now();
      const room = { board: Array(9).fill(null), phase: 'placement', turn: 'X',
                     players: { X: waiting, O: socket } };
      rooms.set(roomId, room);
      waiting.join(roomId); socket.join(roomId);
      waiting.emit('match-found', { roomId, symbol: 'X' });
      socket.emit('match-found', { roomId, symbol: 'O' });
      io.to(roomId).emit('game-state', { board: room.board, phase: room.phase, turn: room.turn });
      waiting = null;
    } else {
      waiting = socket;
      socket.emit('waiting');
    }
  });

  socket.on('move', ({ roomId, from, to }) => {
    const room = rooms.get(roomId); if (!room) return;
    const sym = room.players.X.id === socket.id ? 'X'
              : room.players.O.id === socket.id ? 'O' : null;
    if (!sym || sym !== room.turn) return;

    if (room.phase === 'placement') {
      if (room.board[to] !== null) return;
      room.board[to] = sym;
    } else {
      if (room.board[from] !== sym || room.board[to] !== null) return;
      room.board[from] = null; room.board[to] = sym;
    }
    const w = checkWin(room.board);
    if (w) return io.to(roomId).emit('game-over', { board: room.board, winner: w });
    if (room.board.filter(Boolean).length === 6) room.phase = 'movement';
    room.turn = room.turn === 'X' ? 'O' : 'X';
    io.to(roomId).emit('game-state', { board: room.board, phase: room.phase, turn: room.turn });
  });

  socket.on('disconnect', () => {
    if (waiting === socket) waiting = null;
    for (const [id, room] of rooms) {
      if (room.players.X.id === socket.id || room.players.O.id === socket.id) {
        socket.to(id).emit('opponent-left');
        rooms.delete(id);
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('server up'));
