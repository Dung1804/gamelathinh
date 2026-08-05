const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Phục vụ file tĩnh trong thư mục public (HTML/CSS/JS phía client)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============ Kho ảnh kỷ niệm (dùng chung cho cả web, lưu trên đĩa server) ============
// Lưu ý: nếu deploy trên Render bản không bật "Persistent Disk", thư mục này
// có thể bị xoá khi deploy lại code mới (tải lại trang bình thường thì ảnh vẫn còn).
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'memories');
const MANIFEST_PATH = path.join(__dirname, 'uploads', 'manifest.json');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let photoLibrary = [];
try {
  photoLibrary = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (!Array.isArray(photoLibrary)) photoLibrary = [];
} catch {
  photoLibrary = [];
}

function saveManifest() {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(photoLibrary), 'utf8');
}

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB mỗi ảnh sau khi decode

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: '10mb' })); // đủ cho 1 ảnh đã nén base64

app.get('/api/photos', (req, res) => {
  res.json({ photos: photoLibrary });
});

app.post('/api/photos/upload', (req, res) => {
  const { imageBase64, uploader } = req.body || {};
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(imageBase64 || '');
  if (!match) {
    return res.status(400).json({ error: 'Ảnh không hợp lệ' });
  }
  const mime = match[1];
  const ext = MIME_EXT[mime];
  if (!ext) {
    return res.status(400).json({ error: 'Chỉ nhận ảnh JPEG/PNG/WEBP' });
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_PHOTO_BYTES) {
    return res.status(400).json({ error: 'Ảnh quá lớn (tối đa 4MB)' });
  }

  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

  const photo = {
    id,
    url: `/uploads/memories/${filename}`,
    uploader: String(uploader || '').trim().slice(0, 16) || 'Ẩn danh',
    uploadedAt: Date.now(),
  };
  photoLibrary.push(photo);
  saveManifest();

  res.json({ photo });
});

app.delete('/api/photos/:id', (req, res) => {
  const idx = photoLibrary.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const [removed] = photoLibrary.splice(idx, 1);
  saveManifest();
  const filePath = path.join(__dirname, removed.url.replace(/^\//, ''));
  fs.unlink(filePath, () => {}); // xoá file vật lý, bỏ qua nếu lỗi

  res.json({ ok: true });
});

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

ws.playerName = String(msg.name || '').trim() || (isFirst ? 'Người chơi 1' : 'Người chơi 2');

// chế độ chơi do người vào phòng trước (host) quyết định; người vào sau dùng chung chế độ đó
const VALID_MODES = ['hoathinh', 'convat', 'hoaqua', 'tonghop', 'kyniem'];
if (isFirst) {
  const requestedMode = String(msg.mode || '').trim();
  room.mode = VALID_MODES.includes(requestedMode) ? requestedMode : 'tonghop';
}

room.add(ws);
ws.roomCode = code;
      ws.send(JSON.stringify({
  type: 'joined',
  isHost: isFirst,
  peersInRoom: room.size,
  mode: room.mode
}));

// ===== THÊM ĐOẠN NÀY =====
const players = [...room].map(c => c.playerName);

for (const client of room) {
  if (client.readyState === 1) {
    client.send(JSON.stringify({
      type: 'playersUpdate',
      players
    }));
  }
}
// ==========================

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
	  const players = [...room].map(c => c.playerName);
for (const client of room) {
  if (client.readyState === 1) {
    client.send(JSON.stringify({
      type: 'playersUpdate',
      players
    }));
  }
}
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
