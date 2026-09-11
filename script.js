'use strict'; // Aktifkan strict mode — cegah error siluman seperti akses variabel tak dideklarasikan

// ═══════════════════════════════════════════════════════════════════════════════
// DOM ELEMENT REFERENCES — Ambil semua elemen HTML yang dibutuhkan game
// ═══════════════════════════════════════════════════════════════════════════════

const canvas=document.getElementById('canvas');       // Elemen <canvas> tempat semua gambar game dirender
const ctx=canvas.getContext('2d');                     // Context 2D canvas — semua operasi gambar pakai variabel ini
const screen=document.getElementById('screen');       // Layer overlay untuk title screen / end screen
const hud=document.getElementById('hud');             // HUD (Heads-Up Display) — timer, baterai, status pintu
const startBtn=document.getElementById('start');      // Tombol "ENTER" untuk mulai game
const soundBtn=document.getElementById('sound');      // Tombol "SOUND: ON/OFF" untuk toggle audio
const msgEl=document.getElementById('message');       // Elemen <p> untuk pesan in-game (misal "EXIT OPEN")
const keysEl=document.getElementById('keys');         // Elemen timer countdown di HUD
const exitEl=document.getElementById('exit-status');  // Label "EXIT OPEN" — muncul saat pintu terbuka
const batteryEl=document.getElementById('battery');   // Indikator baterai flashlight (block chars █░)
const lightEl=document.getElementById('light-status');// Label "NO LIGHT" — muncul saat baterai habis
const gameSection=document.getElementById('game');    // Section utama game — dipakai untuk toggle CSS effect classes


// ═══════════════════════════════════════════════════════════════════════════════
// GAME CONSTANTS — Semua konstanta pengaturan game
// ═══════════════════════════════════════════════════════════════════════════════

const W=canvas.width,H=canvas.height;                // W=320, H=180 — resolusi rendah untuk efek retro/pixelated
const FOV=Math.PI/3,HALF_FOV=FOV/2;                 // FOV=60° (sudut pandang kamera), HALF_FOV=30° (setengah untuk kalkulasi ray)
const NUM_RAYS=W,MAX_DEPTH=16;                       // Jumlah ray = jumlah kolom canvas (320), max kedalaman raycast = 16 satuan map
const MOVE_SPEED=0.05,TURN_SPEED=0.045,BATTERY_DRAIN=0.008; // Kecepatan berjalan/putar per frame, drain baterai per frame
const SURVIVE_TIME=60;                               // Waktu bertahan hidup = 60 detik sebelum pintu terbuka


// ═══════════════════════════════════════════════════════════════════════════════
// MAP DEFINITION — Definisi maze 17x17
// ═══════════════════════════════════════════════════════════════════════════════
// Cell values:
//   0 = lantai (bisa dilewati)
//   1 = dinding (tidak bisa dilewati)
//   3 = pintu terkunci (awalnya seperti dinding, berubah jadi 4 saat timer habis)
//   4 = pintu keluar (bisa dilewati — trigger menang)

const MAP_W=MAP_H=17;                                // Lebar dan tinggi map = 17x17 cell
const RAW_MAP=[                                      // Data map mentah — 17 baris × 17 kolom = 289 cell
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,                // Baris 0:  dinding penuh (border atas)
  1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,1,                // Baris 1:  lantai dengan lorong-lorong
  1,0,1,0,1,0,1,1,0,1,1,0,1,0,1,0,1,                // Baris 2:  dinding pembagi vertikal
  1,0,1,0,0,0,0,1,0,0,0,0,0,0,1,0,1,                // Baris 3:  koridor terbuka
  1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,0,1,                // Baris 4:  ruangan sempit
  1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,                // Baris 5:  lorong horizontal panjang
  1,1,1,0,1,1,1,0,1,1,1,0,1,1,0,1,1,                // Baris 6:  junction/b percabangan
  1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,                // Baris 7:  area terbuka tengah
  1,0,1,1,1,0,1,1,0,1,1,0,1,1,1,0,1,                // Baris 8:  ruangan kotak
  1,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,1,                // Baris 9:  koridor dekat start
  1,0,1,0,1,1,0,1,1,1,0,1,0,1,1,1,1,                // Baris 10: dead end pattern
  1,0,1,0,0,0,0,0,0,1,0,1,0,0,0,0,1,                // Baris 11: lorong menuju tengah
  1,0,1,1,1,0,1,1,0,1,1,1,1,0,1,0,1,                // Baris 12: ruangan terpisah
  1,0,0,0,1,0,0,0,0,0,0,0,1,0,1,0,1,                // Baris 13: koridor dekat pintu
  1,1,0,1,1,1,0,1,1,1,0,1,1,0,1,0,1,                // Baris 14: labirin kompleks
  1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,1,                // Baris 15: cell ke-15 kolom = 3 (pintu terkunci, nanti jadi 4)
  1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,                // Baris 16: dinding penuh (border bawah)
];
let MAP=RAW_MAP.slice();                             // Salinan map aktif — .slice() buat copy, agar bisa direset tiap game baru


// ═══════════════════════════════════════════════════════════════════════════════
// MAP UTILITY FUNCTIONS — Fungsi bantu untuk akses map
// ═══════════════════════════════════════════════════════════════════════════════

function mapAt(x,y){
  // Ambil nilai cell di koordinat (x,y). Konversi float → integer (floor) karena posisi player bisa di antar cell
  const mx=Math.floor(x),my=Math.floor(y);
  // Batasi agar tidak keluar dari map — kalau di luar, anggap dinding
  if(mx<0||mx>=MAP_W||my<0||my>=MAP_H)return 1;
  // Hitung indeks array 1D dari koordinat 2D: indeks = baris × lebar + kolom
  return MAP[my*MAP_W+mx];
}

function isWall(x,y){
  // Cek apakah cell di (x,y) adalah dinding ATAU pintu terkunci (3). Keduanya menghalangi jalan
  const v=mapAt(x,y);return v===1||v===3;
}

function setMap(x,y,val){
  // Set nilai cell — dipakai saat pintu terbuka (3 → 4)
  MAP[Math.floor(y)*MAP_W+Math.floor(x)]=val;
}


// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER & MONSTER STATE — State awal pemain dan monster
// ═══════════════════════════════════════════════════════════════════════════════

const player={
  x:1.5, y:1.5,           // Posisi awal = (1.5, 1.5) — tengah cell pertama di kiri atas map
  angle:0,                 // Sudut pandang awal = 0 radian (menghadap kanan / timur)
  lightOn:true,            // Flashlight aktif dari awal
  battery:100              // Baterai penuh 100%, drain tiap frame saat light menyala
};

const monster={
  x:15.5, y:15.5,         // Posisi awal = (15.5, 15.5) — tengah cell terakhir di kanan bawah map
  speed:0.013,             // Kecepatan bergerak (akan naik seiring waktu)
  baseSpeed:0.013,         // Kecepatan dasar — dipakai sebagai acuan saat scaling
  active:false,            // Monster belum aktif saat game mulai (delay 5 detik)
  startDelay:5000,         // Monster aktif setelah 5000ms (5 detik) sejak game dimulai
  breathPhase:0,           // Fase animasi "napas" monster — buat goyangan sprite
  stepTimer:0,             // Penghitung waktu antar langkah monster
  stepInterval:850         // Interval langkah monster = 850ms (semakin dekat, interval makin pendek)
};


