// ============ Cấu hình ============
const SYMBOLS = [
  "🍎","🍌","🍇","🍓","🍒","🍑","🍍","🥝",
  "🥥","🍉","🍋","🍐","🍈","🥭","🍊","🍏",
  "🐶","🐱","🐼","🐸","🦊","🐵","🐰","🐻"
];

const LEVELS = [20, 24, 30, 36, 42, 48];
let currentLevel = 1;
let cardCount = LEVELS[0]; // bắt đầu 20 thẻ
const STUN_SERVERS = [
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: "000b83dcd782bd24ab7f2e82",
    credential: "RTFjpUjJAuzOclzX",
  },
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: "000b83dcd782bd24ab7f2e82",
    credential: "RTFjpUjJAuzOclzX",
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: "000b83dcd782bd24ab7f2e82",
    credential: "RTFjpUjJAuzOclzX",
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=tcp",
    username: "000b83dcd782bd24ab7f2e82",
    credential: "RTFjpUjJAuzOclzX",
  },
];

// ============ State ============

let ws = null;
let isHost = false;
let cards = [];           // [{symbolIndex, isFaceUp, isMatched}]
let isMyTurn = false;
let firstFlippedIndex = null;
let lockBoard = false;
let myName = '';
let playerNames = ['Người chơi 1', 'Người chơi 2'];
let scores = [0, 0]; // [host, guest]
let peerConnection = null;
let localStream = null;
let isMuted = false;
let pendingCandidates = [];
let remoteDescriptionSet = false;
let disconnectTimer = null;

// ============ DOM refs ============
const joinScreen = document.getElementById("joinScreen");
const gameScreen = document.getElementById("gameScreen");
const roomInput = document.getElementById("roomInput");
const playerNameInput = document.getElementById('playerNameInput');

const player1NameEl = document.getElementById('player1Name');
const player2NameEl = document.getElementById('player2Name');
const player1ScoreEl = document.getElementById('player1Score');
const player2ScoreEl = document.getElementById('player2Score');
const joinBtn = document.getElementById("joinBtn");
const statusText = document.getElementById("statusText");
const boardEl = document.getElementById("board");
const turnIndicator = document.getElementById("turnIndicator");
const muteBtn = document.getElementById("muteBtn");
const voiceStatus = document.getElementById("voiceStatus");
const restartBtn = document.getElementById("restartBtn");
const leaveBtn = document.getElementById("leaveBtn");
const remoteAudio = document.getElementById("remoteAudio");
const enableAudioBtn = document.getElementById("enableAudioBtn");

// Âm thanh
const bgm = document.getElementById("bgm");
const flipSound = document.getElementById("flipSound");
const matchSound = document.getElementById("matchSound");
const winSound = document.getElementById("winSound");
const winOverlay = document.getElementById("winOverlay");
const levelText = document.getElementById("levelText");

function playSound(audio) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

enableAudioBtn.addEventListener("click", () => {
  remoteAudio.play()
    .then(() => {
      enableAudioBtn.classList.add("hidden");
      voiceStatus.textContent = "Voice: đã kết nối 🎧";
    })
    .catch((err) => {
      console.error("Vẫn không phát được audio:", err);
      logDebug("Vẫn không phát được audio: " + err.message, true);
    });
});

// ============ Debug log hiện trên màn hình (thay cho console) ============
const debugLogEl = document.getElementById("debugLog");
const toggleLogBtn = document.getElementById("toggleLogBtn");

toggleLogBtn.addEventListener("click", () => {
  debugLogEl.classList.toggle("hidden");
});

function logDebug(message, isError = false) {
  const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });
  const line = document.createElement("div");
  if (isError) line.className = "log-error";
  line.textContent = `[${time}] ${message}`;
  debugLogEl.appendChild(line);
  debugLogEl.scrollTop = debugLogEl.scrollHeight;
  // giữ tối đa 200 dòng để tránh phình to
  while (debugLogEl.children.length > 200) {
    debugLogEl.removeChild(debugLogEl.firstChild);
  }
}

// bắt luôn các lỗi JS chưa được xử lý, để không bỏ sót gì
window.addEventListener("error", (e) => {
  logDebug(`Lỗi JS: ${e.message}`, true);
});
window.addEventListener("unhandledrejection", (e) => {
  logDebug(`Lỗi Promise: ${e.reason}`, true);
});

// ============ Join room ============
joinBtn.addEventListener("click", joinRoom);
roomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });

function joinRoom() {
	myName = playerNameInput.value.trim() || 'Khách';
  const room = roomInput.value.trim().toUpperCase();
  if (!room) {
    statusText.textContent = "Nhập mã phòng trước đã nhé";
    return;
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room, name: myName }));
    statusText.textContent = "Đang vào phòng...";
    logDebug(`WS đã mở, gửi join room=${room}`);
  };

  ws.onmessage = (event) => {
    logDebug(`Nhận: ${event.data.slice(0, 150)}`);
    handleServerMessage(JSON.parse(event.data));
  };

  ws.onclose = () => {
    statusText.textContent = "Mất kết nối server, thử tải lại trang";
    logDebug("WS đã đóng", true);
  };

  ws.onerror = (err) => {
    logDebug("WS lỗi: " + JSON.stringify(err), true);
  };
}

