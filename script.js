'use strict';

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d');
const screen      = document.getElementById('screen');
const hud         = document.getElementById('hud');
const startBtn    = document.getElementById('start');
const soundBtn    = document.getElementById('sound');
const msgEl       = document.getElementById('message');
const keysEl      = document.getElementById('keys');
const exitEl      = document.getElementById('exit-status');
const batteryEl   = document.getElementById('battery');
const lightEl     = document.getElementById('light-status');
const gameSection = document.getElementById('game');

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const W          = canvas.width;
const H          = canvas.height;
const FOV        = Math.PI / 3;
const HALF_FOV   = FOV / 2;
const NUM_RAYS   = W;
const MAX_DEPTH  = 16;
const MOVE_SPEED = 0.05;
const TURN_SPEED = 0.045;
const BATTERY_DRAIN = 0.008;
const TOTAL_KEYS = 3;

// ─── MAP (1=wall 0=floor 2=key 3=exit) ───────────────────────────────────────
const MAP_W = 17;
const MAP_H = 17;
const RAW_MAP = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,1,
  1,0,1,0,1,0,1,1,0,1,1,0,1,0,1,0,1,
  1,0,1,0,0,0,0,1,0,0,0,0,0,0,1,2,1,
  1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,0,1,
  1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,
  1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,
  1,0,1,1,1,0,1,1,0,1,1,0,1,1,1,0,1,
  1,2,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,
  1,0,1,0,1,1,0,1,1,1,0,1,0,1,1,1,1,
  1,0,1,0,0,0,0,0,0,1,0,1,0,0,0,0,1,
  1,0,1,1,1,0,1,1,0,1,1,1,1,0,1,0,1,
  1,0,0,0,1,0,0,0,0,0,0,0,1,0,1,2,1,
  1,1,0,1,1,1,0,1,1,1,0,1,1,0,1,0,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,1,
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
];
let MAP = RAW_MAP.slice();
function mapAt(x, y) {
  const mx = Math.floor(x), my = Math.floor(y);
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return 1;
  return MAP[my * MAP_W + mx];
}
function setMap(x, y, val) { MAP[Math.floor(y) * MAP_W + Math.floor(x)] = val; }

// ─── PLAYER ──────────────────────────────────────────────────────────────────
const player = {
  x: 1.5, y: 1.5, angle: 0,
  lightOn: true, battery: 100,
  keys: 0, exitUnlocked: false,
};

// ─── MONSTER ─────────────────────────────────────────────────────────────────
const monster = {
  x: 15.5, y: 15.5,
  speed: 0.012,
  baseSpeed: 0.012,
  speedPerKey: 0.009,   // added per key collected
  active: false,
  startDelay: 8000,
  breathPhase: 0,       // for animated body pulsing
};

// ─── GAME STATE ──────────────────────────────────────────────────────────────
let gameRunning  = false;
let gamePaused   = false;
let gameOver     = false;
let soundEnabled = false;
let msgTimer     = null;
let lastTime     = 0;
let animId       = null;
let monsterStartTime = 0;
let stepFrame    = 0;

// ─── INPUT ───────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (!gameRunning) return;
  if (e.key.toLowerCase() === 'f') toggleLight();
  if (e.key === 'Escape') togglePause();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

document.querySelectorAll('.touch-controls button').forEach(btn => {
  const k = btn.dataset.key;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); keys[k] = true; if (k === 'f') toggleLight(); });
  btn.addEventListener('pointerup',   e => { e.preventDefault(); keys[k] = false; });
  btn.addEventListener('pointerleave',e => { keys[k] = false; });
});

