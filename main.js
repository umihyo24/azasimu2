const CONFIG = Object.freeze({
  gridSize: 30,
  tileSize: 24,
  canvasSize: 720,
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  half: 0.5,
  quarter: 0.25,
  millisecondsPerSecond: 1000,
  shallowStartY: 8,
  sandStartY: 12,
  grassStartY: 18,
  riverMinX: 13,
  riverMaxX: 15,
  fishMax: 10,
  fishInitialMin: 5,
  fishRegenPerSecond: 0.18,
  fishCatchBase: 3,
  fishLowEfficiencyThreshold: 0.35,
  fishLowEfficiencyMultiplier: 0.45,
  storageX: 21,
  storageY: 20,
  storageCapacity: 40,
  sealStartX: 20,
  sealStartY: 21,
  hungerStart: 24,
  hungerMax: 100,
  hungerPerSecond: 0.9,
  hungryThreshold: 52,
  eatAmount: 34,
  eatFishCost: 1,
  fatiguePerSecond: 0.12,
  moveInterval: 0.16,
  actionInterval: 0.75,
  idleInterval: 1.1,
  dayLengthSeconds: 80,
  victoryDays: 3,
  secondsPerDayHour: 24,
  minutesPerHour: 60,
  textPad: 8,
  selectedLineHeight: 17,
  entityInset: 4,
  sealRadius: 8,
  fishDotRadius: 2,
  storageInset: 5,
  terrainNoiseMod: 7,
  terrainNoiseCutoff: 2,
  fishNoiseMultiplierX: 17,
  fishNoiseMultiplierY: 11,
  fishNoiseMod: 6,
  minCatch: 0.4,
  maxDeltaSeconds: 0.08
});

const TERRAIN = Object.freeze({
  sea: Object.freeze({ name: "sea", color: "#19557a" }),
  shallow: Object.freeze({ name: "shallow", color: "#39a7bd" }),
  sand: Object.freeze({ name: "sand", color: "#d8bf7b" }),
  grass: Object.freeze({ name: "grass", color: "#5b9b55" })
});

const ASSET_KEYS = Object.freeze({
  seal: "monsters.seal_colony_unit_idle",
  storage: "cards.storage_food_colony_idle"
});

function createImage(assetKey) {
  const parts = String(assetKey ?? "").split(".");
  const category = parts[CONFIG.zero] ?? "cards";
  const fileName = parts[CONFIG.one] ?? "missing_asset";
  const image = new Image();
  image.dataset.loaded = "false";
  image.addEventListener("load", () => {
    image.dataset.loaded = "true";
  });
  image.addEventListener("error", () => {
    image.dataset.loaded = "false";
  });
  image.src = `/assets/${category}/${fileName}.png`;
  return image;
}

const assets = Object.freeze({
  seal: createImage(ASSET_KEYS.seal),
  storage: createImage(ASSET_KEYS.storage)
});

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const ui = Object.freeze({
  phase: document.getElementById("phaseText"),
  day: document.getElementById("dayText"),
  time: document.getElementById("timeText"),
  storage: document.getElementById("storageText"),
  hunger: document.getElementById("hungerText"),
  task: document.getElementById("taskText"),
  tile: document.getElementById("tileText"),
  gameOverTitle: document.getElementById("gameOverTitle"),
  gameOverMessage: document.getElementById("gameOverMessage")
});

let gameState = createInitialState();

function createInitialState() {
  return {
    phase: "start",
    elapsedSeconds: CONFIG.zero,
    message: "",
    selectedTile: null,
    lastFrameTime: performance.now(),
    map: createMap(),
    storage: {
      x: CONFIG.storageX,
      y: CONFIG.storageY,
      fish: CONFIG.zero,
      capacity: CONFIG.storageCapacity
    },
    seal: {
      x: CONFIG.sealStartX,
      y: CONFIG.sealStartY,
      hunger: CONFIG.hungerStart,
      fatigue: CONFIG.zero,
      carriedItem: null,
      currentTask: "waiting",
      target: null,
      moveTimer: CONFIG.zero,
      actionTimer: CONFIG.zero,
      idleTimer: CONFIG.zero
    }
  };
}

