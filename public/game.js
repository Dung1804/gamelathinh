// ============ Cấu hình ============

// Mỗi bộ có đủ 24 biểu tượng để dùng được cho cả màn khó nhất (48 thẻ = 24 cặp)
const SYMBOL_SETS = {
  hoathinh: [
    "🤖","👽","👻","🎃","🧙‍♂️","🧛‍♂️","🧟‍♂️","🦸‍♂️",
    "🦹‍♂️","🧚‍♀️","🧞‍♂️","🐲","🦄","👑","🎭","🎪",
    "🎨","🎮","🕹️","🎲","🧩","🪄","⚡","🌟"
  ],
  convat: [
    "🐶","🐱","🐼","🐸","🦊","🐵","🐰","🐻",
    "🦁","🐯","🐨","🐷","🐮","🐔","🦆","🐢",
    "🐙","🦋","🐝","🐞","🦉","🐺","🦓","🦒"
  ],
  hoaqua: [
    "🍎","🍌","🍇","🍓","🍒","🍑","🍍","🥝",
    "🥥","🍉","🍋","🍐","🍈","🥭","🍊","🍏",
    "🫐","🍅","🌽","🥑","🥕","🍆","🫒","🍠"
  ],
  tonghop: [
    "🍎","🍌","🍇","🍓","🍒","🍉","🍋","🥭",
    "🐶","🐱","🐼","🦊","🐰","🦁","🐯","🐨",
    "🤖","👽","👻","🎃","🦄","👑","🎭","🌟"
  ]
};

const MODE_LABELS = {
  hoathinh: "🎭 Hoạt hình",
  convat: "🐾 Con vật",
  hoaqua: "🍎 Hoa quả",
  tonghop: "🎉 Tổng hợp",
  kyniem: "🖼️ Ảnh kỷ niệm"
};

let currentMode = "tonghop";
let currentSymbols = SYMBOL_SETS[currentMode];

// 'kyniem' không có bộ biểu tượng tĩnh trong SYMBOL_SETS (ảnh lấy từ kho, xây động lúc chia bài)
function isKnownMode(mode) {
  return !!SYMBOL_SETS[mode] || mode === 'kyniem';
}

function requiredPairsFor(count) {
  return count / 2;
}

function hasEnoughPhotos(count) {
  return memoryPhotos.length >= requiredPairsFor(count);
}

// ============ Kho ảnh kỷ niệm (dùng chung cho cả web, lưu trên server) ============
let memoryPhotos = []; // [{id, url, uploader}]

async function fetchMemoryPhotos() {
  try {
    const res = await fetch('/api/photos');
    const data = await res.json();
    memoryPhotos = Array.isArray(data.photos) ? data.photos : [];
  } catch {
    memoryPhotos = [];
  }
  updatePhotoCountLabels();
  return memoryPhotos;
}

function updatePhotoCountLabels() {
  const n = memoryPhotos.length;
  if (photoCountJoinEl) photoCountJoinEl.textContent = n;
  if (photoCountInGameEl) photoCountInGameEl.textContent = n;
}

function updateKyniemWarning(scope) {
  const isJoin = scope === 'join';
  const mode = isJoin
    ? currentMode
    : document.querySelector('#inGameModeOptions .mode-btn.active')?.dataset.mode;
  const levelIdx = isJoin
    ? selectedLevelIndex
    : Number(document.querySelector('#inGameLevelOptions .level-btn.active')?.dataset.level ?? 0);
  const count = LEVELS[levelIdx] ?? LEVELS[0];
  const warningEl = isJoin ? kyniemWarningJoinEl : kyniemWarningInGameEl;
  if (!warningEl) return;

  if (mode === 'kyniem' && !hasEnoughPhotos(count)) {
    warningEl.textContent = `⚠️ Màn này cần ${requiredPairsFor(count)} ảnh khác nhau, kho hiện chỉ có ${memoryPhotos.length}. Hãy vào "Quản lý kho ảnh" để up thêm nhé.`;
    warningEl.classList.remove('hidden');
  } else {
    warningEl.classList.add('hidden');
  }
}