// ═══════════════════════════════════════════════════════════════════════════════
// GAME STATE VARIABLES — Variabel status game global
// ═══════════════════════════════════════════════════════════════════════════════

let gameRunning=false;      // Apakah game sedang berjalan
let gamePaused=false;       // Apakah game sedang di-pause
let gameOver=false;         // Apakah game sudah selesai (menang/kalah)
let soundEnabled=false;     // Apakah suara aktif (default: mati)
let msgTimer=null;          // Timer ID untuk auto-hide pesan
let lastTime=0;             // Timestamp frame sebelumnya — buat hitung delta time
let animId=null;            // requestAnimationFrame ID — buat cancel animasi loop
let monsterStartTime=0;    // Timestamp saat game mulai — buat hitung delay monster
let stepFrame=0;            // Penghitung frame langkah player — trigger suara tiap 22 frame
let surviveTimer=SURVIVE_TIME; // Sisa waktu bertahan = 60 detik, countdown tiap frame
let doorUnlocked=false;     // Apakah pintu keluar sudah terbuka
let jumpscareActive=false;  // Apakah jumpscare sedang berlangsung
let jumpPhase=0;            // Progress jumpscare 0.0 → 1.0
let jumpStartTime=0;        // Timestamp saat jumpscare dimulai
const JUMP_DURATION=1600;   // Durasi jumpscare = 1600ms (1.6 detik)


// ═══════════════════════════════════════════════════════════════════════════════
// INPUT HANDLING — Tangani keyboard dan touch input
// ═══════════════════════════════════════════════════════════════════════════════

const keys={};              // Objek status tombol — keys['w']=true berarti tombol W ditekan

// Keyboard: saat tombol ditekan
document.addEventListener('keydown',function(e){
  keys[e.key.toLowerCase()]=true;     // Simpan status tombol (lowercase agar 'W' dan 'w' sama)
  if(!gameRunning)return;             // Kalau game belum mulai, abaikan input game
  if(e.key.toLowerCase()==='f')toggleLight();   // F = toggle flashlight on/off
  if(e.key==='Escape')togglePause();             // ESC = pause/unpause game
});

// Keyboard: saat tombol dilepas
document.addEventListener('keyup',function(e){
  keys[e.key.toLowerCase()]=false;    // Set status tombol = false (tidak ditekan)
});

// Touch controls: bind setiap tombol di .touch-controls
document.querySelectorAll('.touch-controls button').forEach(function(btn){
  var k=btn.dataset.key;              // Ambil atribut data-key (a/w/s/d/f)
  // pointerdown = jari menyentuh layar → aktifkan tombol
  btn.addEventListener('pointerdown',function(e){
    e.preventDefault();               // Cegah scrolling/zooming saat sentuh
    keys[k]=true;
    if(k==='f')toggleLight();        // Sentuh tombol F = toggle light
  });
  // pointerup = jari angkat dari layar → nonaktifkan tombol
  btn.addEventListener('pointerup',function(e){
    e.preventDefault();keys[k]=false;
  });
  // pointerleave = jari geser keluar tombol → nonaktifkan juga
  btn.addEventListener('pointerleave',function(e){keys[k]=false;});
});


// ═══════════════════════════════════════════════════════════════════════════════
// AUDIO SYSTEM — Sistem audio berbasis Web Audio API (semua synthesizer, 0 file)
// ═══════════════════════════════════════════════════════════════════════════════

var audioCtx=null;          // AudioContext — diinisialisasi saat user klik tombol (kebijakan browser)

function ensureAudio(){
  // Buat AudioContext baru jika belum ada (harus setelah user interaction menurut kebijakan browser)
  if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
}

function playTone(freq,type,duration,vol,delay){
  // Fungsi universal untuk memutar satu nada
  // freq = frekuensi Hz, type = 'sine'/'sawtooth'/'square', durasi detik, vol=volume, delay=tunda detik
  vol=vol||0.15;            // Default volume 15%
  delay=delay||0;           // Default tanpa tunda
  if(!soundEnabled||!audioCtx)return;  // Keluar jika suara mati atau audioCtx belum siap

  var t=audioCtx.currentTime+delay;    // Waktu mulai nada = waktu sekarang + delay
  var osc=audioCtx.createOscillator(); // Buat oscillator — sumber suara sinus/sawtooth/square
  var g=audioCtx.createGain();         // Buat gain node — untuk mengontrol volume

  osc.connect(g);                      // Oscillator → Gain
  g.connect(audioCtx.destination);     // Gain → Speaker
  osc.type=type;                       // Set gelombang: sine=halus, sawtooth=keras, square=melengking

  osc.frequency.setValueAtTime(freq,t);  // Set frekuensi nada
  g.gain.setValueAtTime(vol,t);          // Set volume pada waktu t
  // Exponential ramp: volume turun eksponensial dari vol → 0.001 (fade out)
  g.gain.exponentialRampToValueAtTime(0.001,t+duration);
  osc.start(t);                         // Mulai oscillator pada waktu t
  osc.stop(t+duration+0.02);           // Hentikan 0.02s setelah durasi (bersihkan)
}

// --- Efek Suara Spesifik ---

function playWinSound(){
  // Nada menang: 4 not naik (C5→E5→G5→C6), fade-in bertahap
  [523,659,784,1047].forEach(function(f,i){playTone(f,'sine',0.3,0.2,i*0.12);});
}

function playDeathSound(){
  // Suara kematian: 2 nada sawtooth rendah, gelap dan mengancam
  playTone(80,'sawtooth',0.8,0.35);         // Nada pertama: 80Hz, keras
  playTone(55,'sawtooth',1.1,0.28,0.18);    // Nada kedua: 55Hz, lebih rendah, tunda 0.18s
}

function playStepSound(){
  // Suara langkah player: nada sine rendah random (58-76Hz), sangat pendek & pelan
  playTone(58+Math.random()*18,'sine',0.09,0.06);
}

function playUnlockSound(){
  // Suara pintu terbuka: 3 nada naik (A3→E4→A4), memberi kesan "terbuka/berhasil"
  playTone(220,'sine',0.3,0.2);
  playTone(330,'sine',0.3,0.2,0.15);
  playTone(440,'sine',0.4,0.22,0.3);
}

function playMonsterStep(dist){
  // Suara langkah monster — volume berbanding terbalik dengan jarak
  if(!soundEnabled||!audioCtx)return;
  // Hitung volume: semakin dekat, semakin keras (max 55%)
  var vol=Math.min(0.55,(10-dist)/10*0.55);
  playTone(52,'sine',0.28,vol);               // Nada rendah utama
  playTone(36,'sawtooth',0.20,vol*0.55,0.06); // Nada sawtooth pelan sebagai harmonic
}

function playScream(){
  // Jeritan saat monster menangkap player — kombinasi sawtooth + square, dissonan
  if(!soundEnabled||!audioCtx)return;
  [180,360,90,270,540].forEach(function(f,i){
    playTone(f,'sawtooth',0.9,0.5,i*0.03);   // 5 nada sawtooth bertumpuk cepat
  });
  playTone(1200,'square',0.35,0.32,0.04);     // Nada tinggi square (melengking)
  playTone(2400,'square',0.22,0.20,0.07);     // Nada sangat tinggi square (menakutkan)
}


// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS — Fungsi bantu umum
// ═══════════════════════════════════════════════════════════════════════════════