// ─── AUDIO ───────────────────────────────────────────────────────────────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playTone(freq, type, duration, vol = 0.15, delay = 0) {
  if (!soundEnabled || !audioCtx) return;
  const now = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now); osc.stop(now + duration + 0.02);
}
function playPickupSound() { playTone(440,'sine',0.12,0.18); playTone(660,'sine',0.15,0.18,0.1); }
function playUnlockSound() { [330,440,550,660].forEach((f,i)=>playTone(f,'square',0.15,0.12,i*0.08)); }
function playWinSound()    { [523,659,784,1047].forEach((f,i)=>playTone(f,'sine',0.3,0.2,i*0.12)); }
function playDeathSound()  { playTone(120,'sawtooth',0.6,0.3); playTone(80,'sawtooth',0.8,0.25,0.3); }
function playStepSound()   { playTone(60+Math.random()*20,'sine',0.08,0.06); }

// ─── UTILS ───────────────────────────────────────────────────────────────────
function showMessage(text, duration = 2800) {
  msgEl.textContent = text;
  msgEl.classList.add('visible');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => msgEl.classList.remove('visible'), duration);
}
function toggleLight() {
  if (player.battery <= 0) { showMessage('BATTERY DEAD'); return; }
  player.lightOn = !player.lightOn;
  lightEl.textContent = player.lightOn ? 'LIGHT ON' : 'LIGHT OFF';
}
function togglePause() {
  if (gameOver) return;
  gamePaused = !gamePaused;
  if (gamePaused) showMessage('— PAUSED — (ESC to resume)');
  else msgEl.classList.remove('visible');
}
function updateHUD() {
  keysEl.textContent    = `KEYS: ${player.keys} / ${TOTAL_KEYS}`;
  batteryEl.textContent = `BATTERY: ${Math.ceil(player.battery)}%`;
  lightEl.textContent   = (player.lightOn && player.battery > 0) ? 'LIGHT ON' : 'LIGHT OFF';
  if (player.exitUnlocked) {
    exitEl.textContent = 'EXIT OPEN';
    exitEl.classList.add('unlocked');
  } else {
    exitEl.textContent = 'EXIT LOCKED';
    exitEl.classList.remove('unlocked');
  }
}