const LEVELS = [20, 24, 30, 36, 42, 48];
let cardCount = LEVELS[0]; // bắt đầu 20 thẻ
let selectedLevelIndex = 0; // màn được chọn ở màn hình vào phòng / đổi chế độ (0 = Màn 1)

// số màn hiện tại luôn được suy ra trực tiếp từ cardCount (nguồn dữ liệu đã đồng bộ qua mạng),
// không dùng biến đếm riêng nữa để tránh bị lệch giữa các máy
function getLevelNumber(count) {
  const idx = LEVELS.indexOf(count);
  return idx === -1 ? null : idx + 1;
}
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
let streaks = [0, 0]; // combo hiện tại của mỗi người, reset về 0 khi đoán sai hoặc bắt đầu màn mới
let lastScorerIsHost = null; // ai vừa ăn được cặp gần nhất, dùng để phân định khi hòa điểm
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
const modeBtns = document.querySelectorAll('#joinModeOptions .mode-btn');
const modeIndicator = document.getElementById('modeIndicator');
const levelIndicator = document.getElementById('levelIndicator');
const changeModeBtn = document.getElementById('changeModeBtn');
const changeModeOverlay = document.getElementById('changeModeOverlay');
const closeChangeModeBtn = document.getElementById('closeChangeModeBtn');
const inGameModeBtns = document.querySelectorAll('#inGameModeOptions .mode-btn');
const joinLevelBtns = document.querySelectorAll('#joinLevelOptions .level-btn');
const inGameLevelBtns = document.querySelectorAll('#inGameLevelOptions .level-btn');
const confirmChangeModeBtn = document.getElementById('confirmChangeModeBtn');
const kyniemWarningJoinEl = document.getElementById('kyniemWarningJoin');
const kyniemWarningInGameEl = document.getElementById('kyniemWarningInGame');

const photoCountJoinEl = document.getElementById('photoCountJoin');
const photoCountInGameEl = document.getElementById('photoCountInGame');
const openPhotoLibraryBtn = document.getElementById('openPhotoLibraryBtn');
const openPhotoLibraryBtnInGame = document.getElementById('openPhotoLibraryBtnInGame');
const photoLibraryOverlay = document.getElementById('photoLibraryOverlay');
const closePhotoLibraryBtn = document.getElementById('closePhotoLibraryBtn');
const photoUploadInput = document.getElementById('photoUploadInput');
const photoUploadStatus = document.getElementById('photoUploadStatus');
const photoGridEl = document.getElementById('photoGrid');

const player1NameEl = document.getElementById('player1Name');
const player2NameEl = document.getElementById('player2Name');
const player1ScoreEl = document.getElementById('player1Score');
const player2ScoreEl = document.getElementById('player2Score');
const player1StreakEl = document.getElementById('player1Streak');
const player2StreakEl = document.getElementById('player2Streak');
const joinBtn = document.getElementById("joinBtn");
const statusText = document.getElementById("statusText");
const boardEl = document.getElementById("board");
const turnIndicator = document.getElementById("turnIndicator");
const muteBtn = document.getElementById("muteBtn");
const musicToggleBtn = document.getElementById("musicToggleBtn");
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

// ---------- Âm thanh combo (tổng hợp bằng Web Audio, không cần file mp3 mới) ----------
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// cao độ tăng dần theo combo (chặn ở combo 8 cho đỡ chói tai)
function playComboTone(streak) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 520 + Math.min(streak, 8) * 70;
  gain.gain.value = 0.16;
  osc.connect(gain).connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  osc.start(now);
  osc.stop(now + 0.3);
}