function showMessage(text,duration){
  // Tampilkan pesan di layar (misal "EXIT OPEN") lalu auto-hide setelah duration ms
  duration=duration||2500;          // Default 2.5 detik
  msgEl.textContent=text;           // Set teks pesan
  msgEl.classList.add('visible');   // Tambah class CSS → opacity transition fade in
  clearTimeout(msgTimer);           // Batalkan timer sebelumnya (jika ada pesan lain tampil)
  msgTimer=setTimeout(function(){msgEl.classList.remove('visible');},duration); // Auto-hide setelah duration
}

function toggleLight(){
  // Toggle flashlight on/off — tapi hanya jika baterai masih ada
  if(player.battery<=0)return;      // Kalau baterai habis, tidak bisa nyalakan
  player.lightOn=!player.lightOn;   // Balik status: true→false atau false→true
}

function togglePause(){
  // Pause/unpause game — tidak bisa pause saat game over atau jumpscare
  if(gameOver||jumpscareActive)return;
  gamePaused=!gamePaused;
  if(!gamePaused)msgEl.classList.remove('visible'); // Sembunyikan pesan saat un-pause
}

function fmtTime(s){
  // Format detik jadi string "MM:SS" — contoh: 65 → "01:05"
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
}

function updateHUD(){
  // Perbarui semua elemen HUD setiap frame
  keysEl.textContent=fmtTime(surviveTimer);  // Update timer countdown
  // Jika sisa waktu ≤10 detik dan masih >0 → tambah class 'timer-danger' (warna merah + kedip)
  keysEl.className='hud-keys'+(surviveTimer<=10&&surviveTimer>0?' timer-danger':'');

  var pct=Math.ceil(player.battery);         // Persentase baterai (dibulatkan ke atas)
  // Atur opacity baterai: dari 0.25 (kosong) hingga 1.0 (penuh)
  batteryEl.style.opacity=0.25+(pct/100)*0.75;
  // Tampilkan baterai sebagai bar block chars: █ = terisi, ░ = kosong. 7 blok total.
  // padEnd(Math.round(pct/14), '█') = isi blok sesuai persentase (100/7 ≈ 14 per blok)
  // padEnd(7, '░') = sisa blok diisi karakter kosong
  batteryEl.textContent=''.padEnd(Math.round(pct/14),'\u2588').padEnd(7,'\u2591');

  exitEl.style.display=doorUnlocked?'':'none';     // Tampilkan "EXIT OPEN" hanya jika pintu sudah terbuka
  // Tampilkan "NO LIGHT" jika light off ATAU baterai habis
  lightEl.style.display=(!player.lightOn||player.battery<=0)?'':'none';
}


// ═══════════════════════════════════════════════════════════════════════════════
// LINE OF SIGHT & RAYCASTING — Deteksi penglihatan dan rendering 3D
// ═══════════════════════════════════════════════════════════════════════════════

function hasLOS(mx,my,px,py){
  // Line of Sight: cek apakah ada jalan lurus dari (mx,my) ke (px,py) tanpa dinding
  // Dipakai untuk cek apakah monster terlihat oleh player
  var dx=px-mx,dy=py-my;                       // Vektor dari monster ke player
  var dist=Math.sqrt(dx*dx+dy*dy);             // Jarak Euclidean
  var steps=Math.ceil(dist/0.05);              // Jumlah titik sampling (tiap 0.05 satuan)
  for(var i=1;i<steps;i++){                    // Iterasi dari monster ke player (skip titik awal)
    var t=i/steps;                             // Parameter 0→1 sepanjang garis
    // Cek cell di titik (mx + dx*t, my + dy*t). Kalau cell = 1 (dinding), LOS terhalang
    if(mapAt(mx+dx*t,my+dy*t)===1)return false;
  }
  return true;                                 // Tidak ada dinding → LOS jelas
}

function castRay(angle){
  // DDA Raycasting Algorithm — lempar satu ray dari posisi player ke arah angle
  // Mengembalikan {dist, side, cell}: jarak, sisi dinding (0=vertikal,1=horizontal), jenis cell

  var sinA=Math.sin(angle),cosA=Math.cos(angle);  // Sin dan cos dari sudut ray

  // Posisi awal ray = posisi player (dalam koordinat map)
  var mapX=Math.floor(player.x),mapY=Math.floor(player.y);

  // DDA grid traversal setup:
  // ddx = jarak ray harus menempuh 1 grid penuh di sumbu X
  // ddy = jarak ray harus menempuh 1 grid penuh di sumbu Y
  // Math.abs(1/cosA) = jarak horizontal per 1 unit grid
  var ddx=Math.abs(1/(cosA||1e-30)),ddy=Math.abs(1/(sinA||1e-30));
  // 1e-30 = epsilon kecil untuk cegah pembagian dengan 0

  var stepX,stepY,sdx,sdy,side=0;
  // stepX/stepY: arah langkah (+1 atau -1) tergantung arah ray
  // sdx/sdy: jarak kumulatif ray ke grid line berikutnya
  if(cosA<0){stepX=-1;sdx=(player.x-mapX)*ddx;}  // Ray ke kiri → step = -1, sdx = sisa jarak ke grid kiri
  else{stepX=1;sdx=(mapX+1-player.x)*ddx;}         // Ray ke kanan → step = +1, sdx = sisa jarak ke grid kanan
  if(sinA<0){stepY=-1;sdy=(player.y-mapY)*ddy;}   // Ray ke atas → step = -1
  else{stepY=1;sdy=(mapY+1-player.y)*ddy;}         // Ray ke bawah → step = +1

  var dist=0,cell=0;
  // Loop DDA: advance ray ke grid line berikutnya, cek cell
  for(var i=0;i<MAX_DEPTH*8;i++){
    // Langkah ke grid line terdekat: bandingkan sdx vs sdy
    if(sdx<sdy){sdx+=ddx;mapX+=stepX;side=0;}     // Grid line X lebih dekat → langkah horizontal
    else{sdy+=ddy;mapY+=stepY;side=1;}              // Grid line Y lebih dekat → langkah vertikal

    cell=mapAt(mapX,mapY);                          // Cek isi cell yang dituju ray

    // Kalau cell = 1 (dinding) atau 3 (pintu terkunci) → ray mengenai dinding, hitung jarak
    if(cell===1||cell===3){
      // Hitung jarak perpendicular (mencegah efek fish-eye):
      // Sisi horizontal (side=0): jarak = sdx - ddx (mundur 1 step)
      // Sisi vertikal (side=1): jarak = sdy - ddy
      dist=(side===0?sdx-ddx:sdy-ddy);
      break;                                        // Ray sudah mengenai dinding, keluar loop
    }
    if(dist>MAX_DEPTH)break;                        // Kalau ray sudah terlalu jauh, berhenti
  }
  return{dist:Math.max(dist,0.1),side:side,cell:cell};
  // Math.max(dist,0.1) cegah jarak 0 (bisa bagi 0 di tempat lain)
}


// ═══════════════════════════════════════════════════════════════════════════════
// RENDERER HELPERS — Fungsi bantu untuk rendering
// ═══════════════════════════════════════════════════════════════════════════════

function lerp(a,b,t){
  // Linear interpolation: interpolasi antara nilai a dan b berdasarkan parameter t (0→1)
  // t=0 menghasilkan a, t=1 menghasilkan b
  return a+(b-a)*t;
}

function lerpC(c1,c2,t){
  // Interpolasi antara dua warna RGB (arrays [r,g,b])
  // Mengembalikan array warna baru dengan komponen R, G, B yang diinterpolasi
  return[Math.round(lerp(c1[0],c2[0],t)),Math.round(lerp(c1[1],c2[1],t)),Math.round(lerp(c1[2],c2[2],t))];
}

