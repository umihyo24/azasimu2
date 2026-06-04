const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const resourceBars = document.getElementById("resourceBars");
const debugInfo = document.getElementById("debugInfo");

const WORLD = {
  width: canvas.width,
  height: canvas.height,
  sea: { x: 0, y: 0, width: 420, height: canvas.height },
  storage: { x: 712, y: 300, width: 150, height: 132, label: "Food Storage" },
  fishingSpot: { x: 220, y: 350 },
};

const TASKS = {
  fishing: "Fishing",
  delivering: "Delivering",
  eating: "Eating",
};

const state = {
  time: 0,
  resources: {
    seaFish: { value: 18, max: 24 },
    hunger: { value: 34, max: 100 },
    storageFish: { value: 5, max: 20 },
  },
  seal: {
    x: WORLD.storage.x + 62,
    y: WORLD.storage.y + 112,
    speed: 86,
    task: TASKS.fishing,
    carryingItem: null,
    targetDestination: "Fishing Spot",
    facing: -1,
    bob: 0,
  },
  timers: {
    fishing: 0,
    eating: 0,
    hunger: 0,
  },
  effects: [],
};

const RESOURCE_BAR_CONFIG = [
  { key: "seaFish", label: "Sea Fish", color: "var(--fish)" },
  { key: "hunger", label: "Hunger", color: "var(--hunger)" },
  { key: "storageFish", label: "Storage Fish", color: "var(--storage)" },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


function moveToward(entity, target, speed, dt) {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const remaining = Math.hypot(dx, dy);

  if (remaining <= 1) {
    entity.x = target.x;
    entity.y = target.y;
    return true;
  }

  const step = Math.min(remaining, speed * dt);
  entity.x += (dx / remaining) * step;
  entity.y += (dy / remaining) * step;
  entity.facing = dx === 0 ? entity.facing : Math.sign(dx);
  return remaining <= step + 1;
}

function getStorageDropoffPoint() {
  return {
    x: WORLD.storage.x + WORLD.storage.width * 0.5,
    y: WORLD.storage.y + WORLD.storage.height - 12,
  };
}

function setSealTask(task, targetDestination, carryingItem = state.seal.carryingItem) {
  state.seal.task = task;
  state.seal.targetDestination = targetDestination;
  state.seal.carryingItem = carryingItem;
}

function addFloatingText(text, x, y, color = "#fff7b8") {
  state.effects.push({ type: "text", text, x, y, age: 0, duration: 1.15, color });
}

function addFishParticle(x, y) {
  const angle = Math.random() * Math.PI * 2;
  state.effects.push({
    type: "fish",
    x,
    y,
    vx: Math.cos(angle) * 18,
    vy: Math.sin(angle) * 12 - 14,
    age: 0,
    duration: 0.8,
    color: "#b8f3ff",
  });
}

function updateEffects(dt) {
  state.effects = state.effects.filter((effect) => {
    effect.age += dt;
    effect.x += (effect.vx || 0) * dt;
    effect.y += (effect.vy || -22) * dt;
    return effect.age < effect.duration;
  });
}

function updateNeeds(dt) {
  state.timers.hunger += dt;
  if (state.timers.hunger >= 1) {
    state.timers.hunger = 0;
    state.resources.hunger.value = clamp(state.resources.hunger.value + 2, 0, state.resources.hunger.max);
  }
}

function updateFishing(dt) {
  const arrived = moveToward(state.seal, WORLD.fishingSpot, state.seal.speed, dt);
  if (!arrived) return;

  state.timers.fishing += dt;
  if (Math.random() < 8 * dt) {
    addFishParticle(state.seal.x + Math.random() * 34 - 17, state.seal.y - 20);
  }

  if (state.timers.fishing >= 1.8 && state.resources.seaFish.value > 0) {
    state.timers.fishing = 0;
    state.resources.seaFish.value -= 1;
    setSealTask(TASKS.delivering, "Food Storage", "Fish");
  }
}

function updateDelivering(dt) {
  const arrived = moveToward(state.seal, getStorageDropoffPoint(), state.seal.speed, dt);
  if (!arrived) return;

  if (state.seal.carryingItem === "Fish") {
    state.resources.storageFish.value = clamp(state.resources.storageFish.value + 1, 0, state.resources.storageFish.max);
  }

  if (state.resources.hunger.value >= 72 && state.resources.storageFish.value > 0) {
    setSealTask(TASKS.eating, "Food Storage", null);
    state.timers.eating = 0;
    return;
  }

  setSealTask(TASKS.fishing, "Fishing Spot", null);
}

function updateEating(dt) {
  moveToward(state.seal, getStorageDropoffPoint(), state.seal.speed, dt);
  state.timers.eating += dt;

  if (state.timers.eating >= 0.45 && state.timers.eating - dt < 0.45) {
    state.resources.storageFish.value = clamp(state.resources.storageFish.value - 1, 0, state.resources.storageFish.max);
    state.resources.hunger.value = clamp(state.resources.hunger.value - 46, 0, state.resources.hunger.max);
    addFloatingText("Nom", state.seal.x, state.seal.y - 54);
  }

  if (state.timers.eating >= 1.25) {
    state.timers.eating = 0;
    setSealTask(TASKS.fishing, "Fishing Spot", null);
  }
}

function update(dt) {
  state.time += dt;
  state.seal.bob = Math.sin(state.time * 8) * 4;
  updateNeeds(dt);

  if (state.seal.task === TASKS.fishing) updateFishing(dt);
  if (state.seal.task === TASKS.delivering) updateDelivering(dt);
  if (state.seal.task === TASKS.eating) updateEating(dt);

  updateEffects(dt);
}

function drawRoundedRect(x, y, width, height, radius, fillStyle, strokeStyle) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawText(text, x, y, options = {}) {
  ctx.save();
  ctx.font = options.font || "700 18px Inter, sans-serif";
  ctx.fillStyle = options.color || "#ffffff";
  ctx.textAlign = options.align || "center";
  ctx.textBaseline = options.baseline || "middle";
  if (options.shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawFishIcon(x, y, scale = 1, color = "#8be9ff") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(-22, -9);
  ctx.lineTo(-22, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#073248";
  ctx.beginPath();
  ctx.arc(6, -2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWorld() {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  sky.addColorStop(0, "#9fe5ff");
  sky.addColorStop(0.48, "#dff8ff");
  sky.addColorStop(0.49, "#f5db9e");
  sky.addColorStop(1, "#d39d5c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  const sea = ctx.createLinearGradient(0, 180, 0, WORLD.height);
  sea.addColorStop(0, "#1aa7c9");
  sea.addColorStop(1, "#075c86");
  ctx.fillStyle = sea;
  ctx.fillRect(WORLD.sea.x, WORLD.sea.y + 150, WORLD.sea.width, WORLD.sea.height);

  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 3;
  for (let y = 210; y < 520; y += 46) {
    ctx.beginPath();
    for (let x = 0; x <= WORLD.sea.width; x += 24) {
      const waveY = y + Math.sin(x * 0.04 + state.time * 2.2) * 5;
      if (x === 0) ctx.moveTo(x, waveY);
      else ctx.lineTo(x, waveY);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.fillRect(WORLD.sea.width - 8, 150, 16, WORLD.height - 150);
}

function drawStorage() {
  const { x, y, width, height, label } = WORLD.storage;
  drawText(`${state.resources.storageFish.value} / ${state.resources.storageFish.max} fish`, x + width / 2, y - 32, {
    font: "800 22px Inter, sans-serif",
    color: "#12310f",
    shadow: true,
  });

  drawRoundedRect(x, y + 42, width, height - 42, 14, "#7b4d2a", "#4d2d17");
  ctx.fillStyle = "#a76b39";
  ctx.fillRect(x + 14, y + 58, width - 28, height - 70);
  ctx.fillStyle = "#593016";
  ctx.fillRect(x + 58, y + 86, 34, 46);

  ctx.beginPath();
  ctx.moveTo(x - 14, y + 48);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x + width + 14, y + 48);
  ctx.closePath();
  ctx.fillStyle = "#d76443";
  ctx.fill();
  ctx.strokeStyle = "#873522";
  ctx.lineWidth = 4;
  ctx.stroke();

  for (let i = 0; i < Math.min(state.resources.storageFish.value, 8); i += 1) {
    drawFishIcon(x + 28 + (i % 4) * 28, y + 72 + Math.floor(i / 4) * 23, 0.55, "#b8f3ff");
  }

  drawRoundedRect(x + 16, y + height + 10, width - 32, 34, 12, "rgba(5, 23, 19, 0.82)", "rgba(255,255,255,0.18)");
  drawText(label, x + width / 2, y + height + 28, {
    font: "800 17px Inter, sans-serif",
    color: "#eaffd9",
  });
}

function drawSeal() {
  const seal = state.seal;
  const bobY = seal.y + seal.bob;

  ctx.save();
  ctx.translate(seal.x, bobY);
  ctx.scale(seal.facing, 1);

  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 31 - seal.bob, 50, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5d7180";
  ctx.beginPath();
  ctx.ellipse(0, 0, 48, 25, -0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#748a9b";
  ctx.beginPath();
  ctx.ellipse(34, -10, 24, 20, 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#465766";
  ctx.beginPath();
  ctx.moveTo(-38, 5);
  ctx.lineTo(-62, -10);
  ctx.lineTo(-55, 14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#172432";
  ctx.beginPath();
  ctx.arc(43, -15, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#1d2c39";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(53, -7);
  ctx.lineTo(70, -15);
  ctx.moveTo(53, -5);
  ctx.lineTo(72, -5);
  ctx.moveTo(53, -3);
  ctx.lineTo(70, 5);
  ctx.stroke();

  ctx.restore();

  if (seal.carryingItem === "Fish") {
    drawFishIcon(seal.x, bobY - 54, 1.25, "#a8f0ff");
  }
}

function drawEffects() {
  state.effects.forEach((effect) => {
    const progress = effect.age / effect.duration;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    if (effect.type === "fish") {
      drawFishIcon(effect.x, effect.y, 0.55, effect.color);
    } else {
      drawText(effect.text, effect.x, effect.y - progress * 24, {
        font: "900 28px Inter, sans-serif",
        color: effect.color,
        shadow: true,
      });
    }
    ctx.restore();
  });
}

function drawTaskBeacon() {
  const target = state.seal.task === TASKS.fishing ? WORLD.fishingSpot : getStorageDropoffPoint();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.52)";
  ctx.setLineDash([8, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(state.seal.x, state.seal.y - 35);
  ctx.lineTo(target.x, target.y - 35);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.arc(target.x, target.y - 35, 8 + Math.sin(state.time * 6) * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render() {
  drawWorld();
  drawText("Fishing Spot", WORLD.fishingSpot.x, WORLD.fishingSpot.y - 56, {
    font: "800 18px Inter, sans-serif",
    color: "#e7fbff",
    shadow: true,
  });
  drawFishIcon(WORLD.fishingSpot.x - 22, WORLD.fishingSpot.y - 24, 0.9);
  drawFishIcon(WORLD.fishingSpot.x + 20, WORLD.fishingSpot.y - 8, 0.7);
  drawStorage();
  drawTaskBeacon();
  drawSeal();
  drawEffects();
}

function formatDebugValue(value) {
  return value || "None";
}

function updateHud() {
  resourceBars.innerHTML = RESOURCE_BAR_CONFIG.map(({ key, label, color }) => {
    const resource = state.resources[key];
    const percent = Math.round((resource.value / resource.max) * 100);
    return `
      <div class="resource-bar">
        <div class="resource-bar__label"><span>${label}</span><span>${resource.value}/${resource.max}</span></div>
        <div class="resource-bar__track"><div class="resource-bar__fill" style="--value: ${percent}%; --bar-color: ${color};"></div></div>
      </div>
    `;
  }).join("");

  const rows = [
    ["Current Task", state.seal.task],
    ["Carrying Item", formatDebugValue(state.seal.carryingItem)],
    ["Target Destination", state.seal.targetDestination],
  ];

  debugInfo.innerHTML = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
}

let lastTimestamp = performance.now();
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
  lastTimestamp = timestamp;
  update(dt);
  render();
  updateHud();
  requestAnimationFrame(gameLoop);
}

updateHud();
render();
requestAnimationFrame(gameLoop);