function createMap() {
  const map = [];
  for (let y = CONFIG.zero; y < CONFIG.gridSize; y += CONFIG.one) {
    const row = [];
    for (let x = CONFIG.zero; x < CONFIG.gridSize; x += CONFIG.one) {
      const terrain = chooseTerrain(x, y);
      row.push({
        terrain,
        fish: terrain === TERRAIN.shallow.name ? initialFish(x, y) : CONFIG.zero
      });
    }
    map.push(row);
  }
  return map;
}

function chooseTerrain(x, y) {
  if (y < CONFIG.shallowStartY) {
    return TERRAIN.sea.name;
  }
  if (y < CONFIG.sandStartY) {
    return TERRAIN.shallow.name;
  }
  if (x >= CONFIG.riverMinX && x <= CONFIG.riverMaxX && y < CONFIG.grassStartY) {
    return TERRAIN.shallow.name;
  }
  if (y < CONFIG.grassStartY) {
    return TERRAIN.sand.name;
  }
  const noise = (x + y) % CONFIG.terrainNoiseMod;
  return noise < CONFIG.terrainNoiseCutoff ? TERRAIN.sand.name : TERRAIN.grass.name;
}

function initialFish(x, y) {
  const noise = (x * CONFIG.fishNoiseMultiplierX + y * CONFIG.fishNoiseMultiplierY) % CONFIG.fishNoiseMod;
  return Math.min(CONFIG.fishMax, CONFIG.fishInitialMin + noise);
}

function startGame() {
  gameState = createInitialState();
  gameState.phase = "playing";
}

function restartGame() {
  gameState = createInitialState();
  gameState.phase = "playing";
}

function update(deltaSeconds) {
  if (gameState.phase !== "playing") {
    return;
  }

  gameState.elapsedSeconds += deltaSeconds;
  recoverFish(deltaSeconds);
  updateSeal(deltaSeconds);
  checkGameEnd();
}

function recoverFish(deltaSeconds) {
  const map = gameState.map;
  for (let y = CONFIG.zero; y < map.length; y += CONFIG.one) {
    const row = map[y];
    if (!row) {
      continue;
    }
    for (let x = CONFIG.zero; x < row.length; x += CONFIG.one) {
      const tile = row[x];
      if (tile?.terrain === TERRAIN.shallow.name) {
        tile.fish = Math.min(CONFIG.fishMax, tile.fish + CONFIG.fishRegenPerSecond * deltaSeconds);
      }
    }
  }
}

function updateSeal(deltaSeconds) {
  const seal = gameState.seal;
  seal.hunger = Math.min(CONFIG.hungerMax, seal.hunger + CONFIG.hungerPerSecond * deltaSeconds);
  seal.fatigue += CONFIG.fatiguePerSecond * deltaSeconds;

  if (seal.idleTimer > CONFIG.zero) {
    seal.idleTimer = Math.max(CONFIG.zero, seal.idleTimer - deltaSeconds);
    seal.currentTask = "resting briefly";
    return;
  }

  chooseSealTask();
  moveSeal(deltaSeconds);
  performSealAction(deltaSeconds);
}

function chooseSealTask() {
  const seal = gameState.seal;
  const storage = gameState.storage;

  if (seal.carriedItem?.type === "fish") {
    seal.currentTask = "delivering fish";
    seal.target = { x: storage.x, y: storage.y, kind: "storage" };
    return;
  }

  if (seal.hunger >= CONFIG.hungryThreshold && storage.fish >= CONFIG.eatFishCost) {
    seal.currentTask = "going to eat";
    seal.target = { x: storage.x, y: storage.y, kind: "eat" };
    return;
  }

  if (storage.fish >= storage.capacity) {
    seal.currentTask = "storage full";
    seal.target = null;
    seal.idleTimer = CONFIG.idleInterval;
    return;
  }

  const fishTile = findBestFishTile();
  if (fishTile) {
    seal.currentTask = "going fishing";
    seal.target = { x: fishTile.x, y: fishTile.y, kind: "fish" };
    return;
  }

  seal.currentTask = "waiting for fish";
  seal.target = null;
  seal.idleTimer = CONFIG.idleInterval;
}

