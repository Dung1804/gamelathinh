// ============ Cấu hình ============
const SYMBOLS = ["🍎","🍌","🍇","🍓","🍒","🍑","🍍","🥝"]; // 8 cặp = 16 thẻ
const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];

// ============ State ============
let ws = null;
let isHost = false;
let cards = [];           // [{symbolIndex, isFaceUp, isMatched}]
let isMyTurn = false;
let firstFlippedIndex = null;
let lockBoard = false;

let peerConnection = null;
let localStream = null;
let isMuted = false;

// ============ DOM refs ============
const joinScreen = document.getElementById("joinScreen");
const gameScreen = document.getElementById("gameScreen");
const roomInput = document.getElementById("roomInput");
const joinBtn = document.getElementById("joinBtn");
const statusText = document.getElementById("statusText");
const boardEl = document.getElementById("board");
const turnIndicator = document.getElementById("turnIndicator");
const muteBtn = document.getElementById("muteBtn");
const voiceStatus = document.getElementById("voiceStatus");
const restartBtn = document.getElementById("restartBtn");
const leaveBtn = document.getElementById("leaveBtn");
const remoteAudio = document.getElementById("remoteAudio");

// ============ Join room ============
joinBtn.addEventListener("click", joinRoom);
roomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });

function joinRoom() {
  const room = roomInput.value.trim().toUpperCase();
  if (!room) {
    statusText.textContent = "Nhập mã phòng trước đã nhé";
    return;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", room }));
    statusText.textContent = "Đang vào phòng...";
  };

  ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));

  ws.onclose = () => {
    statusText.textContent = "Mất kết nối server, thử tải lại trang";
  };
}

// ============ Xử lý message từ server ============
function handleServerMessage(msg) {
  switch (msg.type) {
    case "roomFull":
      statusText.textContent = "Phòng này đã có 2 người rồi, thử mã khác nhé";
      break;

    case "joined":
      isHost = msg.isHost;
      joinScreen.classList.add("hidden");
      gameScreen.classList.remove("hidden");
      if (isHost) {
        turnIndicator.textContent = "Đang chờ người kia vào phòng...";
      } else {
        turnIndicator.textContent = "Đã vào phòng, đang đồng bộ...";
      }
      startVoiceCall(); // chuẩn bị mic, chờ peer để gọi
      break;

    case "peerJoined":
      // có người thứ 2 vào -> nếu mình là host thì chia bài + bắt đầu gọi
      if (isHost) {
        setupNewGame();
        callPeer();
      }
      break;

    case "peerLeft":
      turnIndicator.textContent = "Người kia đã rời phòng 😢";
      voiceStatus.textContent = "Voice: đã ngắt";
      break;

    case "flipCard":
      applyRemoteFlip(msg.index);
      break;

    case "syncFullState":
      cards = msg.cards;
      isMyTurn = msg.turnIsHost === isHost;
      renderBoard();
      updateTurnIndicator();
      break;

    case "restartGame":
      if (isHost) return; // host tự set lại rồi, tránh vòng lặp
      break;

    // ---- WebRTC signaling ----
    case "webrtc-offer":
      handleOffer(msg.offer);
      break;
    case "webrtc-answer":
      handleAnswer(msg.answer);
      break;
    case "webrtc-ice":
      handleRemoteIce(msg.candidate);
      break;
  }
}