function rgb(c){return 'rgb('+c[0]+','+c[1]+','+c[2]+')';}
// Konversi array [r,g,b] → string CSS "rgb(r,g,b)"

function rgba(r,g,b,a){return 'rgba('+r+','+g+','+b+','+a+')';}
// Konversi RGBA → string CSS "rgba(r,g,b,a)"

// --- Palet Warna ---
var WALL_LIT=[[80,60,55],[55,42,38]];    // Dinding terkena cahay [sisi terang, sisi gelap] — coklat kecoklatan
var WALL_DARK=[[28,22,20],[18,14,12]];   // Dinding tanpa cahay — sangat gelap, nyaris hitam
var DOOR_LIT=[[120,85,28],[90,60,18]];   // Pintu terkena cahay — kuning keemasan
var DOOR_DARK=[[50,30,6],[32,18,3]];     // Pintu gelap — coklat tua
var FL_NEAR=[20,20,18],FL_FAR=[10,10,9]; // Lantai: terang (dekat) vs gelap (jauh) — abu gelap
var CL_NEAR=[12,12,11],CL_FAR=[6,6,6];   // Langit-langit: terang vs gelap — lebih gelap dari lantai


// ═══════════════════════════════════════════════════════════════════════════════
// HUMANOID MONSTER SPRITE — Render monster humanoid di canvas (procedural, tanpa gambar)
// ═══════════════════════════════════════════════════════════════════════════════