function findBestFishTile() {
  let bestTile = null;
  let bestScore = -CONFIG.one;
  const map = gameState.map;
  const seal = gameState.seal;

  for (let y = CONFIG.zero; y < map.length; y += CONFIG.one) {
    const row = map[y];
    if (!row) {
      continue;
    }
    for (let x = CONFIG.zero; x < row.length; x += CONFIG.one) {
      const tile = row[x];
      if (tile?.terrain !== TERRAIN.shallow.name || tile.fish <= CONFIG.zero) {
        continue;
      }
      const distance = Math.abs(seal.x - x) + Math.abs(seal.y - y);
      const score = tile.fish - distance * CONFIG.quarter;
      if (score > bestScore) {
        bestScore = score;
        bestTile = { x, y };
      }
    }
  }
  return bestTile;
}

function moveSeal(deltaSeconds) {
  const seal = gameState.seal;
  const target = seal.target;
  if (!target || (seal.x === target.x && seal.y === target.y)) {
    return;
  }

  seal.moveTimer += deltaSeconds;
  if (seal.moveTimer < CONFIG.moveInterval) {
    return;
  }
  seal.moveTimer = CONFIG.zero;

  if (seal.x !== target.x) {
    seal.x += seal.x < target.x ? CONFIG.one : -CONFIG.one;
    return;
  }
  if (seal.y !== target.y) {
    seal.y += seal.y < target.y ? CONFIG.one : -CONFIG.one;
  }
}

function performSealAction(deltaSeconds) {
  const seal = gameState.seal;
  const target = seal.target;
  if (!target || seal.x !== target.x || seal.y !== target.y) {
    seal.actionTimer = CONFIG.zero;
    return;
  }

  seal.actionTimer += deltaSeconds;
  if (seal.actionTimer < CONFIG.actionInterval) {
    return;
  }
  seal.actionTimer = CONFIG.zero;

  if (target.kind === "fish") {
    catchFishAt(target.x, target.y);
  } else if (target.kind === "storage") {
    depositFish();
  } else if (target.kind === "eat") {
    eatFromStorage();
  }
}

function catchFishAt(x, y) {
  const tile = getTile(x, y);
  if (tile?.terrain !== TERRAIN.shallow.name || tile.fish <= CONFIG.zero || gameState.seal.carriedItem) {
    return;
  }
  const fishRatio = tile.fish / CONFIG.fishMax;
  const efficiency = fishRatio < CONFIG.fishLowEfficiencyThreshold ? CONFIG.fishLowEfficiencyMultiplier : CONFIG.one;
  const catchAmount = Math.min(tile.fish, Math.max(CONFIG.minCatch, CONFIG.fishCatchBase * efficiency * fishRatio));
  tile.fish = Math.max(CONFIG.zero, tile.fish - catchAmount);
  gameState.seal.carriedItem = { type: "fish", amount: catchAmount };
  gameState.seal.currentTask = "caught fish";
}

function depositFish() {
  const seal = gameState.seal;
  const carriedAmount = seal.carriedItem?.type === "fish" ? seal.carriedItem.amount : CONFIG.zero;
  if (carriedAmount <= CONFIG.zero) {
    return;
  }
  const freeSpace = Math.max(CONFIG.zero, gameState.storage.capacity - gameState.storage.fish);
  const deposited = Math.min(freeSpace, carriedAmount);
  gameState.storage.fish += deposited;
  const remainder = carriedAmount - deposited;
  seal.carriedItem = remainder > CONFIG.zero ? { type: "fish", amount: remainder } : null;
  seal.currentTask = remainder > CONFIG.zero ? "storage full" : "deposited fish";
  if (remainder > CONFIG.zero) {
    seal.idleTimer = CONFIG.idleInterval;
  }
}

function eatFromStorage() {
  const seal = gameState.seal;
  if (gameState.storage.fish < CONFIG.eatFishCost) {
    seal.currentTask = "needs fish";
    return;
  }
  gameState.storage.fish -= CONFIG.eatFishCost;
  seal.hunger = Math.max(CONFIG.zero, seal.hunger - CONFIG.eatAmount);
  seal.currentTask = "eating";
}