// ============ Game logic ============
function setupNewGame() {
  const deck = [];
  SYMBOLS.forEach((_, i) => {
    deck.push({ symbolIndex: i, isFaceUp: false, isMatched: false });
    deck.push({ symbolIndex: i, isFaceUp: false, isMatched: false });
  });
  shuffle(deck);
  cards = deck;
  isMyTurn = true; // host đi trước
  renderBoard();
  updateTurnIndicator();
  broadcastFullState(true); // turnIsHost = true (host đang đi)
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function renderBoard() {
  boardEl.innerHTML = "";
  cards.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card" + (card.isFaceUp || card.isMatched ? " flipped" : "") + (card.isMatched ? " matched" : "");
    cardEl.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-back"></div>
        <div class="card-face card-front">${SYMBOLS[card.symbolIndex]}</div>
      </div>
    `;
    cardEl.addEventListener("click", () => onCardClick(index));
    boardEl.appendChild(cardEl);
  });
}

function onCardClick(index) {
  if (!isMyTurn || lockBoard) return;
  const card = cards[index];
  if (card.isFaceUp || card.isMatched) return;

  card.isFaceUp = true;
  renderBoard();
  sendMessage({ type: "flipCard", index });

  if (firstFlippedIndex === null) {
    firstFlippedIndex = index;
  } else {
    evaluateMatch(firstFlippedIndex, index);
  }
}

function applyRemoteFlip(index) {
  // dùng khi cần phản chiếu lượt lật ngay lập tức (đã có syncFullState theo sau nên đây chỉ là hiệu ứng tức thời)
  if (cards[index]) {
    cards[index].isFaceUp = true;
    renderBoard();
  }
}

function evaluateMatch(i1, i2) {
  lockBoard = true;
  firstFlippedIndex = null;
  const match = cards[i1].symbolIndex === cards[i2].symbolIndex;

  if (match) {
    cards[i1].isMatched = true;
    cards[i2].isMatched = true;
    lockBoard = false;
    renderBoard();
    broadcastFullState(isHost); // vẫn giữ lượt hiện tại
  } else {
    setTimeout(() => {
      cards[i1].isFaceUp = false;
      cards[i2].isFaceUp = false;
      isMyTurn = false;
      lockBoard = false;
      renderBoard();
      updateTurnIndicator();
      // đổi lượt: nếu mình đang là host thì lượt kế tiếp thuộc về "không phải host"
      broadcastFullState(!isHost);
    }, 800);
  }
}

function broadcastFullState(turnIsHost) {
  sendMessage({ type: "syncFullState", cards, turnIsHost });
  isMyTurn = (turnIsHost === isHost);
  updateTurnIndicator();
}

function updateTurnIndicator() {
  const allMatched = cards.length > 0 && cards.every(c => c.isMatched);
  if (allMatched) {
    turnIndicator.textContent = "🎉 Xong rồi! Bấm Chơi lại để chơi tiếp";
    return;
  }
  turnIndicator.textContent = isMyTurn ? "👉 Lượt của bạn" : "⏳ Đang chờ người kia...";
}

restartBtn.addEventListener("click", () => {
  if (isHost) {
    setupNewGame();
  } else {
    sendMessage({ type: "restartGame" });
    turnIndicator.textContent = "Đã gửi yêu cầu chơi lại...";
  }
});

leaveBtn.addEventListener("click", () => {
  if (ws) ws.close();
  if (peerConnection) peerConnection.close();
  location.reload();
});

function sendMessage(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ============ WebRTC voice call ============
async function startVoiceCall() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    voiceStatus.textContent = "Voice: đã bật mic, chờ kết nối...";
  } catch (err) {
    voiceStatus.textContent = "Voice: không lấy được mic (kiểm tra quyền truy cập)";
    console.error(err);
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection({ iceServers: STUN_SERVERS });

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
    voiceStatus.textContent = "Voice: đã kết nối 🎧";
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({ type: "webrtc-ice", candidate: event.candidate });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
      voiceStatus.textContent = "Voice: mất kết nối";
    }
  };
}

async function callPeer() {
  createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: "webrtc-offer", offer });
}

async function handleOffer(offer) {
  createPeerConnection();
  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  sendMessage({ type: "webrtc-answer", answer });
}

async function handleAnswer(answer) {
  if (peerConnection) await peerConnection.setRemoteDescription(answer);
}

async function handleRemoteIce(candidate) {
  try {
    if (peerConnection) await peerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.error("Lỗi ICE candidate:", err);
  }
}

muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  muteBtn.classList.toggle("muted", isMuted);
  muteBtn.textContent = isMuted ? "🔇" : "🎤";
});