// tiếng trầm nhẹ khi đoán sai
function playMissTone() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 180;
  gain.gain.value = 0.12;
  osc.connect(gain).connect(ctx.destination);
  const now = ctx.currentTime;
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc.start(now);
  osc.stop(now + 0.26);
}

// ---------- Confetti nhỏ khi ăn cặp (nhiều hơn theo combo) ----------
function launchConfetti(count = 14) {
  const container = document.createElement('div');
  container.className = 'confetti-burst';
  document.body.appendChild(container);
  const colors = ['#ff5d8f', '#ffce54', '#4fc3f7', '#81c784', '#ba68c8'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${42 + Math.random() * 16}%`;
    piece.style.top = `${18 + Math.random() * 12}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
    piece.style.setProperty('--rot', `${(Math.random() - 0.5) * 540}deg`);
    piece.style.animationDelay = `${Math.random() * 120}ms`;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 1400);
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

// ============ Chọn chế độ chơi ============
modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    updateKyniemWarning('join');
  });
});

joinLevelBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    joinLevelBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedLevelIndex = Number(btn.dataset.level);
    updateKyniemWarning('join');
  });
});

// ============ Đổi chế độ chơi giữa chừng (không cần rời phòng) ============
changeModeBtn.addEventListener("click", () => {
  inGameModeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === currentMode));
  const curLevelIdx = Math.max(0, LEVELS.indexOf(cardCount));
  inGameLevelBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.level) === curLevelIdx));
  changeModeOverlay.classList.remove("hidden");
  updateKyniemWarning('inGame');
});

closeChangeModeBtn.addEventListener("click", () => {
  changeModeOverlay.classList.add("hidden");
});

inGameModeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    inGameModeBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    updateKyniemWarning('inGame');
  });
});

inGameLevelBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    inGameLevelBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    updateKyniemWarning('inGame');
  });
});

confirmChangeModeBtn.addEventListener("click", async () => {
  const chosenModeBtn = document.querySelector('#inGameModeOptions .mode-btn.active');
  const chosenLevelBtn = document.querySelector('#inGameLevelOptions .level-btn.active');
  const newMode = chosenModeBtn ? chosenModeBtn.dataset.mode : currentMode;
  const newLevelIndex = chosenLevelBtn ? Number(chosenLevelBtn.dataset.level) : 0;
  const neededCardCount = LEVELS[newLevelIndex] ?? LEVELS[0];

  if (newMode === 'kyniem') {
    await fetchMemoryPhotos(); // kiểm tra lại số ảnh mới nhất trước khi bắt đầu
    if (!hasEnoughPhotos(neededCardCount)) {
      updateKyniemWarning('inGame');
      return; // không đóng overlay, không áp dụng
    }
  }

  changeModeOverlay.classList.add("hidden");
  applyModeChange(newMode, newLevelIndex);
});

function applyModeChange(newMode, levelIndex = 0) {
  if (isHost) {
    currentMode = isKnownMode(newMode) ? newMode : currentMode;
    currentSymbols = SYMBOL_SETS[currentMode] || [];
    modeIndicator.textContent = MODE_LABELS[currentMode];
    cardCount = LEVELS[levelIndex] ?? LEVELS[0];
    setupNewGame();
  } else {
    sendMessage({ type: "changeModeRequest", mode: newMode, level: levelIndex });
    turnIndicator.textContent = "Đã gửi yêu cầu đổi chế độ, đang chờ xác nhận...";
  }
}

// ============ Join room ============
joinBtn.addEventListener("click", joinRoom);
roomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });

async function joinRoom() {
	myName = playerNameInput.value.trim() || 'Khách';
  const room = roomInput.value.trim().toUpperCase();
  if (!room) {
    statusText.textContent = "Nhập mã phòng trước đã nhé";
    return;
  }
  cardCount = LEVELS[selectedLevelIndex] ?? LEVELS[0];

  if (currentMode === 'kyniem') {
    await fetchMemoryPhotos();
    if (!hasEnoughPhotos(cardCount)) {
      updateKyniemWarning('join');
      statusText.textContent = `Kho ảnh chưa đủ (cần ${requiredPairsFor(cardCount)} ảnh, hiện có ${memoryPhotos.length}). Hãy up thêm ảnh trước đã nhé.`;
      return;
    }
  }

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room, name: myName, mode: currentMode }));
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
  if (Array.isArray(msg.streaks)) streaks = msg.streaks;
  updateScoreboard();
  break;
    case "joined":
      isHost = msg.isHost;
      // server luôn trả về chế độ chơi thật sự của phòng (do người vào trước quyết định)
      currentMode = isKnownMode(msg.mode) ? msg.mode : "tonghop";
      currentSymbols = SYMBOL_SETS[currentMode] || []; // với 'kyniem', danh sách ảnh thật sẽ đến từ syncFullState
      modeIndicator.textContent = MODE_LABELS[currentMode];
      fetchMemoryPhotos(); // để sẵn kho ảnh phòng khi cần đổi chế độ giữa chừng
      logDebug(`Đã join phòng, role: ${isHost ? "HOST" : "GUEST"}, chế độ: ${currentMode}`);
      joinScreen.classList.add("hidden");
      gameScreen.classList.remove("hidden");
	  bgm.volume = 0.35;
	  bgm.play().catch(() => {});
      if (isHost) {
        turnIndicator.textContent = "Đang chờ người kia vào phòng...";
        setBoardWaiting("⏳ Đang chờ người chơi khác vào phòng...");
      } else {
        turnIndicator.textContent = "Đã vào phòng, đang đồng bộ...";
        setBoardWaiting("⏳ Đang đồng bộ trò chơi...");
      }
      levelIndicator.textContent = `Màn ${getLevelNumber(cardCount) ?? 1}/${LEVELS.length}`;
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

    case "changeModeRequest":
      // chỉ host mới thực sự áp dụng thay đổi để tránh 2 bên tự set lệch nhau
      if (isHost && isKnownMode(msg.mode)) {
        const lvlIdx = Number.isInteger(msg.level) ? msg.level : 0;
        const requestedCardCount = LEVELS[lvlIdx] ?? LEVELS[0];

        const proceed = () => {
          if (msg.mode === 'kyniem' && !hasEnoughPhotos(requestedCardCount)) {
            sendMessage({
              type: 'changeModeRejected',
              reason: `Kho ảnh chưa đủ (cần ${requiredPairsFor(requestedCardCount)} ảnh, hiện có ${memoryPhotos.length})`,
            });
            return;
          }
          currentMode = msg.mode;
          currentSymbols = SYMBOL_SETS[currentMode] || [];
          modeIndicator.textContent = MODE_LABELS[currentMode];
          cardCount = requestedCardCount;
          setupNewGame();
        };

        if (msg.mode === 'kyniem') {
          fetchMemoryPhotos().then(proceed); // kiểm tra lại số ảnh mới nhất phía host trước khi áp dụng
        } else {
          proceed();
        }
      }
      break;

    case "changeModeRejected":
      turnIndicator.textContent = `❌ ${msg.reason || "Không thể đổi chế độ"}`;
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
      if (msg.mode && isKnownMode(msg.mode)) {
        currentMode = msg.mode;
        modeIndicator.textContent = MODE_LABELS[currentMode];
      }
      if (currentMode === 'kyniem') {
        if (Array.isArray(msg.symbols)) currentSymbols = msg.symbols;
      } else {
        currentSymbols = SYMBOL_SETS[currentMode] || [];
      }
      if (Array.isArray(msg.scores)) {
        scores = msg.scores;
        updateScoreboard();
      }
      if (Array.isArray(msg.streaks)) {
        streaks = msg.streaks;
        updateScoreboard();
      }
      if (typeof msg.lastScorerIsHost === 'boolean') {
        lastScorerIsHost = msg.lastScorerIsHost;
      }
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
function setupNewGame(resetScores = true, starterIsHost = true) {
	if (resetScores) scores = [0, 0];
streaks = [0, 0]; // bàn mới thì combo reset về 0
updateScoreboard();
  const pairCount = cardCount / 2;
  currentSymbols = buildPairSymbols(pairCount);

  const deck = [];
  for (let i = 0; i < pairCount; i++) {
    deck.push({ symbolIndex: i, isFaceUp: false, isMatched: false });
    deck.push({ symbolIndex: i, isFaceUp: false, isMatched: false });
  }

  shuffle(deck);
  cards = deck;
  renderBoard();
  broadcastFullState(starterIsHost); // set isMyTurn đúng theo người bắt đầu + đồng bộ sang người kia
}