function checkGameEnd() {
  if (gameState.seal.hunger >= CONFIG.hungerMax) {
    endGame("The seal became too hungry. The colony did not survive.");
    return;
  }

  if (gameState.elapsedSeconds >= CONFIG.dayLengthSeconds * CONFIG.victoryDays) {
    endGame("Victory! The colony survived for 3 in-game days.");
  }
}

function endGame(message) {
  gameState.phase = "gameover";
  gameState.message = message;
}

function render() {
  drawMap();
  drawStorage();
  drawSeal();
  drawSelection();
}

function drawMap() {
  ctx.clearRect(CONFIG.zero, CONFIG.zero, CONFIG.canvasSize, CONFIG.canvasSize);
  const map = gameState.map;
  for (let y = CONFIG.zero; y < map.length; y += CONFIG.one) {
    const row = map[y];
    if (!row) {
      continue;
    }
    for (let x = CONFIG.zero; x < row.length; x += CONFIG.one) {
      const tile = row[x];
      const terrain = TERRAIN[tile?.terrain] ?? TERRAIN.sea;
      const px = x * CONFIG.tileSize;
      const py = y * CONFIG.tileSize;
      ctx.fillStyle = terrain.color;
      ctx.fillRect(px, py, CONFIG.tileSize, CONFIG.tileSize);
      drawFishHint(tile, px, py);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.strokeRect(px, py, CONFIG.tileSize, CONFIG.tileSize);
    }
  }
}

function drawFishHint(tile, px, py) {
  if (tile?.terrain !== TERRAIN.shallow.name || tile.fish <= CONFIG.zero) {
    return;
  }
  const alpha = Math.min(CONFIG.one, tile.fish / CONFIG.fishMax);
  ctx.fillStyle = `rgba(236, 255, 205, ${alpha})`;
  ctx.beginPath();
  ctx.arc(px + CONFIG.tileSize * CONFIG.half, py + CONFIG.tileSize * CONFIG.half, CONFIG.fishDotRadius + alpha * CONFIG.two, CONFIG.zero, Math.PI * CONFIG.two);
  ctx.fill();
}

function drawStorage() {
  const storage = gameState.storage;
  const px = storage.x * CONFIG.tileSize;
  const py = storage.y * CONFIG.tileSize;
  const size = CONFIG.tileSize - CONFIG.storageInset * CONFIG.two;
  if (drawLoadedImage(assets.storage, px + CONFIG.storageInset, py + CONFIG.storageInset, size, size)) {
    return;
  }
  ctx.fillStyle = "#8d5b2c";
  ctx.fillRect(px + CONFIG.storageInset, py + CONFIG.storageInset, size, size);
  ctx.fillStyle = "#f9d67a";
  ctx.fillRect(px + CONFIG.storageInset, py + CONFIG.storageInset, size, CONFIG.storageInset);
}

function drawSeal() {
  const seal = gameState.seal;
  const px = seal.x * CONFIG.tileSize;
  const py = seal.y * CONFIG.tileSize;
  const size = CONFIG.tileSize - CONFIG.entityInset * CONFIG.two;
  if (!drawLoadedImage(assets.seal, px + CONFIG.entityInset, py + CONFIG.entityInset, size, size)) {
    ctx.fillStyle = "#edf4f7";
    ctx.beginPath();
    ctx.ellipse(px + CONFIG.tileSize * CONFIG.half, py + CONFIG.tileSize * CONFIG.half, CONFIG.sealRadius, CONFIG.sealRadius - CONFIG.two, CONFIG.zero, CONFIG.zero, Math.PI * CONFIG.two);
    ctx.fill();
    ctx.fillStyle = "#1a2d36";
    ctx.beginPath();
    ctx.arc(px + CONFIG.tileSize * CONFIG.half + CONFIG.three, py + CONFIG.tileSize * CONFIG.half - CONFIG.two, CONFIG.one, CONFIG.zero, Math.PI * CONFIG.two);
    ctx.fill();
  }
  if (seal.carriedItem?.type === "fish") {
    ctx.fillStyle = "#f2ff9b";
    ctx.fillRect(px + CONFIG.tileSize - CONFIG.textPad, py + CONFIG.textPad, CONFIG.fishDotRadius * CONFIG.two, CONFIG.fishDotRadius * CONFIG.two);
  }
}