// ============ Xử lý message từ server ============
function handleServerMessage(msg) {
  switch (msg.type) {
    case "roomFull":
      statusText.textContent = "Phòng này đã có 2 người rồi, thử mã khác nhé";
      break;
	case 'scoreUpdate':
  scores = msg.scores;
  updateScoreboard();
  break;
    case "joined":
      isHost = msg.isHost;
      logDebug(`Đã join phòng, role: ${isHost ? "HOST" : "GUEST"}`);
      joinScreen.classList.add("hidden");
      gameScreen.classList.remove("hidden");
	  bgm.volume = 0.35;
	  bgm.play().catch(() => {});
      if (isHost) {
        turnIndicator.textContent = "Đang chờ người kia vào phòng...";
      } else {
        turnIndicator.textContent = "Đã vào phòng, đang đồng bộ...";
      }
      startVoiceCall(); // chuẩn bị mic, chờ peer để gọi
      break;

    case "peerJoined":
      logDebug("Người kia đã vào phòng");
      // có người thứ 2 vào -> nếu mình là host thì chia bài + bắt đầu gọi
      if (isHost) {
        setupNewGame();
        callPeer();
      }
      break;

    case "peerLeft":
      logDebug("Người kia đã rời phòng", true);
      turnIndicator.textContent = "Người kia đã rời phòng 😢";
      voiceStatus.textContent = "Voice: đã ngắt";
      break;

    case "flipCard":
      applyRemoteFlip(msg.index);
      break;
	case 'playersUpdate':
  playerNames[0] = msg.players[0] || 'Người chơi 1';
  playerNames[1] = msg.players[1] || 'Người chơi 2';
  updateScoreboard();
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
	scores = [0, 0];
updateScoreboard();
  const pairCount = cardCount / 2;
  const deck = [];

  for (let i = 0; i < pairCount; i++) {
    deck.push({ symbolIndex: i, isFaceUp: false, isMatched: false });
    deck.push({ symbolIndex: i, isFaceUp: false, isMatched: false });
  }

  shuffle(deck);
  cards = deck;
  isMyTurn = true;
  renderBoard();
  updateTurnIndicator();
  broadcastFullState(true);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function renderBoard() {
  const cols = Math.ceil(Math.sqrt(cards.length));
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
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
  playSound(flipSound);
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

  // cộng điểm
  if (isHost) scores[0] += 10;
  else scores[1] += 10;

  updateScoreboard();

  // gửi điểm sang người còn lại
  sendMessage({ type: 'scoreUpdate', scores });

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
    turnIndicator.textContent = "🎉 Hoàn thành màn!";
    playSound(winSound);

    let resultText = '';

if (scores[0] > scores[1]) {
  resultText = `🏆 ${playerNames[0]} thắng!`;
} else if (scores[1] > scores[0]) {
  resultText = `🏆 ${playerNames[1]} thắng!`;
} else {
  resultText = '🤝 Hòa!';
}

levelText.textContent =
  `Màn ${currentLevel} hoàn thành - ${cardCount} thẻ\n${resultText}`;

    winOverlay.classList.remove("hidden");

    setTimeout(() => {
      winOverlay.classList.add("hidden");

      // tăng màn
currentLevel++;

// lấy số thẻ theo danh sách LEVELS
const nextIndex = Math.min(currentLevel - 1, LEVELS.length - 1);
cardCount = LEVELS[nextIndex];

      if (isHost) {
        setupNewGame();
      }
    }, 2500);

    return;
  }

  turnIndicator.textContent =
    isMyTurn ? "👉 Lượt của bạn" : "⏳ Đang chờ người kia...";
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
let micReadyPromise = null;

function startVoiceCall() {
  // trả về 1 promise duy nhất, dùng lại nếu gọi nhiều lần
  if (!micReadyPromise) {
    micReadyPromise = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        localStream = stream;
        voiceStatus.textContent = "Voice: đã bật mic, chờ kết nối...";
        logDebug(`Mic OK, số audio track: ${stream.getAudioTracks().length}`);
        return stream;
      })
      .catch((err) => {
        voiceStatus.textContent = "Voice: không lấy được mic (kiểm tra quyền truy cập)";
        console.error(err);
        logDebug(`Lỗi lấy mic: ${err.name} - ${err.message}`, true);
        throw err;
      });
  }
  return micReadyPromise;
}