// chọn ngẫu nhiên đủ số ảnh cần cho màn hiện tại; nếu vì lý do gì đó (vd ảnh vừa bị xoá) không đủ nữa
// thì an toàn rơi về chế độ Tổng hợp thay vì làm vỡ bàn chơi
function buildPairSymbols(pairCount) {
  if (currentMode === 'kyniem') {
    if (memoryPhotos.length >= pairCount) {
      const picked = [...memoryPhotos];
      shuffle(picked);
      return picked.slice(0, pairCount).map((p) => p.url);
    }
    currentMode = 'tonghop';
    modeIndicator.textContent = MODE_LABELS[currentMode];
  }
  return SYMBOL_SETS[currentMode].slice(0, pairCount);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getColsForCount(count) {
  let cols = 4;
  if (count === 20) cols = 5;      // 5 x 4
  else if (count === 24) cols = 6; // 6 x 4
  else if (count === 30) cols = 6; // 6 x 5
  else if (count === 36) cols = 6; // 6 x 6
  else if (count === 42) cols = 7; // 7 x 6
  else if (count >= 48) cols = 8;  // 8 x 6
  return cols;
}

// đo độ rộng thực tế của board sau khi render rồi tính cỡ chữ emoji theo px,
// KHÔNG dùng vw vì viewport rộng (PC) khác hẳn độ rộng thật của từng ô (do có max-width)
function updateCardFontSize(cols) {
  const boardWidth = boardEl.clientWidth;
  if (!boardWidth || !cols) return;
  const gapPx = 8; // phải khớp với "gap" trong CSS .board
  const cardWidth = (boardWidth - gapPx * (cols - 1)) / cols;
  const fontSize = Math.max(14, Math.min(34, cardWidth * 0.42));
  boardEl.style.setProperty('--emoji-size', `${fontSize}px`);
}

window.addEventListener('resize', () => {
  if (cards.length) updateCardFontSize(getColsForCount(cards.length));
});

function renderBoard() {
 let cols = getColsForCount(cards.length);

boardEl.classList.remove("waiting");
boardEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  boardEl.innerHTML = "";
  cards.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card" + (card.isFaceUp || card.isMatched ? " flipped" : "") + (card.isMatched ? " matched" : "");
    cardEl.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-back"></div>
        <div class="card-face card-front">${
          currentMode === 'kyniem'
            ? `<img class="card-photo-img" src="${currentSymbols[card.symbolIndex] || ''}" alt="" draggable="false" />`
            : (currentSymbols[card.symbolIndex] || '')
        }</div>
      </div>
    `;
    cardEl.addEventListener("click", () => onCardClick(index));
    boardEl.appendChild(cardEl);
  });

  // hiện màn đang chơi dựa trên số thẻ thực tế, luôn đúng dù đổi chế độ hay đồng bộ lại
  const idx = LEVELS.indexOf(cards.length);
  levelIndicator.textContent = `Màn ${idx === -1 ? "?" : idx + 1}/${LEVELS.length}`;

  updateCardFontSize(cols);
}

function setBoardWaiting(text) {
  boardEl.classList.add("waiting");
  boardEl.innerHTML = `<div class="board-placeholder">${text}</div>`;
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
  const myIdx = isHost ? 0 : 1;

  if (match) {
    cards[i1].isMatched = true;
    cards[i2].isMatched = true;

    // combo: ăn liên tiếp không trượt thì được cộng thêm điểm thưởng
    streaks[myIdx] += 1;
    const bonus = (streaks[myIdx] - 1) * 5;
    scores[myIdx] += 10 + bonus;
    lastScorerIsHost = isHost; // ghi nhận ai vừa ăn cặp này, dùng để xử lý hòa điểm sau này

    updateScoreboard();

    // gửi điểm + combo sang người còn lại
    sendMessage({ type: 'scoreUpdate', scores, streaks });

    lockBoard = false;
    renderBoard();

    // hiệu ứng: âm thanh nền + tiếng combo tăng cao độ theo streak, confetti, thẻ nảy lên
    playSound(matchSound);
    playComboTone(streaks[myIdx]);
    launchConfetti(Math.min(10 + streaks[myIdx] * 4, 40));
    [i1, i2].forEach((idx) => {
      const el = boardEl.children[idx];
      if (!el) return;
      el.classList.add('match-pop');
      setTimeout(() => el.classList.remove('match-pop'), 400);
    });

    broadcastFullState(isHost); // vẫn giữ lượt hiện tại
  } else {
    // đoán sai: mất combo ngay lập tức, phản hồi bằng rung nhẹ + âm thanh trầm
    streaks[myIdx] = 0;
    updateScoreboard();
    playMissTone();
    [i1, i2].forEach((idx) => {
      const el = boardEl.children[idx];
      if (!el) return;
      el.classList.add('miss-shake');
      setTimeout(() => el.classList.remove('miss-shake'), 400);
    });

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
  const payload = { type: "syncFullState", cards, turnIsHost, mode: currentMode, scores, streaks, lastScorerIsHost };
  if (currentMode === 'kyniem') payload.symbols = currentSymbols; // để bên kia dùng đúng y hệt bộ ảnh này
  sendMessage(payload);
  isMyTurn = (turnIsHost === isHost);
  updateTurnIndicator();
}

function updateTurnIndicator() {
  const allMatched = cards.length > 0 && cards.every(c => c.isMatched);

  if (allMatched) {
    turnIndicator.textContent = "🎉 Hoàn thành màn!";
    playSound(winSound);

    let resultText = '';
let winnerIsHost = null; // null = hòa

if (scores[0] > scores[1]) {
  resultText = `🏆 ${playerNames[0]} thắng!`;
  winnerIsHost = true;
} else if (scores[1] > scores[0]) {
  resultText = `🏆 ${playerNames[1]} thắng!`;
  winnerIsHost = false;
} else {
  resultText = '🤝 Hòa!';
}

// ai thắng thì màn sau được đánh trước; nếu hòa thì lấy người vừa ăn cặp cuối cùng
const nextStarterIsHost = winnerIsHost !== null ? winnerIsHost : (lastScorerIsHost ?? true);

const finishedIdx = LEVELS.indexOf(cardCount);
const finishedLevelNumber = finishedIdx === -1 ? '?' : finishedIdx + 1;

levelText.textContent =
  `Màn ${finishedLevelNumber} hoàn thành - ${cardCount} thẻ\n${resultText}`;

    winOverlay.classList.remove("hidden");

    setTimeout(() => {
      winOverlay.classList.add("hidden");

      // sang màn kế tiếp, tính lại từ cardCount thực tế nên không thể lệch pha giữa 2 máy
      const nextIdx = Math.min(finishedIdx === -1 ? 0 : finishedIdx + 1, LEVELS.length - 1);
      cardCount = LEVELS[nextIdx];

      if (isHost) {
        setupNewGame(false, nextStarterIsHost); // qua màn: giữ điểm, đổi người đánh trước theo kết quả màn vừa xong
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

let isMusicMuted = false;
musicToggleBtn.addEventListener("click", () => {
  isMusicMuted = !isMusicMuted;
  bgm.muted = isMusicMuted;
  musicToggleBtn.classList.toggle("muted", isMusicMuted);
  musicToggleBtn.textContent = isMusicMuted ? "🔇" : "🎵";
});

function updateScoreboard() {
  player1NameEl.textContent = playerNames[0];
  player2NameEl.textContent = playerNames[1];

  player1ScoreEl.textContent = scores[0];
  player2ScoreEl.textContent = scores[1];

  updateStreakBadge(player1StreakEl, streaks[0]);
  updateStreakBadge(player2StreakEl, streaks[1]);
}

function updateStreakBadge(el, streak) {
  if (streak >= 2) {
    el.textContent = `🔥 Combo x${streak}`;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

// ============ Quản lý kho ảnh kỷ niệm ============
openPhotoLibraryBtn.addEventListener('click', openPhotoLibrary);
openPhotoLibraryBtnInGame.addEventListener('click', openPhotoLibrary);

closePhotoLibraryBtn.addEventListener('click', () => {
  photoLibraryOverlay.classList.add('hidden');
});

async function openPhotoLibrary() {
  photoLibraryOverlay.classList.remove('hidden');
  photoUploadStatus.textContent = 'Đang tải danh sách ảnh...';
  await fetchMemoryPhotos();
  photoUploadStatus.textContent = '';
  renderPhotoGrid();
  updateKyniemWarning('join');
  updateKyniemWarning('inGame');
}

function renderPhotoGrid() {
  photoGridEl.innerHTML = '';
  memoryPhotos.forEach((photo) => {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML = `
      <img src="${photo.url}" alt="" loading="lazy" />
      <button type="button" class="delete-photo-btn" data-id="${photo.id}">✕</button>
    `;
    photoGridEl.appendChild(thumb);
  });
}

photoGridEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete-photo-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  btn.disabled = true;
  try {
    await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    memoryPhotos = memoryPhotos.filter((p) => p.id !== id);
    updatePhotoCountLabels();
    renderPhotoGrid();
    updateKyniemWarning('join');
    updateKyniemWarning('inGame');
  } catch {
    photoUploadStatus.textContent = 'Xoá ảnh thất bại, thử lại nhé';
  }
});

photoUploadInput.addEventListener('change', async () => {
  const files = Array.from(photoUploadInput.files || []);
  if (!files.length) return;

  let done = 0;
  photoUploadStatus.textContent = `Đang tải lên 0/${files.length}...`;

  for (const file of files) {
    try {
      const dataUrl = await resizeImageToDataUrl(file, 480, 0.8);
      const res = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, uploader: myName || 'Khách' }),
      });
      const data = await res.json();
      if (data.photo) {
        memoryPhotos.push(data.photo);
        renderPhotoGrid();
        updatePhotoCountLabels();
      }
    } catch {
      // bỏ qua ảnh lỗi, tiếp tục up ảnh tiếp theo
    }
    done++;
    photoUploadStatus.textContent = `Đang tải lên ${done}/${files.length}...`;
  }

  photoUploadStatus.textContent = `Đã up xong ${files.length} ảnh ✅`;
  photoUploadInput.value = '';
  updateKyniemWarning('join');
  updateKyniemWarning('inGame');
});

// nén & resize ảnh trước khi up (đỡ tốn dung lượng server + tải nhanh trong lúc chơi)
function resizeImageToDataUrl(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height >= width && height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// tải sẵn số lượng ảnh hiện có ngay khi mở trang để màn hình vào phòng hiện đúng số
fetchMemoryPhotos().then(() => updateKyniemWarning('join'));