function drawLoadedImage(image, x, y, width, height) {
  if (image?.complete === true && image?.naturalWidth > CONFIG.zero && image?.dataset?.loaded === "true") {
    ctx.drawImage(image, x, y, width, height);
    return true;
  }
  return false;
}

function drawSelection() {
  const selected = gameState.selectedTile;
  if (!selected) {
    return;
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = CONFIG.two;
  ctx.strokeRect(selected.x * CONFIG.tileSize + CONFIG.one, selected.y * CONFIG.tileSize + CONFIG.one, CONFIG.tileSize - CONFIG.two, CONFIG.tileSize - CONFIG.two);
  ctx.lineWidth = CONFIG.one;
}

function renderUi() {
  const day = currentDay();
  ui.phase.textContent = gameState.phase;
  ui.day.textContent = String(day);
  ui.time.textContent = currentClockText();
  ui.storage.textContent = `${formatAmount(gameState.storage.fish)} / ${formatAmount(gameState.storage.capacity)}`;
  ui.hunger.textContent = `${formatAmount(gameState.seal.hunger)} / ${formatAmount(CONFIG.hungerMax)}`;
  ui.task.textContent = gameState.seal.currentTask;
  ui.tile.textContent = selectedTileText();
  ui.gameOverMessage.textContent = gameState.message;
  ui.gameOverTitle.textContent = gameState.message.startsWith("Victory") ? "Victory" : "Colony Lost";

  startScreen.classList.toggle("hidden", gameState.phase !== "start");
  gameOverScreen.classList.toggle("hidden", gameState.phase !== "gameover");
}

function currentDay() {
  return Math.min(CONFIG.victoryDays, Math.floor(gameState.elapsedSeconds / CONFIG.dayLengthSeconds) + CONFIG.one);
}

function currentClockText() {
  const dayProgress = (gameState.elapsedSeconds % CONFIG.dayLengthSeconds) / CONFIG.dayLengthSeconds;
  const totalMinutes = Math.floor(dayProgress * CONFIG.secondsPerDayHour * CONFIG.minutesPerHour);
  const hour = Math.floor(totalMinutes / CONFIG.minutesPerHour);
  const minute = totalMinutes % CONFIG.minutesPerHour;
  return `${padTime(hour)}:${padTime(minute)}`;
}

function padTime(value) {
  return String(value).padStart(CONFIG.two, "0");
}

function selectedTileText() {
  const selected = gameState.selectedTile;
  if (!selected) {
    return "Click a map tile to inspect terrain and fish.";
  }
  const tile = getTile(selected.x, selected.y);
  if (!tile) {
    return "Selected tile is outside the map.";
  }
  return `(${selected.x}, ${selected.y}) terrain: ${tile.terrain}, fish: ${formatAmount(tile.fish)} / ${formatAmount(CONFIG.fishMax)}`;
}

function formatAmount(value) {
  return Number(value ?? CONFIG.zero).toFixed(CONFIG.one);
}

function getTile(x, y) {
  if (x < CONFIG.zero || y < CONFIG.zero || x >= CONFIG.gridSize || y >= CONFIG.gridSize) {
    return null;
  }
  return gameState.map[y]?.[x] ?? null;
}

function onCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor((event.clientX - rect.left) * scaleX / CONFIG.tileSize);
  const y = Math.floor((event.clientY - rect.top) * scaleY / CONFIG.tileSize);
  if (getTile(x, y)) {
    gameState.selectedTile = { x, y };
  }
}

function loop(now) {
  const deltaSeconds = Math.min(CONFIG.maxDeltaSeconds, (now - gameState.lastFrameTime) / CONFIG.millisecondsPerSecond);
  gameState.lastFrameTime = now;
  update(deltaSeconds);
  render();
  renderUi();
  requestAnimationFrame(loop);
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", restartGame);
canvas.addEventListener("click", onCanvasClick);
render();
renderUi();
requestAnimationFrame(loop);
