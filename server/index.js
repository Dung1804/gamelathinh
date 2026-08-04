const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Phục vụ file tĩnh trong thư mục public (HTML/CSS/JS phía client)
app.use(express.static(path.join(__dirname, '..', 'public')));

// rooms: Map<roomCode, Set<ws>>  -- mỗi phòng tối đa 2 người
const rooms = new Map();

function getRoom(code) {
  if (!rooms.has(code)) rooms.set(code, new Set());
  return rooms.get(code);
}

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      if (!code) return;

      const room = getRoom(code);
      if (room.size >= 2) {
        ws.send(JSON.stringify({ type: 'roomFull' }));
        return;
      }

      currentRoom = code;
      const isFirst = room.size === 0;
      room.add(ws);
      ws.roomCode = code;

      ws.send(JSON.stringify({ type: 'joined', isHost: isFirst, peersInRoom: room.size }));

      // báo cho người còn lại trong phòng (nếu có) là đã có người mới vào
      broadcastToRoom(code, ws, { type: 'peerJoined' });
      return;
    }

    // mọi message khác (flipCard, syncFullState, restartGame, webrtc-offer/answer/ice...)
    // chỉ đơn giản relay sang người còn lại trong cùng phòng
    if (currentRoom) {
      broadcastToRoom(currentRoom, ws, msg);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(ws);
      broadcastToRoom(currentRoom, ws, { type: 'peerLeft' });
      if (room.size === 0) rooms.delete(currentRoom);
    }
  });
});

function broadcastToRoom(code, sender, message) {
  const room = rooms.get(code);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client !== sender && client.readyState === 1) {
      client.send(payload);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server dang chay tren port ${PORT}`);
});