async function createPeerConnection() {
  // QUAN TRỌNG: phải đợi mic sẵn sàng trước khi tạo kết nối,
  // nếu không bên nào chưa có mic sẽ không gửi được audio track
  try {
    await startVoiceCall();
  } catch {
    // vẫn tiếp tục tạo kết nối dù không có mic, để ít nhất nghe được người kia
  }

  peerConnection = new RTCPeerConnection({
    iceServers: STUN_SERVERS,
    iceTransportPolicy: "relay" // ép đi qua TURN ngay từ đầu, bỏ qua bước thử p2p trực tiếp (hay fail vì 2 người khác mạng) để kết nối nhanh hơn
  });
  pendingCandidates = [];
  remoteDescriptionSet = false;
  disconnectTimer = null;
  logDebug("Đã tạo RTCPeerConnection mới");

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    logDebug(`Đã thêm ${localStream.getTracks().length} track local vào kết nối`);
  } else {
    logDebug("CẢNH BÁO: không có localStream, không gửi được audio", true);
  }

  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
    voiceStatus.textContent = "Voice: đã kết nối 🎧";
    logDebug(`ontrack: nhận được stream, số track: ${event.streams[0].getTracks().length}`);

    // Safari/iOS thường chặn autoplay -> thử play() thủ công, nếu bị chặn thì hiện nút bấm
    const playPromise = remoteAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        voiceStatus.textContent = "Voice: đã kết nối - bấm nút bên dưới để nghe";
        enableAudioBtn.classList.remove("hidden");
      });
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({ type: "webrtc-ice", candidate: event.candidate });
      logDebug(`Gửi ICE candidate: ${event.candidate.type} (${event.candidate.protocol})`);
    } else {
      logDebug("Đã gom xong tất cả ICE candidate (gathering complete)");
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    logDebug(`ICE connection state: ${peerConnection.iceConnectionState}`);
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("Connection state:", peerConnection.connectionState);
    logDebug(`Connection state: ${peerConnection.connectionState}`);

    if (peerConnection.connectionState === "connected") {
      // kết nối lại thành công -> hủy báo mất kết nối nếu đang chờ
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
      voiceStatus.textContent = "Voice: đã kết nối 🎧";
      return;
    }

    if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
      // "disconnected" có thể chỉ là chập chờn tạm thời (rebind mạng...) -> đợi 4s xem có tự phục hồi không
      // trước khi báo mất kết nối và thử ICE restart
      if (disconnectTimer) return;
      voiceStatus.textContent = "Voice: đang kết nối lại...";
      disconnectTimer = setTimeout(async () => {
        if (peerConnection && peerConnection.connectionState !== "connected") {
          voiceStatus.textContent = "Voice: mất kết nối, đang thử lại...";
          try {
            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);
            sendMessage({ type: "webrtc-offer", offer });
          } catch (err) {
            console.error("Lỗi thử kết nối lại:", err);
          }
        }
        disconnectTimer = null;
      }, 4000);
    }
  };
}

async function callPeer() {
  await createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  sendMessage({ type: "webrtc-offer", offer });
  logDebug("Đã gửi offer (mình là host, chủ động gọi)");
}

async function handleOffer(offer) {
  logDebug("Nhận offer, đang xử lý...");
  await createPeerConnection();
  await peerConnection.setRemoteDescription(offer);
  remoteDescriptionSet = true;
  await flushPendingCandidates();
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  sendMessage({ type: "webrtc-answer", answer });
  logDebug("Đã gửi answer");
}

async function handleAnswer(answer) {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(answer);
  remoteDescriptionSet = true;
  await flushPendingCandidates();
  logDebug("Đã nhận và xử lý answer");
}

async function handleRemoteIce(candidate) {
  if (!peerConnection || !remoteDescriptionSet) {
    // remoteDescription chưa sẵn sàng -> xếp hàng đợi, xử lý sau khi flushPendingCandidates() chạy
    pendingCandidates.push(candidate);
    logDebug(`Xếp hàng đợi 1 ICE candidate (chưa có remoteDescription), hàng đợi: ${pendingCandidates.length}`);
    return;
  }
  try {
    await peerConnection.addIceCandidate(candidate);
    logDebug("Đã thêm ICE candidate từ đối phương");
  } catch (err) {
    console.error("Lỗi ICE candidate:", err);
    logDebug(`Lỗi thêm ICE candidate: ${err.message}`, true);
  }
}

async function flushPendingCandidates() {
  logDebug(`Xử lý ${pendingCandidates.length} candidate đang chờ trong hàng đợi`);
  while (pendingCandidates.length > 0) {
    const candidate = pendingCandidates.shift();
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error("Lỗi ICE candidate (hàng đợi):", err);
      logDebug(`Lỗi ICE candidate trong hàng đợi: ${err.message}`, true);
    }
  }
}

muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
  muteBtn.classList.toggle("muted", isMuted);
  muteBtn.textContent = isMuted ? "🔇" : "🎤";
});

function updateScoreboard() {
  player1NameEl.textContent = playerNames[0];
  player2NameEl.textContent = playerNames[1];

  player1ScoreEl.textContent = scores[0];
  player2ScoreEl.textContent = scores[1];
}