function drawHumanoid(sx,sh,sw,st,litF2,breath){
  // sx = posisi X tengah sprite di layar
  // sh = tinggi sprite (skala sesuai jarak)
  // sw = lebar sprite (proporsi tinggi × 0.7)
  // st = posisi Y atas sprite di layar
  // litF2 = fraksi cahaya (0=totally gelap, 1=terang penuh)
  // breath = fase animasi napas (0 → 2π, berulang)

  if(sw<2||sh<2)return;  // Terlalu jauh/kecil untuk dirender → skip

  // --- Animasi body ---
  var sway=Math.round(Math.sin(breath*0.5)*sw*0.05);       // Goyangan badan halus (5% dari lebar)
  var headH=Math.round(sh*0.20),neckH=Math.round(sh*0.04); // Kepala = 20% tinggi, leher = 4%
  var torsoH=Math.round(sh*0.28),hipH=Math.round(sh*0.08); // Badan = 28%, pinggul = 8%
  var legH=Math.round(sh*0.40);                              // Kaki = 40% tinggi total
  var torsoW=Math.round(sw*0.52),headW=Math.round(sw*0.38); // Lebar badan = 52%, kepala = 38% lebar
  var shoulderW=Math.round(sw*0.72);                          // Lebar bahu = 72% lebar
  var armW=Math.max(1,Math.round(sw*0.11)),armH=Math.round(sh*0.46); // Lengan = 11% lebar, 46% tinggi
  var legW=Math.max(1,Math.round(sw*0.22)),legGap=Math.max(1,Math.round(sw*0.06)); // Kaki = 22% lebar, gap 6%

  // --- Posisi Y setiap bagian tubuh ---
  var headY=st,neckY=headY+headH,torsoY=neckY+neckH;
  var hipY=torsoY+torsoH,legY=hipY+hipH;

  var cx=sx+sway;  // Pusat X = posisi sprite + goyangan

  // --- Warna tubuh berdasarkan pencahayaan ---
  var r=Math.round(lerp(8,55,litF2));   // Red: 8 (gelap) → 55 (terang)
  var g=Math.round(lerp(6,42,litF2));   // Green: 6 → 42
  var b=Math.round(lerp(6,40,litF2));   // Blue: 6 → 40 — keseluruhan bernuansa gelap/merah
  var bodyCol=rgba(r,g,b,0.96);         // Warna tubuh utama (sedikit transparan)
  var darkCol=rgba(Math.round(r*0.55),Math.round(g*0.55),Math.round(b*0.55),0.90); // Warna lebih gelap (bayangan)

  // --- Animasi kaki ---
  var legAnim=Math.round(Math.sin(breath*2.2)*sh*0.03); // Ayunan kaki sinkron dengan napas

  // Gambar kaki (2 persegi panjang)
  ctx.fillStyle=darkCol;
  ctx.fillRect(cx-legGap-legW,legY,legW,legH-legAnim);   // Kaki kiri
  ctx.fillRect(cx+legGap,legY+legAnim,legW,legH);         // Kaki kanan (offset berlawanan)

  // --- Gambar pinggul + badan (2 persegi panjang bertumpuk) ---
  ctx.fillStyle=bodyCol;
  ctx.fillRect(cx-Math.round((torsoW+legGap*2)/2),hipY,torsoW+legGap*2,hipH); // Pinggul
  ctx.fillRect(cx-Math.round(torsoW/2),torsoY,torsoW,torsoH);                  // Badan/torso

  // --- Gambar lengan (rotasi untuk efek ayunan) ---
  var armSwing=Math.round(Math.sin(breath*2.2+1.2)*sh*0.025); // Ayunan lengan (phase offset 1.2)

  ctx.fillStyle=darkCol;
  // Lengan kiri: translate ke bahu kiri → rotasi → gambar
  ctx.save();  // Simpan state canvas (transform saat ini)
  ctx.translate(cx-Math.round(shoulderW/2),torsoY);  // Pindah origin ke bahu kiri
  ctx.rotate(-0.18+Math.sin(breath*2.2)*0.06);       // Rotasi lengan (base -0.18 rad + animasi)
  ctx.fillRect(-armW,armSwing,armW,armH);             // Gambar lengan kiri
  ctx.restore();  // Kembalikan state canvas

  // Lengan kanan: mirror dari lengan kiri
  ctx.save();
  ctx.translate(cx+Math.round(shoulderW/2),torsoY);
  ctx.rotate(0.18-Math.sin(breath*2.2)*0.06);
  ctx.fillRect(0,-armSwing,armW,armH);
  ctx.restore();

  // --- Gambar leher + kepala ---
  var neckW=Math.round(headW*0.42);       // Leher = 42% lebar kepala
  ctx.fillStyle=bodyCol;
  ctx.fillRect(cx-Math.round(neckW/2),neckY,neckW,neckH+1); // Leher (+1 cegah gap)
  ctx.fillRect(cx-Math.round(headW/2),headY,headW,headH);    // Kepala (persegi panjang)

  // --- Mata merah menyala (hanya terlihat jika ada cahaya + cukup besar) ---
  if(litF2>0.06&&headW>=4){
    var eyeW=Math.max(1,Math.round(headW*0.20));   // Lebar mata = 20% lebar kepala
    var eyeH=Math.max(1,Math.round(headH*0.18));   // Tinggi mata = 18% tinggi kepala
    var eyeY=headY+Math.round(headH*0.40);         // Posisi Y mata = 40% dari atas kepala

    // Alpha mata berdenyut: berkedip mengikuti napas + threshold cahaya minimum
    var eyeAlpha=Math.min(1,(litF2-0.06)*5)*(0.75+Math.sin(breath*4.1)*0.25);
    ctx.fillStyle=rgba(255,20,10,eyeAlpha);  // Merah terang (#FF140A)
    // Mata kiri
    ctx.fillRect(cx-Math.round(headW*0.26)-Math.round(eyeW/2),eyeY,eyeW,eyeH);
    // Mata kanan
    ctx.fillRect(cx+Math.round(headW*0.26)-Math.round(eyeW/2),eyeY,eyeW,eyeH);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// JUMPSCARE FACE — Wajah menakutkan yang digambar langsung di canvas
// ═══════════════════════════════════════════════════════════════════════════════

function drawJumpscareFace(phase){
  // phase = progress 0.0 → 1.0 sepanjang JUMP_DURATION (1.6 detik)

  // --- Background: awalnya putih penuh, lalu perlahan gelap ---
  var alpha=phase<0.55?1.0:1.0-(phase-0.55)/0.45; // Mulai fade out di 55% → 0 di 100%
  // Warna background: merah cerah (0-25%), lalu fade ke merah gelap
  var bgR=phase<0.25?255:Math.round(lerp(255,100,Math.min(1,(phase-0.25)/0.3)));
  var bgG=phase<0.25?255:Math.round(lerp(255,0,Math.min(1,(phase-0.25)/0.3)));
  var bgB=phase<0.25?255:Math.round(lerp(255,0,Math.min(1,(phase-0.25)/0.3)));
  ctx.fillStyle=rgba(bgR,bgG,bgB,alpha);
  ctx.fillRect(0,0,W,H);  // Tutup seluruh layar dengan warna background

  if(phase<0.10)return;    // 10% pertama: hanya background merah (efek kejutan warna)

  // --- Munculkan wajah grotesque ---
  var fA=Math.min(1,(phase-0.10)/0.12)*alpha; // Fade-in wajah: mulai di 10%, penuh di 22%
  // Guncangan acak (shake effect)
  var tx=(Math.random()-0.5)*4,ty=(Math.random()-0.5)*4;
  ctx.save();
  ctx.translate(W/2+tx,H/2+ty); // Pindah origin ke tengah layar + shake

  // --- Bentuk wajah: elips gelap ---
  var hw=W*0.44,hh=H*0.70;       // Setengah lebar & tinggi wajah
  ctx.fillStyle=rgba(18,10,8,fA); // Wajah sangat gelap (nyaris hitam)
  ctx.beginPath();
  ctx.ellipse(0,0,hw,hh,0,0,Math.PI*2); // Elips besar = bentuk kepala
  ctx.fill();

  // --- Mata: 2 elips hitam besar ---
  var eox=hw*0.30,eoy=-hh*0.12;   // Posisi offset mata (30% dari pusat horizontal, 12% ke atas)
  var erx=hw*0.19,ery=hh*0.16;    // Ukuran mata (19% lebar, 16% tinggi wajah)
  ctx.fillStyle=rgba(0,0,0,fA);   // Mata hitam pekat
  ctx.beginPath();ctx.ellipse(-eox,eoy,erx,ery,0,0,Math.PI*2);ctx.fill(); // Mata kiri
  ctx.beginPath();ctx.ellipse(eox,eoy,erx,ery,0,0,Math.PI*2);ctx.fill();  // Mata kanan

  // --- Pupil putih kecil di mata ---
  var pupR=erx*0.38;               // Pupil = 38% radius mata
  ctx.fillStyle=rgba(255,255,240,fA*0.95); // Putih kekuningan
  ctx.beginPath();ctx.ellipse(-eox,eoy,pupR,pupR*1.2,0,0,Math.PI*2);ctx.fill(); // Pupil kiri
  ctx.beginPath();ctx.ellipse(eox,eoy,pupR,pupR*1.2,0,0,Math.PI*2);ctx.fill();  // Pupil kanan

  // --- Lingkaran merah di sekitar pupil (bloodshot) ---
  ctx.strokeStyle=rgba(200,10,5,fA*0.8); // Merah darah
  ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(-eox,eoy,pupR*1.5,pupR*1.8,0,0,Math.PI*2);ctx.stroke(); // Kiri
  ctx.beginPath();ctx.ellipse(eox,eoy,pupR*1.5,pupR*1.8,0,0,Math.PI*2);ctx.stroke();  // Kanan

  // --- Lubang hidung (2 persegi kecil) ---
  ctx.fillStyle=rgba(0,0,0,fA*0.75);
  ctx.fillRect(-8,hh*0.05,5,12);  // Lubang kiri
  ctx.fillRect(3,hh*0.05,5,12);   // Lubang kanan

  // --- Mulut: barisan gigi ---
  var mW=hw*0.72;                // Lebar mulut = 72% lebar wajah
  var mY=hh*0.30;                // Posisi Y mulut = 30% ke bawah dari pusat
  var teeth=12;                  // Jumlah gigi
  var toothH=hh*0.09;           // Tinggi gigi

  // Isi mulut: pola gigi atas-bawah (zigzag)
  ctx.fillStyle=rgba(100,5,5,fA*0.9); // Merah gelap (darah/gusi)
  ctx.beginPath();
  ctx.moveTo(-mW,mY);           // Mulai dari kiri
  for(var i=0;i<=teeth;i++){
    // Setiap gigi: naik (i%2==0) atau turun (i%2==1) → pola zigzag gigi
    var tx2=-mW+(i/teeth)*mW*2,ty2=mY+(i%2===0?toothH:0);
    ctx.lineTo(tx2,ty2);
  }
  ctx.lineTo(mW,mY+toothH+6);ctx.lineTo(-mW,mY+toothH+6);ctx.closePath();ctx.fill();

  // Outline gigi: warna putih kekuningan
  ctx.strokeStyle=rgba(220,210,190,fA);ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-mW,mY);
  for(var i=0;i<=teeth;i++){
    var tx2=-mW+(i/teeth)*mW*2,ty2=mY+(i%2===0?toothH:0);
    ctx.lineTo(tx2,ty2);
  }
  ctx.stroke();

  // Garis horizontal = bibir/garis mulut
  ctx.strokeStyle=rgba(0,0,0,fA);ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-mW,mY);ctx.lineTo(mW,mY);ctx.stroke();

  // --- Urat/vein di sekitar mata ---
  ctx.strokeStyle=rgba(90,0,0,fA*0.5); // Merah gelap, semi-transparan
  ctx.lineWidth=1;
  for(var eye=-1;eye<=1;eye+=2){ // eye = -1 (kiri), +1 (kanan)
    for(var v=0;v<7;v++){ // 7 urat per mata
      var ang=(v/7)*Math.PI*2; // Sudut tersebar merata
      var ex=eye*eox+Math.cos(ang)*erx; // Titik awal urat = tepi mata
      var ey=eoy+Math.sin(ang)*ery;
      ctx.beginPath();ctx.moveTo(ex,ey);
      // Garis urat memanjang dari mata ke wajah
      ctx.lineTo(ex+Math.cos(ang)*hw*0.28,ey+Math.sin(ang)*hh*0.28);
      ctx.stroke();
    }
  }
  ctx.restore(); // Kembalikan state canvas
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION — Fungsi rendering utama (dipanggil tiap frame)
// ═══════════════════════════════════════════════════════════════════════════════

function render(){
  // --- Hitung faktor pencahayaan ---
  var lightF=(player.lightOn&&player.battery>0)?1:0.08;
  // lightF = 1.0 jika flashlight menyala, 0.08 jika mati (hanya 8% visibility = gelap gulita)
  var maxLight=10*lightF; // Jarak maksimal cahaya: 10 satuan jika light on, 0.8 jika light off

  // --- Render Lantai & Langit-langit (per baris horizontal) ---
  for(var y=0;y<H;y++){
    var isFloor=y>H/2;                       // Setengah bawah = lantai, setengah atas = langit-langit
    // Hitung jarak baris dari tengah layar (perspective projection)
    // Semakin jauh dari tengah, semakin jauh jarak "virtual"
    var rowDist=(H*0.5)/Math.abs(y-H/2+0.001);
    // 0.001 = epsilon cegah pembagian dengan 0 saat y = H/2
    var t=Math.min(rowDist/maxLight,1);      // Parameter warna 0 (dekat) → 1 (jauh), dibatasi max 1

    // Interpolasi warna: dekat = terang (FL_NEAR/CL_NEAR), jauh = gelap (FL_FAR/CL_FAR)
    var c=lerpC(isFloor?FL_NEAR:CL_NEAR,isFloor?FL_FAR:CL_FAR,t);
    c=c.map(function(v){return Math.round(v*lightF);}); // Kalikan semua komponen dengan lightF
    ctx.fillStyle=rgb(c);ctx.fillRect(0,y,W,1);        // Gambar 1 baris horizontal penuh
  }

  // --- Render Dinding + Pintu (per kolom vertical, 1 ray per kolom) ---
  for(var col=0;col<NUM_RAYS;col++){
    // Hitung sudut ray: dari kiri FOV ke kanan FOV
    // col/NUM_RAYS = fraksi kolom (0→1), dikali FOV, ditambah offset
    var rayAngle=player.angle-HALF_FOV+(col/NUM_RAYS)*FOV;

    // Lemparkan ray ke arah ini
    var ray=castRay(rayAngle);

    // Corrected distance: kalikan cos untuk hilangkan efek fish-eye
    // Tanpa koreksi, dinding akan melengkung karena ray di tepi FOV lebih panjang
    var corrDist=ray.dist*Math.cos(rayAngle-player.angle);

    // Hitung tinggi dinding berdasarkan jarak (perspective)
    var wallH=Math.round(H/corrDist);
    // Batasi area gambar agar tidak keluar canvas
    var top=Math.max(0,Math.floor((H-wallH)/2));
    var bottom=Math.min(H,Math.floor((H+wallH)/2));

    // Fraksi cahaya berdasarkan jarak: dekat = 1 (terang), jauh = 0 (gelap)
    var litFrac=Math.max(0,1-corrDist/maxLight);

    // --- Pintu (cell = 3) ---
    if(ray.cell===3){
      // Efek berkedip saat timer < 10 detik (pintu bergetar/bersinar)
      var tp=surviveTimer<10?0.5+0.5*Math.abs(Math.sin(Date.now()*0.006)):0;
      // tp = 0 jika timer >10, oscillate 0→1 jika timer <10
      // Warna pintu = interpolasi antara gelap dan terang + efek kedip
      var dc=lerpC(DOOR_DARK[ray.side],DOOR_LIT[ray.side],(litFrac+tp*0.35)*lightF);
      ctx.fillStyle=rgb(dc);ctx.fillRect(col,top,1,bottom-top);

      // Tambahkan efek cahaya keemasan pada pintu saat timer <10 dan dekat
      if(surviveTimer<10&&corrDist<6){
        ctx.fillStyle=rgba(255,180,30,tp*0.25*Math.max(0,1-corrDist/6));
        ctx.fillRect(col,top,1,bottom-top);
      }
    }else{
      // --- Dinding biasa (cell = 1) ---
      // Warna = interpolasi antara WALL_DARK dan WALL_LIT berdasarkan jarak + cahaya
      ctx.fillStyle=rgb(lerpC(WALL_DARK[ray.side],WALL_LIT[ray.side],litFrac*lightF));
      ctx.fillRect(col,top,1,bottom-top); // Gambar 1 kolom vertical (lebar 1 pixel)
    }
  }

  // --- Render Monster (jika aktif) ---
  if(monster.active){
    // Hitung vektor dan jarak dari player ke monster
    var dx=monster.x-player.x,dy=monster.y-player.y;
    var mDist=Math.sqrt(dx*dx+dy*dy);

    // Monster hanya terlihat jika:
    // 1. Jarak < MAX_DEPTH (16 satuan)
    // 2. Ada Line of Sight (tidak ada dinding penghalang)
    if(mDist<MAX_DEPTH&&hasLOS(monster.x,monster.y,player.x,player.y)){
      // Hitung sudut monster relatif terhadap sudut pandang player
      var mAngle=Math.atan2(dy,dx)-player.angle;
      // Normalisasi sudut ke range [-π, +π]
      while(mAngle>Math.PI)mAngle-=2*Math.PI;
      while(mAngle<-Math.PI)mAngle+=2*Math.PI;

      // Monster terlihat hanya jika dalam FOV (±30° + margin 0.3 rad ≈ 17°)
      if(Math.abs(mAngle)<HALF_FOV+0.3){
        // Hitung posisi X di layar: dari kiri (-W/2) ke kanan (+W/2)
        var sx=Math.round((0.5+mAngle/FOV)*W);
        // Hitung ukuran sprite berdasarkan jarak
        var sh=Math.round(H/mDist);         // Tinggi = tinggi layar / jarak
        var sw=Math.round(sh*0.7);           // Lebar = 70% tinggi (proporsi humanoid)
        var st=Math.floor((H-sh)/2);         // Posisi Y atas = tengah layar - setengah tinggi

        // Faktor cahaya untuk monster
        var litF2=Math.max(0,1-mDist/maxLight);
        // Gambar monster
        drawHumanoid(sx,sh,sw,st,litF2,monster.breathPhase);
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// MOVEMENT — Sistem pergerakan player
// ═══════════════════════════════════════════════════════════════════════════════

function tryMove(nx,ny){
  // Coba pindah ke posisi baru (nx, ny)
  // Axis-separated collision: cek X dan Y secara terpisah agar player bisa "slide" di dinding
  if(!isWall(nx,player.y))player.x=nx;  // Coba gerak horizontal dulu — kalau tidak nabrak, terapkan
  if(!isWall(player.x,ny))player.y=ny;  // Coba gerak vertical — kalau tidak nabrak, terapkan
  // Contoh: kalau X nabrak tapi Y tidak → player geser ke samping saja (slide along wall)
}


// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTIONS — Deteksi interaksi player dengan objek
// ═══════════════════════════════════════════════════════════════════════════════

function checkInteractions(){
  // Cek apakah player berada di cell type 4 (pintu keluar yang sudah terbuka)
  if(mapAt(player.x,player.y)===4)triggerWin(); // Player mencapai pintu keluar → menang!
}


// ═══════════════════════════════════════════════════════════════════════════════
// JUMPSCARE — Sistem jumpscare saat monster menangkap player
// ═══════════════════════════════════════════════════════════════════════════════

function startJumpscare(){
  if(jumpscareActive||gameOver)return;  // Jangan mulai jumpscare jika sudah aktif atau game selesai
  jumpscareActive=true;                 // Aktifkan mode jumpscare
  jumpPhase=0;                          // Reset progress ke 0
  jumpStartTime=performance.now();      // Catat waktu mulai
  playScream();                         // Mainkan jeritan
  // Hapus semua CSS effect classes agar tidak konflik dengan jumpscare
  gameSection.classList.remove('danger','shake','imminent','monster-flicker');
}

function updateJumpscare(now){
  if(!jumpscareActive)return;           // Keluar jika jumpscare tidak aktif
  // Hitung progress jumpscare: 0.0 → 1.0 selama JUMP_DURATION (1600ms)
  jumpPhase=Math.min(1,(now-jumpStartTime)/JUMP_DURATION);
  drawJumpscareFace(jumpPhase);         // Gambar wajah menakutkan
  // Ketika progress mencapai 1.0 (selesai) → trigger kematian
  if(jumpPhase>=1){jumpscareActive=false;triggerDeath();}
}


// ═══════════════════════════════════════════════════════════════════════════════
// MONSTER AI — Logika kecerdasan buatan monster
// ═══════════════════════════════════════════════════════════════════════════════

function updateMonster(now,dt){
  // --- Aktivasi monster setelah delay ---
  if(!monster.active){
    // Cek apakah sudah waktunya monster aktif (startDelay = 5000ms)
    if(now-monsterStartTime>monster.startDelay){
      monster.active=true;  // Monster mulai bergerak!
      // Efek visual: flash layar saat monster aktif
      gameSection.classList.add('speed-flash');
      setTimeout(function(){gameSection.classList.remove('speed-flash');},400);
      // Suara dramatis saat monster aktif
      if(soundEnabled){
        playTone(55,'sawtooth',1.2,0.40);      // Nada rendah panjang
        playTone(40,'sawtooth',1.5,0.30,0.20);  // Nada lebih rendah, tunda
      }
    }
    return;  // Belum aktif → keluar, belum gerak
  }

  // --- Update animasi napas ---
  // Fase napas terus berputar 0 → 2π, kecepatan tetap
  monster.breathPhase=(monster.breathPhase+0.04)%(Math.PI*2);

  // --- Update kecepatan monster (makin cepat seiring waktu) ---
  var elapsed=(SURVIVE_TIME-surviveTimer)/SURVIVE_TIME; // Fraksi waktu berlalu: 0.0 (awal) → 1.0 (60s)
  monster.speed=monster.baseSpeed+elapsed*0.024;
  // Contoh: di detik 0 → speed=0.013, detik 30 → speed=0.025, detik 60 → speed=0.037

  // --- Pergerakan monster: chase langsung ke player ---
  var dx=player.x-monster.x,dy=player.y-monster.y;  // Vektor ke player
  var dist=Math.sqrt(dx*dx+dy*dy);                   // Jarak Euclidean

  if(dist>0.01){  // Hanya gerak jika jarak > 0.01 (cegah divide-by-zero)
    // Normalisasi vektor (direction vector) lalu kali speed
    var nx=monster.x+(dx/dist)*monster.speed;  // Posisi X baru
    var ny=monster.y+(dy/dist)*monster.speed;  // Posisi Y baru
    
    // Cek apakah posisi baru bebas dari dinding
    var canMoveX=!isWall(nx,monster.y);
    var canMoveY=!isWall(monster.x,ny);
    var canMoveDiagonal=!isWall(nx,ny);
    
    // Strategi: coba gerak diagonal dulu, kalau nabrak coba axis-separated, kalau masih nabrak coba slide
    if(canMoveDiagonal&&canMoveX&&canMoveY){
      // Bisa gerak diagonal langsung
      monster.x=nx;
      monster.y=ny;
    }else if(canMoveX||canMoveY){
      // Salah satu axis terbuka → axis-separated movement
      if(canMoveX)monster.x=nx;
      if(canMoveY)monster.y=ny;
    }else{
      // Kedua axis terblokir → coba slide di sepanjang dinding (pathfinding sederhana)
      // Coba gerak perpendicular ke arah player
      var perpX=-dy/dist*monster.speed;  // Perpendicular vector
      var perpY=dx/dist*monster.speed;
      
      // Coba slide ke kanan dinding
      if(!isWall(monster.x+perpX,monster.y+perpY)){
        monster.x+=perpX;
        monster.y+=perpY;
      }else if(!isWall(monster.x-perpX,monster.y-perpY)){
        // Coba slide ke kiri dinding
        monster.x-=perpX;
        monster.y-=perpY;
      }
    }
  }

  // --- Suara langkah monster (semakin dekat, interval makin pendek) ---
  if(dist<10){
    monster.stepTimer+=dt;  // Tambah waktu berlalu
    // Interval langkah = proporsional dengan jarak: dekat = cepat, jauh = lambat
    var interval=Math.max(180,monster.stepInterval*(dist/10));
    // Minimal interval = 180ms (paling cepat saat sangat dekat)
    if(monster.stepTimer>=interval){monster.stepTimer=0;playMonsterStep(dist);}
  }else{monster.stepTimer=0;} // Reset timer jika jauh

  // --- Efek visual berdasarkan jarak monster ---
  if(dist<2.5){
    // SANGAT DEKAT: semua efek aktif + monster flicker
    gameSection.classList.add('danger','imminent','shake','monster-flicker');
    // Suara random pelan saat monster sangat dekat
    if(soundEnabled&&Math.random()<0.015)playTone(65+Math.random()*55,'sawtooth',0.22,0.18);
  }else if(dist<5){
    // DEKAT: red vignette + screen shake
    gameSection.classList.add('danger','shake');
    gameSection.classList.remove('imminent','monster-flicker');
    if(soundEnabled&&Math.random()<0.006)playTone(75+Math.random()*35,'sawtooth',0.35,0.12);
  }else if(dist<8){
    // SEDANG: hanya red vignette
    gameSection.classList.add('danger');
    gameSection.classList.remove('imminent','shake','monster-flicker');
  }else{
    // JAUH: tidak ada efek
    gameSection.classList.remove('danger','imminent','shake','monster-flicker');
  }

  // --- Deteksi tangkapan: monster cukup dekat untuk menangkap ---
  if(dist<0.55&&!jumpscareActive&&!gameOver)startJumpscare();
}


// ═══════════════════════════════════════════════════════════════════════════════
// SURVIVE TIMER — Hitung mundur waktu bertahan hidup
// ═══════════════════════════════════════════════════════════════════════════════

function updateSurviveTimer(dt){
  if(surviveTimer<=0||gameOver||jumpscareActive)return; // Jangan update jika sudah selesai
  // Kurangi timer: dt dalam ms, dibagi 1000 → detik
  surviveTimer=Math.max(0,surviveTimer-dt/1000);

  // Ketika timer mencapai 0 dan pintu belum terbuka
  if(surviveTimer<=0&&!doorUnlocked){
    doorUnlocked=true;                // Tandai pintu sudah terbuka
    setMap(15,15,4);                  // Ganti cell (15,15) dari 3 (terkunci) → 4 (bisa dilewati)
    playUnlockSound();                // Mainkan suara pintu terbuka
    showMessage('EXIT OPEN',3500);    // Tampilkan pesan "EXIT OPEN" selama 3.5 detik
    // Efek visual flash
    gameSection.classList.add('speed-flash');
    setTimeout(function(){gameSection.classList.remove('speed-flash');},700);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// WIN / LOSE — Sistem kemenangan dan kekalahan
// ═══════════════════════════════════════════════════════════════════════════════

function showEndScreen(eyebrow,titleHTML,tagline,objective,btnText,note){
  // Fungsi universal untuk menampilkan end screen (menang/kalah)
  gameRunning=false;     // Hentikan game loop
  gameOver=true;         // Tandai game selesai
  cancelAnimationFrame(animId); // Hentikan animasi

  // Hapus semua CSS effect classes
  gameSection.classList.remove('danger','shake','imminent','monster-flicker','speed-flash','flicker');

  // Update semua teks end screen
  document.getElementById('eyebrow').textContent=eyebrow;     // "SURVIVAL HORROR" / "YOU SURVIVED" / "GAME OVER"
  document.getElementById('title').innerHTML=titleHTML;         // "THE HALLWAY" / "YOU ESCAPED." / "YOU DIED."
  document.getElementById('tagline').textContent=tagline;       // Subtitle
  document.getElementById('objective').textContent=objective;   // Instruksi
  startBtn.textContent=btnText;                                 // Teks tombol: "PLAY AGAIN ↗" / "TRY AGAIN ↗"
  document.getElementById('screen-note').textContent=note;      // Catatan bawah
  screen.style.display='';          // Tampilkan overlay screen
  hud.classList.add('hidden');      // Sembunyikan HUD
}

function triggerWin(){
  if(gameOver)return;  // Cegah trigger ganda
  playWinSound();     // Mainkan musik menang
  // Tampilkan end screen kemenangan
  showEndScreen(
    'YOU SURVIVED',
    'YOU<br>ESCAPED<span class="title-dot">.</span>',
    'You made it out alive.',
    '',
    'PLAY AGAIN \u2197',  // ↗
    ''
  );
}

function triggerDeath(){
  if(gameOver)return;  // Cegah trigger ganda
  playDeathSound();    // Mainkan suara kematian
  // Tampilkan end screen kematian
  showEndScreen(
    'GAME OVER',
    'YOU<br>DIED<span class="title-dot">.</span>',
    '',
    '',
    'TRY AGAIN \u2197',  // ↗
    ''
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// GAME LOOP — Loop utama game (dipanggil ~60x per detik)
// ═══════════════════════════════════════════════════════════════════════════════

function gameLoop(timestamp){
  if(!gameRunning)return;             // Keluar jika game tidak berjalan

  // --- Handle Pause ---
  if(gamePaused){
    animId=requestAnimationFrame(gameLoop); // Tetap jadwalkan frame berikutnya (agar bisa resume)
    return;                                // Tidak update apa-apa saat pause
  }

  // --- Hitung Delta Time ---
  var dt=Math.min(timestamp-lastTime,50); // dt = waktu antar frame dalam ms. Max 50ms (cegah lonjakan besar)
  lastTime=timestamp;                      // Simpan timestamp frame ini

  // --- Update Input & Pergerakan Player ---
  if(!jumpscareActive){  // Player tidak bisa bergerak saat jumpscare
    // Skala kecepatan berdasarkan dt: normalisasi ke 60fps (16.67ms per frame)
    var ms=MOVE_SPEED*(dt/16.67);  // Move speed
    var ts=TURN_SPEED*(dt/16.67);  // Turn speed
    var moved=false;               // Flag: apakah player bergerak (untuk trigger suara langkah)

    // W / Arrow Up → bergerak maju (sepanjang sudut saat ini)
    if(keys['w']||keys['arrowup']){
      tryMove(player.x+Math.cos(player.angle)*ms,player.y+Math.sin(player.angle)*ms);
      moved=true;
    }
    // S / Arrow Down → bergerak mundur (kebalikan sudut)
    if(keys['s']||keys['arrowdown']){
      tryMove(player.x-Math.cos(player.angle)*ms,player.y-Math.sin(player.angle)*ms);
      moved=true;
    }
    // A / Arrow Left → putar kiri (kurangi sudut)
    if(keys['a']||keys['arrowleft'])player.angle-=ts;
    // D / Arrow Right → putar kanan (tambah sudut)
    if(keys['d']||keys['arrowright'])player.angle+=ts;

    // Suara langkah: mainkan setiap 22 frame saat bergerak
    if(moved&&soundEnabled){
      stepFrame++;
      if(stepFrame%22===0)playStepSound();
    }
  }

  // --- Drain Baterai Flashlight ---
  if(player.lightOn&&player.battery>0){
    // Kurangi baterai: BATTERY_DRAIN per frame, diskalakan dengan dt
    player.battery=Math.max(0,player.battery-BATTERY_DRAIN*(dt/16.67));
    // Kalau baterai habis, matikan light otomatis
    if(player.battery<=0)player.lightOn=false;
  }

  // --- Update Timer Bertahan Hidup ---
  updateSurviveTimer(dt);

  // --- Render Frame ---
  render();

  // --- Update Monster & Interaksi ---
  if(jumpscareActive){
    updateJumpscare(timestamp);  // Update animasi jumpscare
  }else{
    updateMonster(timestamp,dt); // Update AI monster
    checkInteractions();         // Cek apakah player mencapai pintu keluar
  }

  // --- Update HUD ---
  updateHUD();

  // --- Jadwalkan Frame Berikutnya ---
  animId=requestAnimationFrame(gameLoop);
}


// ═══════════════════════════════════════════════════════════════════════════════
// GAME START — Fungsi inisialisasi saat game dimulai
// ═══════════════════════════════════════════════════════════════════════════════

function startGame(){
  // --- Reset Map ---
  MAP=RAW_MAP.slice();  // Salin ulang map mentah (pintu yang sudah terbuka kembali terkunci)

  // --- Reset Player ---
  player.x=1.5;player.y=1.5;       // Posisi awal: kiri atas
  player.angle=0;                    // Menghadap kanan
  player.lightOn=true;               // Flashlight menyala
  player.battery=100;                // Baterai penuh

  // --- Reset Monster ---
  monster.x=15.5;monster.y=15.5;    // Posisi awal: kanan bawah
  monster.active=false;              // Belum aktif (delay 5 detik)
  monster.speed=monster.baseSpeed;   // Reset kecepatan
  monster.breathPhase=0;             // Reset animasi
  monster.stepTimer=0;
  monster.stepInterval=850;

  // --- Reset State Game ---
  gameOver=false;gamePaused=false;gameRunning=true;stepFrame=0;
  surviveTimer=SURVIVE_TIME;         // Reset timer ke 60 detik
  doorUnlocked=false;                // Pintu terkunci
  jumpscareActive=false;jumpPhase=0;

  // --- Bersihkan CSS classes ---
  gameSection.classList.remove('danger','shake','flicker','imminent','monster-flicker','speed-flash');
  msgEl.classList.remove('visible');  // Sembunyikan pesan

  // --- Tampilkan HUD, sembunyikan screen ---
  screen.style.display='none';
  hud.classList.remove('hidden');

  updateHUD();  // Update tampilan HUD sekali

  // --- Mulai Game Loop ---
  cancelAnimationFrame(animId);  // Batalkan loop sebelumnya (jika ada)
  animId=requestAnimationFrame(function(ts){
    lastTime=ts;                  // Inisialisasi timestamp pertama
    monsterStartTime=ts;          // Catat waktu mulai untuk delay monster
    gameLoop(ts);                 // Mulai loop utama
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENDERS — Bind tombol UI
// ═══════════════════════════════════════════════════════════════════════════════

// Tombol "ENTER" → mulai game
startBtn.addEventListener('click',function(){
  ensureAudio();   // Inisialisasi AudioContext (butuh user interaction)
  startGame();     // Mulai game baru
});

// Tombol "SOUND: ON/OFF" → toggle audio
soundBtn.addEventListener('click',function(){
  ensureAudio();
  soundEnabled=!soundEnabled;                                    // Balik status suara
  soundBtn.textContent=soundEnabled?'SOUND: ON':'SOUND: OFF';   // Update teks tombol
  soundBtn.setAttribute('aria-pressed',soundEnabled);            // Update aksesibilitas
  // Jika AudioContext suspended (kebijakan browser), resume
  if(soundEnabled&&audioCtx&&audioCtx.state==='suspended')audioCtx.resume();
});