// ─── RAYCASTING (DDA) ────────────────────────────────────────────────────────
function castRay(angle) {
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  let mapX = Math.floor(player.x);
  let mapY = Math.floor(player.y);
  const deltaDistX = Math.abs(1 / (cosA || 1e-30));
  const deltaDistY = Math.abs(1 / (sinA || 1e-30));
  let stepX, stepY, sideDistX, sideDistY, side = 0;
  if (cosA < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
  else          { stepX =  1; sideDistX = (mapX + 1.0 - player.x) * deltaDistX; }
  if (sinA < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
  else          { stepY =  1; sideDistY = (mapY + 1.0 - player.y) * deltaDistY; }
  let hit = 0, dist = 0;
  for (let i = 0; i < MAX_DEPTH * 8; i++) {
    if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
    else                       { sideDistY += deltaDistY; mapY += stepY; side = 1; }
    hit = mapAt(mapX, mapY);
    if (hit === 1) { dist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY; break; }
    if (dist > MAX_DEPTH) break;
  }
  return { dist: Math.max(dist, 0.1), side };
}

// ─── RENDERER ────────────────────────────────────────────────────────────────
function lerp(a, b, t)   { return a + (b - a) * t; }
function lerpC(c1, c2, t) {
  return [Math.round(lerp(c1[0],c2[0],t)), Math.round(lerp(c1[1],c2[1],t)), Math.round(lerp(c1[2],c2[2],t))];
}
function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

const WALL_LIT   = [[80,60,55],[55,42,38]];
const WALL_DARK  = [[28,22,20],[18,14,12]];
const FL_NEAR=[20,20,18], FL_FAR=[10,10,9];
const CL_NEAR=[12,12,11], CL_FAR=[6,6,6];

function render() {
  const lightF  = (player.lightOn && player.battery > 0) ? 1 : 0.08;
  const maxLight = 10 * lightF;

  // Floor & ceiling scanlines
  for (let y = 0; y < H; y++) {
    const isFloor = y > H / 2;
    const rowDist = (H * 0.5) / Math.abs(y - H / 2 + 0.001);
    const t = Math.min(rowDist / maxLight, 1);
    let c = lerpC(isFloor ? FL_NEAR : CL_NEAR, isFloor ? FL_FAR : CL_FAR, t);
    c = c.map(v => Math.round(v * lightF));
    ctx.fillStyle = rgb(c);
    ctx.fillRect(0, y, W, 1);
  }

  // Walls
  for (let col = 0; col < NUM_RAYS; col++) {
    const rayAngle = player.angle - HALF_FOV + (col / NUM_RAYS) * FOV;
    const { dist, side } = castRay(rayAngle);
    const corrDist   = dist * Math.cos(rayAngle - player.angle);
    const wallHeight = Math.round(H / corrDist);
    const top        = Math.max(0, Math.floor((H - wallHeight) / 2));
    const bottom     = Math.min(H, Math.floor((H + wallHeight) / 2));
    const litFrac    = Math.max(0, 1 - corrDist / maxLight);
    const wallColor  = lerpC(WALL_DARK[side], WALL_LIT[side], litFrac * lightF);
    ctx.fillStyle = rgb(wallColor);
    ctx.fillRect(col, top, 1, bottom - top);
  }

  // Monster sprite — scarier multi-part creature
  if (monster.active) {
    const dx = monster.x - player.x;
    const dy = monster.y - player.y;
    const mDist = Math.sqrt(dx * dx + dy * dy);
    if (mDist < MAX_DEPTH) {
      let mAngle = Math.atan2(dy, dx) - player.angle;
      while (mAngle >  Math.PI) mAngle -= 2 * Math.PI;
      while (mAngle < -Math.PI) mAngle += 2 * Math.PI;
      if (Math.abs(mAngle) < HALF_FOV + 0.4) {
        const sx      = Math.round((0.5 + mAngle / FOV) * W);
        const sh      = Math.round(H / mDist);
        const sw      = Math.round(sh * 0.6);
        const st      = Math.floor((H - sh) / 2);
        const litF2   = Math.max(0, 1 - mDist / maxLight);
        const breath  = Math.sin(monster.breathPhase);
        const bPulse  = 1 + breath * 0.06;
        const swP     = Math.round(sw * bPulse);
        const shP     = Math.round(sh * (1 + breath * 0.03));

        // Body — tall dark mass with slight sway
        const sway    = Math.round(breath * sw * 0.08);
        const bx      = sx - Math.round(swP / 2) + sway;
        const bodyR   = Math.round(lerp(10, 80, litF2));
        const bodyG   = Math.round(lerp(3, 8, litF2));
        const bodyB   = Math.round(lerp(3, 8, litF2));
        ctx.fillStyle = `rgba(${bodyR},${bodyG},${bodyB},0.92)`;
        ctx.fillRect(bx, st + Math.round(shP * 0.1), swP, Math.round(shP * 0.9));

        // Head — slightly wider oval at top
        const headW   = Math.round(swP * 1.15);
        const headH   = Math.round(shP * 0.28);
        const headX   = sx - Math.round(headW / 2) + sway;
        const headY   = st;
        const headR   = Math.round(lerp(15, 100, litF2));
        ctx.fillStyle = `rgba(${headR},${bodyG},${bodyB},0.95)`;
        ctx.fillRect(headX, headY, headW, headH);

        // Arms — long thin limbs drooping at angles
        if (litF2 > 0.04) {
          const armW = Math.max(1, Math.round(swP * 0.1));
          const armL = Math.round(shP * 0.55);
          const armY = st + Math.round(shP * 0.28);
          const armSwing = Math.round(breath * sh * 0.04);
          ctx.fillStyle = `rgba(${bodyR},${bodyG},${bodyB},0.78)`;
          // Left arm
          ctx.save();
          ctx.translate(bx - Math.round(swP * 0.05), armY + armSwing);
          ctx.rotate(-0.38 + breath * 0.08);
          ctx.fillRect(0, 0, armW, armL);
          ctx.restore();
          // Right arm
          ctx.save();
          ctx.translate(bx + swP + Math.round(swP * 0.05) - armW, armY - armSwing);
          ctx.rotate(0.38 - breath * 0.08);
          ctx.fillRect(0, 0, armW, armL);
          ctx.restore();
        }

        // Eyes — two glowing red slits
        if (litF2 > 0.03) {
          const eyeW  = Math.max(2, Math.round(swP * 0.14));
          const eyeH  = Math.max(1, Math.round(shP * 0.045));
          const eyeY  = headY + Math.round(headH * 0.42);
          const eyeGlow = Math.min(1, litF2 * 1.6);
          // Flicker the eyes slightly for horror effect
          const eyeAlpha = 0.7 + Math.sin(monster.breathPhase * 3.7) * 0.3;
          ctx.fillStyle = `rgba(255,${Math.round(20 + litF2 * 30)},10,${eyeAlpha})`;
          ctx.fillRect(sx - Math.round(swP * 0.22) - Math.round(eyeW / 2) + sway, eyeY, eyeW, eyeH);
          ctx.fillRect(sx + Math.round(swP * 0.22) - Math.round(eyeW / 2) + sway, eyeY, eyeW, eyeH);
          // Eye glow halo
          if (eyeGlow > 0.15) {
            ctx.fillStyle = `rgba(255,0,0,${eyeGlow * 0.18})`;
            const haloW = eyeW * 3, haloH = eyeH * 4;
            ctx.fillRect(sx - Math.round(swP * 0.22) - Math.round(haloW / 2) + sway, eyeY - Math.round(haloH / 3), haloW, haloH);
            ctx.fillRect(sx + Math.round(swP * 0.22) - Math.round(haloW / 2) + sway, eyeY - Math.round(haloH / 3), haloW, haloH);
          }
        }

        // Teeth / mouth — jagged pale gash
        if (litF2 > 0.06 && swP > 8) {
          const mouthY = headY + Math.round(headH * 0.72);
          const mouthW = Math.round(swP * 0.55);
          const mouthH = Math.max(1, Math.round(shP * 0.03));
          ctx.fillStyle = `rgba(200,180,160,${litF2 * 0.65})`;
          ctx.fillRect(sx - Math.round(mouthW / 2) + sway, mouthY, mouthW, mouthH);
          // Individual jagged teeth
          const toothW = Math.max(1, Math.round(mouthW / 6));
          for (let t = 0; t < 5; t++) {
            const tx2 = sx - Math.round(mouthW / 2) + t * Math.round(mouthW / 5) + sway;
            ctx.fillStyle = `rgba(220,200,180,${litF2 * 0.5})`;
            ctx.fillRect(tx2, mouthY, toothW, Math.round(shP * 0.04));
          }
        }

        // Distance-based full-screen red tint when very close
        if (mDist < 3 && litF2 > 0.1) {
          const tintAlpha = Math.max(0, (3 - mDist) / 3) * 0.25 * litF2;
          ctx.fillStyle = `rgba(180,0,0,${tintAlpha})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
    }
  }

  // Vignette
  const vig = ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.9);
  vig.addColorStop(0,'rgba(0,0,0,0)');
  vig.addColorStop(1,'rgba(0,0,0,0.72)');
  ctx.fillStyle = vig;
  ctx.fillRect(0,0,W,H);

  // Extra dark overlay when no light
  if (!player.lightOn || player.battery <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0,0,W,H);
  }
}

// ─── MOVEMENT & COLLISION ────────────────────────────────────────────────────
function tryMove(nx, ny) {
  const m = 0.25;
  if (mapAt(nx + m, player.y) !== 1 && mapAt(nx - m, player.y) !== 1) player.x = nx;
  if (mapAt(player.x, ny + m) !== 1 && mapAt(player.x, ny - m) !== 1) player.y = ny;
}

// ─── ITEM INTERACTIONS ───────────────────────────────────────────────────────
function checkInteractions() {
  const cell = mapAt(player.x, player.y);
  if (cell === 2) {
    player.keys++;
    setMap(player.x, player.y, 0);
    playPickupSound();
    showMessage(`KEY FOUND — ${player.keys} / ${TOTAL_KEYS}`);
    gameSection.classList.add('flicker');
    setTimeout(() => gameSection.classList.remove('flicker'), 400);

    // Speed up the monster for each key collected
    monster.speed = monster.baseSpeed + monster.speedPerKey * player.keys;
    // Scary speed warning after a moment
    setTimeout(() => {
      if (!gameRunning || gameOver) return;
      gameSection.classList.add('speed-flash');
      setTimeout(() => gameSection.classList.remove('speed-flash'), 700);
      const warnings = [
        'IT\'S GETTING FASTER...',
        'YOU CAN HEAR IT BREATHING.',
        'IT KNOWS. IT\'S COMING.'
      ];
      showMessage(warnings[player.keys - 1] || 'IT\'S GETTING FASTER...', 3000);
      if (soundEnabled) {
        // Scary low rumble burst
        playTone(55, 'sawtooth', 0.9, 0.18);
        playTone(40, 'sawtooth', 1.1, 0.12, 0.15);
      }
    }, 1400);

    if (player.keys >= TOTAL_KEYS && !player.exitUnlocked) {
      player.exitUnlocked = true;
      setTimeout(() => { playUnlockSound(); showMessage('ALL KEYS COLLECTED — EXIT UNLOCKED', 3500); }, 2600);
    }
  }
  if (cell === 3 && player.exitUnlocked) triggerWin();
}

// ─── MONSTER AI ──────────────────────────────────────────────────────────────
function updateMonster(now) {
  if (!monster.active) {
    if (now - monsterStartTime > monster.startDelay) {
      monster.active = true;
      // Jump-scare activation: screen flash + loud sound burst
      gameSection.classList.add('speed-flash');
      setTimeout(() => gameSection.classList.remove('speed-flash'), 500);
      if (soundEnabled) {
        playTone(60, 'sawtooth', 1.2, 0.35);
        playTone(45, 'sawtooth', 1.5, 0.25, 0.2);
        playTone(200, 'sine', 0.3, 0.15, 0.05);
      }
      showMessage('IT HAS FOUND YOU.', 3000);
    }
    return;
  }

  // Advance breath phase for animated pulsing
  monster.breathPhase = (monster.breathPhase + 0.04) % (Math.PI * 2);

  const dx = player.x - monster.x;
  const dy = player.y - monster.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0.01) {
    const nx = monster.x + (dx / dist) * monster.speed;
    const ny = monster.y + (dy / dist) * monster.speed;
    if (mapAt(nx, monster.y) !== 1) monster.x = nx;
    if (mapAt(monster.x, ny) !== 1) monster.y = ny;
  }

  // Proximity terror tiers
  if (dist < 2.5) {
    // IMMINENT — ultra close, rapid flash + shake + max red glow
    gameSection.classList.add('danger', 'imminent', 'shake', 'monster-flicker');
    // Random terrifying shriek bursts
    if (soundEnabled && Math.random() < 0.025) {
      playTone(60 + Math.random() * 60, 'sawtooth', 0.25, 0.22);
      playTone(90 + Math.random() * 80, 'square', 0.15, 0.12, 0.1);
    }
  } else if (dist < 5) {
    // DANGER — close, red vignette + shake
    gameSection.classList.add('danger', 'shake');
    gameSection.classList.remove('imminent', 'monster-flicker');
    // Occasional low growl
    if (soundEnabled && Math.random() < 0.008) {
      playTone(70 + Math.random() * 40, 'sawtooth', 0.4, 0.14);
    }
  } else if (dist < 8) {
    // NEARBY — light red glow only, subtle sound
    gameSection.classList.add('danger');
    gameSection.classList.remove('imminent', 'shake', 'monster-flicker');
    if (soundEnabled && Math.random() < 0.003) {
      playTone(80 + Math.random() * 30, 'sine', 0.5, 0.07);
    }
  } else {
    gameSection.classList.remove('danger', 'imminent', 'shake', 'monster-flicker');
  }

  if (dist < 0.55) triggerDeath();
}

// ─── WIN / LOSE ──────────────────────────────────────────────────────────────
function showEndScreen(eyebrow, titleHTML, tagline, objective, btnText, note) {
  gameRunning = false; gameOver = true;
  cancelAnimationFrame(animId);
  gameSection.classList.remove('danger', 'shake', 'imminent', 'monster-flicker', 'speed-flash');
  document.getElementById('eyebrow').textContent  = eyebrow;
  document.getElementById('title').innerHTML       = titleHTML;
  document.getElementById('tagline').textContent   = tagline;
  document.getElementById('objective').textContent = objective;
  startBtn.textContent = btnText;
  document.getElementById('screen-note').textContent = note;
  screen.style.display = '';
  hud.classList.add('hidden');
}
function triggerWin() {
  playWinSound();
  showEndScreen('YOU ESCAPED','YOU<br>MADE IT<span class="title-dot">.</span>',
    'The hallway is behind you now.','WELL DONE — YOU SURVIVED',
    'PLAY AGAIN \u2197','THANKS FOR PLAYING');
}
function triggerDeath() {
  if (gameOver) return;
  playDeathSound();
  showEndScreen('GAME OVER','YOU<br>DIED<span class="title-dot">.</span>',
    'It found you in the dark.',`KEYS FOUND: ${player.keys} / ${TOTAL_KEYS}`,
    'TRY AGAIN \u2197','KEEP THE LIGHT ON NEXT TIME');
}

// ─── GAME LOOP ───────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!gameRunning) return;
  if (gamePaused) { animId = requestAnimationFrame(gameLoop); return; }
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  const ms = MOVE_SPEED * (dt / 16.67);
  const ts = TURN_SPEED * (dt / 16.67);
  let moved = false;
  if (keys['w'] || keys['arrowup'])    { tryMove(player.x + Math.cos(player.angle)*ms, player.y + Math.sin(player.angle)*ms); moved=true; }
  if (keys['s'] || keys['arrowdown'])  { tryMove(player.x - Math.cos(player.angle)*ms, player.y - Math.sin(player.angle)*ms); moved=true; }
  if (keys['a'] || keys['arrowleft'])  player.angle -= ts;
  if (keys['d'] || keys['arrowright']) player.angle += ts;
  if (moved && soundEnabled) { stepFrame++; if (stepFrame % 22 === 0) playStepSound(); }

  if (player.lightOn && player.battery > 0) {
    player.battery = Math.max(0, player.battery - BATTERY_DRAIN * (dt / 16.67));
    if (player.battery <= 0) { player.lightOn = false; showMessage('BATTERY DEAD — LIGHT OUT', 3000); }
  }

  updateMonster(timestamp);
  checkInteractions();
  render();
  updateHUD();
  animId = requestAnimationFrame(gameLoop);
}

// ─── START GAME ──────────────────────────────────────────────────────────────
function startGame() {
  MAP = RAW_MAP.slice();
  player.x = 1.5; player.y = 1.5; player.angle = 0;
  player.lightOn = true; player.battery = 100;
  player.keys = 0; player.exitUnlocked = false;
  monster.x = 15.5; monster.y = 15.5; monster.active = false;
  monster.speed = monster.baseSpeed; monster.breathPhase = 0;
  gameOver = false; gamePaused = false; gameRunning = true; stepFrame = 0;
  gameSection.classList.remove('danger','shake','flicker','imminent','monster-flicker','speed-flash');
  msgEl.classList.remove('visible');
  screen.style.display = 'none';
  hud.classList.remove('hidden');
  updateHUD();
  showMessage('FIND THE 3 KEYS — REACH THE EXIT', 3500);
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(ts => { lastTime = ts; monsterStartTime = ts; gameLoop(ts); });
}

// ─── BUTTON LISTENERS ────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => { ensureAudio(); startGame(); });
soundBtn.addEventListener('click', () => {
  ensureAudio();
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? 'SOUND: ON' : 'SOUND: OFF';
  soundBtn.setAttribute('aria-pressed', soundEnabled);
  if (soundEnabled && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});
