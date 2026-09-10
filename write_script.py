import pathlib

JS_PART1 = r"""'use strict';

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
const W            = canvas.width;
const H            = canvas.height;
const FOV          = Math.PI / 3;
const HALF_FOV     = FOV / 2;
const NUM_RAYS     = W;
const MAX_DEPTH    = 16;
const MOVE_SPEED   = 0.05;
const TURN_SPEED   = 0.045;
const BATTERY_DRAIN = 0.008;
const SURVIVE_TIME  = 60;

// ─── MAP  0=floor 1=wall 3=door(locked) 4=door(open) ─────────────────────────
const MAP_W = 17, MAP_H = 17;
const RAW_MAP = [
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
  1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,1,
  1,0,1,0,1,0,1,1,0,1,1,0,1,0,1,0,1,
  1,0,1,0,0,0,0,1,0,0,0,0,0,0,1,0,1,
  1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,0,1,
  1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,
  1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1,1,
  1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,
  1,0,1,1,1,0,1,1,0,1,1,0,1,1,1,0,1,
  1,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,
  1,0,1,0,1,1,0,1,1,1,0,1,0,1,1,1,1,
  1,0,1,0,0,0,0,0,0,1,0,1,0,0,0,0,1,
  1,0,1,1,1,0,1,1,0,1,1,1,1,0,1,0,1,
  1,0,0,0,1,0,0,0,0,0,0,0,1,0,1,0,1,
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
function isWall(x, y) { const v = mapAt(x,y); return v===1 || v===3; }
function setMap(x, y, val) { MAP[Math.floor(y)*MAP_W+Math.floor(x)] = val; }

// ─── PLAYER ──────────────────────────────────────────────────────────────────
const player = { x:1.5, y:1.5, angle:0, lightOn:true, battery:100 };

// ─── MONSTER ─────────────────────────────────────────────────────────────────
const monster = {
  x:15.5, y:15.5, speed:0.013, baseSpeed:0.013,
  active:false, startDelay:5000, breathPhase:0, stepTimer:0, stepInterval:850,
};

// ─── GAME STATE ──────────────────────────────────────────────────────────────
let gameRunning=false, gamePaused=false, gameOver=false, soundEnabled=false;
let msgTimer=null, lastTime=0, animId=null, monsterStartTime=0, stepFrame=0;
let surviveTimer=SURVIVE_TIME, doorUnlocked=false;
let jumpscareActive=false, jumpPhase=0, jumpStartTime=0;
const JUMP_DURATION=1600;

// ─── INPUT ───────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (!gameRunning) return;
  if (e.key.toLowerCase()==='f') toggleLight();
  if (e.key==='Escape') togglePause();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
document.querySelectorAll('.touch-controls button').forEach(btn => {
  const k = btn.dataset.key;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); keys[k]=true; if(k==='f') toggleLight(); });
  btn.addEventListener('pointerup',   e => { e.preventDefault(); keys[k]=false; });
  btn.addEventListener('pointerleave',e => { keys[k]=false; });
});
"""
