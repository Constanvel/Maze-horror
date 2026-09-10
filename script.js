'use strict';

const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');
const screen=document.getElementById('screen');
const hud=document.getElementById('hud');
const startBtn=document.getElementById('start');
const soundBtn=document.getElementById('sound');
const msgEl=document.getElementById('message');
const keysEl=document.getElementById('keys');
const exitEl=document.getElementById('exit-status');
const batteryEl=document.getElementById('battery');
const lightEl=document.getElementById('light-status');
const gameSection=document.getElementById('game');

const W=canvas.width,H=canvas.height;
const FOV=Math.PI/3,HALF_FOV=FOV/2;
const NUM_RAYS=W,MAX_DEPTH=16;
const MOVE_SPEED=0.05,TURN_SPEED=0.045,BATTERY_DRAIN=0.008;
const SURVIVE_TIME=60;

const MAP_W=17,MAP_H=17;
const RAW_MAP=[
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
let MAP=RAW_MAP.slice();
function mapAt(x,y){
  const mx=Math.floor(x),my=Math.floor(y);
  if(mx<0||mx>=MAP_W||my<0||my>=MAP_H)return 1;
  return MAP[my*MAP_W+mx];
}
function isWall(x,y){const v=mapAt(x,y);return v===1||v===3;}
function setMap(x,y,val){MAP[Math.floor(y)*MAP_W+Math.floor(x)]=val;}

const player={x:1.5,y:1.5,angle:0,lightOn:true,battery:100};
const monster={x:15.5,y:15.5,speed:0.013,baseSpeed:0.013,active:false,
  startDelay:5000,breathPhase:0,stepTimer:0,stepInterval:850};

let gameRunning=false,gamePaused=false,gameOver=false,soundEnabled=false;
let msgTimer=null,lastTime=0,animId=null,monsterStartTime=0,stepFrame=0;
let surviveTimer=SURVIVE_TIME,doorUnlocked=false;
let jumpscareActive=false,jumpPhase=0,jumpStartTime=0;
const JUMP_DURATION=1600;


// INPUT
const keys={};
document.addEventListener('keydown',function(e){
  keys[e.key.toLowerCase()]=true;
  if(!gameRunning)return;
  if(e.key.toLowerCase()==='f')toggleLight();
  if(e.key==='Escape')togglePause();
});
document.addEventListener('keyup',function(e){keys[e.key.toLowerCase()]=false;});
document.querySelectorAll('.touch-controls button').forEach(function(btn){
  var k=btn.dataset.key;
  btn.addEventListener('pointerdown',function(e){e.preventDefault();keys[k]=true;if(k==='f')toggleLight();});
  btn.addEventListener('pointerup',function(e){e.preventDefault();keys[k]=false;});
  btn.addEventListener('pointerleave',function(e){keys[k]=false;});
});

// AUDIO
var audioCtx=null;
function ensureAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();}
function playTone(freq,type,duration,vol,delay){
  vol=vol||0.15;delay=delay||0;
  if(!soundEnabled||!audioCtx)return;
  var t=audioCtx.currentTime+delay,osc=audioCtx.createOscillator(),g=audioCtx.createGain();
  osc.connect(g);g.connect(audioCtx.destination);osc.type=type;
  osc.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(vol,t);
  g.gain.exponentialRampToValueAtTime(0.001,t+duration);osc.start(t);osc.stop(t+duration+0.02);
}
function playWinSound(){[523,659,784,1047].forEach(function(f,i){playTone(f,'sine',0.3,0.2,i*0.12);});}
function playDeathSound(){playTone(80,'sawtooth',0.8,0.35);playTone(55,'sawtooth',1.1,0.28,0.18);}
function playStepSound(){playTone(58+Math.random()*18,'sine',0.09,0.06);}
function playUnlockSound(){playTone(220,'sine',0.3,0.2);playTone(330,'sine',0.3,0.2,0.15);playTone(440,'sine',0.4,0.22,0.3);}
function playMonsterStep(dist){
  if(!soundEnabled||!audioCtx)return;
  var vol=Math.min(0.55,(10-dist)/10*0.55);
  playTone(52,'sine',0.28,vol);playTone(36,'sawtooth',0.20,vol*0.55,0.06);
}
function playScream(){
  if(!soundEnabled||!audioCtx)return;
  [180,360,90,270,540].forEach(function(f,i){playTone(f,'sawtooth',0.9,0.5,i*0.03);});
  playTone(1200,'square',0.35,0.32,0.04);playTone(2400,'square',0.22,0.20,0.07);
}

// UTILS
function showMessage(text,duration){
  duration=duration||2500;
  msgEl.textContent=text;msgEl.classList.add('visible');clearTimeout(msgTimer);
  msgTimer=setTimeout(function(){msgEl.classList.remove('visible');},duration);
}
function toggleLight(){if(player.battery<=0)return;player.lightOn=!player.lightOn;}
function togglePause(){
  if(gameOver||jumpscareActive)return;
  gamePaused=!gamePaused;
  if(!gamePaused)msgEl.classList.remove('visible');
}
function fmtTime(s){
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
}
function updateHUD(){
  keysEl.textContent=fmtTime(surviveTimer);
  keysEl.className='hud-keys'+(surviveTimer<=10&&surviveTimer>0?' timer-danger':'');
  var pct=Math.ceil(player.battery);
  batteryEl.style.opacity=0.25+(pct/100)*0.75;
  batteryEl.textContent=''.padEnd(Math.round(pct/14),'\u2588').padEnd(7,'\u2591');
  exitEl.style.display=doorUnlocked?'':'none';
  lightEl.style.display=(!player.lightOn||player.battery<=0)?'':'none';
}


// LOS + RAYCASTING
function hasLOS(mx,my,px,py){
  var dx=px-mx,dy=py-my,dist=Math.sqrt(dx*dx+dy*dy),steps=Math.ceil(dist/0.05);
  for(var i=1;i<steps;i++){var t=i/steps;if(mapAt(mx+dx*t,my+dy*t)===1)return false;}
  return true;
}
function castRay(angle){
  var sinA=Math.sin(angle),cosA=Math.cos(angle);
  var mapX=Math.floor(player.x),mapY=Math.floor(player.y);
  var ddx=Math.abs(1/(cosA||1e-30)),ddy=Math.abs(1/(sinA||1e-30));
  var stepX,stepY,sdx,sdy,side=0;
  if(cosA<0){stepX=-1;sdx=(player.x-mapX)*ddx;}else{stepX=1;sdx=(mapX+1-player.x)*ddx;}
  if(sinA<0){stepY=-1;sdy=(player.y-mapY)*ddy;}else{stepY=1;sdy=(mapY+1-player.y)*ddy;}
  var dist=0,cell=0;
  for(var i=0;i<MAX_DEPTH*8;i++){
    if(sdx<sdy){sdx+=ddx;mapX+=stepX;side=0;}else{sdy+=ddy;mapY+=stepY;side=1;}
    cell=mapAt(mapX,mapY);
    if(cell===1||cell===3){dist=(side===0?sdx-ddx:sdy-ddy);break;}
    if(dist>MAX_DEPTH)break;
  }
  return{dist:Math.max(dist,0.1),side:side,cell:cell};
}

// RENDERER HELPERS
function lerp(a,b,t){return a+(b-a)*t;}
function lerpC(c1,c2,t){
  return[Math.round(lerp(c1[0],c2[0],t)),Math.round(lerp(c1[1],c2[1],t)),Math.round(lerp(c1[2],c2[2],t))];
}
function rgb(c){return 'rgb('+c[0]+','+c[1]+','+c[2]+')';}
function rgba(r,g,b,a){return 'rgba('+r+','+g+','+b+','+a+')';}

var WALL_LIT=[[80,60,55],[55,42,38]];
var WALL_DARK=[[28,22,20],[18,14,12]];
var DOOR_LIT=[[120,85,28],[90,60,18]];
var DOOR_DARK=[[50,30,6],[32,18,3]];
var FL_NEAR=[20,20,18],FL_FAR=[10,10,9];
var CL_NEAR=[12,12,11],CL_FAR=[6,6,6];


// HUMANOID MONSTER SPRITE
function drawHumanoid(sx,sh,sw,st,litF2,breath){
  if(sw<2||sh<2)return;
  var sway=Math.round(Math.sin(breath*0.5)*sw*0.05);
  var headH=Math.round(sh*0.20),neckH=Math.round(sh*0.04);
  var torsoH=Math.round(sh*0.28),hipH=Math.round(sh*0.08),legH=Math.round(sh*0.40);
  var torsoW=Math.round(sw*0.52),headW=Math.round(sw*0.38),shoulderW=Math.round(sw*0.72);
  var armW=Math.max(1,Math.round(sw*0.11)),armH=Math.round(sh*0.46);
  var legW=Math.max(1,Math.round(sw*0.22)),legGap=Math.max(1,Math.round(sw*0.06));
  var headY=st,neckY=headY+headH,torsoY=neckY+neckH,hipY=torsoY+torsoH,legY=hipY+hipH;
  var cx=sx+sway;
  var r=Math.round(lerp(8,55,litF2)),g=Math.round(lerp(6,42,litF2)),b=Math.round(lerp(6,40,litF2));
  var bodyCol=rgba(r,g,b,0.96);
  var darkCol=rgba(Math.round(r*0.55),Math.round(g*0.55),Math.round(b*0.55),0.90);
  var legAnim=Math.round(Math.sin(breath*2.2)*sh*0.03);
  ctx.fillStyle=darkCol;
  ctx.fillRect(cx-legGap-legW,legY,legW,legH-legAnim);
  ctx.fillRect(cx+legGap,legY+legAnim,legW,legH);
  ctx.fillStyle=bodyCol;
  ctx.fillRect(cx-Math.round((torsoW+legGap*2)/2),hipY,torsoW+legGap*2,hipH);
  ctx.fillRect(cx-Math.round(torsoW/2),torsoY,torsoW,torsoH);
  var armSwing=Math.round(Math.sin(breath*2.2+1.2)*sh*0.025);
  ctx.fillStyle=darkCol;
  ctx.save();ctx.translate(cx-Math.round(shoulderW/2),torsoY);
  ctx.rotate(-0.18+Math.sin(breath*2.2)*0.06);ctx.fillRect(-armW,armSwing,armW,armH);ctx.restore();
  ctx.save();ctx.translate(cx+Math.round(shoulderW/2),torsoY);
  ctx.rotate(0.18-Math.sin(breath*2.2)*0.06);ctx.fillRect(0,-armSwing,armW,armH);ctx.restore();
  var neckW=Math.round(headW*0.42);
  ctx.fillStyle=bodyCol;
  ctx.fillRect(cx-Math.round(neckW/2),neckY,neckW,neckH+1);
  ctx.fillRect(cx-Math.round(headW/2),headY,headW,headH);
  if(litF2>0.06&&headW>=4){
    var eyeW=Math.max(1,Math.round(headW*0.20)),eyeH=Math.max(1,Math.round(headH*0.18));
    var eyeY=headY+Math.round(headH*0.40);
    var eyeAlpha=Math.min(1,(litF2-0.06)*5)*(0.75+Math.sin(breath*4.1)*0.25);
    ctx.fillStyle=rgba(255,20,10,eyeAlpha);
    ctx.fillRect(cx-Math.round(headW*0.26)-Math.round(eyeW/2),eyeY,eyeW,eyeH);
    ctx.fillRect(cx+Math.round(headW*0.26)-Math.round(eyeW/2),eyeY,eyeW,eyeH);
  }
}


// JUMPSCARE FACE (canvas-drawn grotesque visage)
function drawJumpscareFace(phase){
  var alpha=phase<0.55?1.0:1.0-(phase-0.55)/0.45;
  var bgR=phase<0.25?255:Math.round(lerp(255,100,Math.min(1,(phase-0.25)/0.3)));
  var bgG=phase<0.25?255:Math.round(lerp(255,0,Math.min(1,(phase-0.25)/0.3)));
  var bgB=phase<0.25?255:Math.round(lerp(255,0,Math.min(1,(phase-0.25)/0.3)));
  ctx.fillStyle=rgba(bgR,bgG,bgB,alpha);
  ctx.fillRect(0,0,W,H);
  if(phase<0.10)return;
  var fA=Math.min(1,(phase-0.10)/0.12)*alpha;
  var tx=(Math.random()-0.5)*4,ty=(Math.random()-0.5)*4;
  ctx.save();
  ctx.translate(W/2+tx,H/2+ty);
  var hw=W*0.44,hh=H*0.70;
  ctx.fillStyle=rgba(18,10,8,fA);
  ctx.beginPath();ctx.ellipse(0,0,hw,hh,0,0,Math.PI*2);ctx.fill();
  var eox=hw*0.30,eoy=-hh*0.12,erx=hw*0.19,ery=hh*0.16;
  ctx.fillStyle=rgba(0,0,0,fA);
  ctx.beginPath();ctx.ellipse(-eox,eoy,erx,ery,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(eox,eoy,erx,ery,0,0,Math.PI*2);ctx.fill();
  var pupR=erx*0.38;
  ctx.fillStyle=rgba(255,255,240,fA*0.95);
  ctx.beginPath();ctx.ellipse(-eox,eoy,pupR,pupR*1.2,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(eox,eoy,pupR,pupR*1.2,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=rgba(200,10,5,fA*0.8);ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(-eox,eoy,pupR*1.5,pupR*1.8,0,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.ellipse(eox,eoy,pupR*1.5,pupR*1.8,0,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=rgba(0,0,0,fA*0.75);
  ctx.fillRect(-8,hh*0.05,5,12);ctx.fillRect(3,hh*0.05,5,12);
  var mW=hw*0.72,mY=hh*0.30,teeth=12,toothH=hh*0.09;
  ctx.fillStyle=rgba(100,5,5,fA*0.9);
  ctx.beginPath();ctx.moveTo(-mW,mY);
  for(var i=0;i<=teeth;i++){var tx2=-mW+(i/teeth)*mW*2,ty2=mY+(i%2===0?toothH:0);ctx.lineTo(tx2,ty2);}
  ctx.lineTo(mW,mY+toothH+6);ctx.lineTo(-mW,mY+toothH+6);ctx.closePath();ctx.fill();
  ctx.strokeStyle=rgba(220,210,190,fA);ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-mW,mY);
  for(var i=0;i<=teeth;i++){var tx2=-mW+(i/teeth)*mW*2,ty2=mY+(i%2===0?toothH:0);ctx.lineTo(tx2,ty2);}
  ctx.stroke();
  ctx.strokeStyle=rgba(0,0,0,fA);ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-mW,mY);ctx.lineTo(mW,mY);ctx.stroke();
  ctx.strokeStyle=rgba(90,0,0,fA*0.5);ctx.lineWidth=1;
  for(var eye=-1;eye<=1;eye+=2){
    for(var v=0;v<7;v++){
      var ang=(v/7)*Math.PI*2;
      var ex=eye*eox+Math.cos(ang)*erx,ey=eoy+Math.sin(ang)*ery;
      ctx.beginPath();ctx.moveTo(ex,ey);
      ctx.lineTo(ex+Math.cos(ang)*hw*0.28,ey+Math.sin(ang)*hh*0.28);ctx.stroke();
    }
  }
  ctx.restore();
}


// MAIN RENDER
function render(){
  var lightF=(player.lightOn&&player.battery>0)?1:0.08;
  var maxLight=10*lightF;
  // Floor & ceiling
  for(var y=0;y<H;y++){
    var isFloor=y>H/2;
    var rowDist=(H*0.5)/Math.abs(y-H/2+0.001);
    var t=Math.min(rowDist/maxLight,1);
    var c=lerpC(isFloor?FL_NEAR:CL_NEAR,isFloor?FL_FAR:CL_FAR,t);
    c=c.map(function(v){return Math.round(v*lightF);});
    ctx.fillStyle=rgb(c);ctx.fillRect(0,y,W,1);
  }
  // Walls + door
  for(var col=0;col<NUM_RAYS;col++){
    var rayAngle=player.angle-HALF_FOV+(col/NUM_RAYS)*FOV;
    var ray=castRay(rayAngle);
    var corrDist=ray.dist*Math.cos(rayAngle-player.angle);
    var wallH=Math.round(H/corrDist);
    var top=Math.max(0,Math.floor((H-wallH)/2)),bottom=Math.min(H,Math.floor((H+wallH)/2));
    var litFrac=Math.max(0,1-corrDist/maxLight);
    if(ray.cell===3){
      var tp=surviveTimer<10?0.5+0.5*Math.abs(Math.sin(Date.now()*0.006)):0;
      var dc=lerpC(DOOR_DARK[ray.side],DOOR_LIT[ray.side],(litFrac+tp*0.35)*lightF);
      ctx.fillStyle=rgb(dc);ctx.fillRect(col,top,1,bottom-top);
      if(surviveTimer<10&&corrDist<6){
        ctx.fillStyle=rgba(255,180,30,tp*0.25*Math.max(0,1-corrDist/6));
        ctx.fillRect(col,top,1,bottom-top);
      }
    }else{
      ctx.fillStyle=rgb(lerpC(WALL_DARK[ray.side],WALL_LIT[ray.side],litFrac*lightF));
      ctx.fillRect(col,top,1,bottom-top);
    }
  }
  // Monster
  if(monster.active){
    var dx=monster.x-player.x,dy=monster.y-player.y,mDist=Math.sqrt(dx*dx+dy*dy);
    if(mDist<MAX_DEPTH&&hasLOS(monster.x,monster.y,player.x,player.y)){
      var mAngle=Math.atan2(dy,dx)-player.angle;
      while(mAngle>Math.PI)mAngle-=2*Math.PI;
      while(mAngle<-Math.PI)mAngle+=2*Math.PI;
      if(Math.abs(mAngle)<HALF_FOV+0.3){
        var sx=Math.round((0.5+mAngle/FOV)*W);
        var sh=Math.round(H/mDist),sw=Math.round(sh*0.7),st=Math.floor((H-sh)/2);
        var litF2=Math.max(0,1-mDist/maxLight);
        drawHumanoid(sx,sh,sw,st,litF2,monster.breathPhase);
      }
    }
  }
}

// MOVEMENT
function tryMove(nx,ny){
  if(!isWall(nx,player.y))player.x=nx;
  if(!isWall(player.x,ny))player.y=ny;
}

// INTERACTIONS
function checkInteractions(){
  if(mapAt(player.x,player.y)===4)triggerWin();
}


// JUMPSCARE
function startJumpscare(){
  if(jumpscareActive||gameOver)return;
  jumpscareActive=true;jumpPhase=0;jumpStartTime=performance.now();
  playScream();
  gameSection.classList.remove('danger','shake','imminent','monster-flicker');
}
function updateJumpscare(now){
  if(!jumpscareActive)return;
  jumpPhase=Math.min(1,(now-jumpStartTime)/JUMP_DURATION);
  drawJumpscareFace(jumpPhase);
  if(jumpPhase>=1){jumpscareActive=false;triggerDeath();}
}

// MONSTER AI
function updateMonster(now,dt){
  if(!monster.active){
    if(now-monsterStartTime>monster.startDelay){
      monster.active=true;
      gameSection.classList.add('speed-flash');
      setTimeout(function(){gameSection.classList.remove('speed-flash');},400);
      if(soundEnabled){playTone(55,'sawtooth',1.2,0.40);playTone(40,'sawtooth',1.5,0.30,0.20);}
    }
    return;
  }
  monster.breathPhase=(monster.breathPhase+0.04)%(Math.PI*2);
  var elapsed=(SURVIVE_TIME-surviveTimer)/SURVIVE_TIME;
  monster.speed=monster.baseSpeed+elapsed*0.024;
  var dx=player.x-monster.x,dy=player.y-monster.y,dist=Math.sqrt(dx*dx+dy*dy);
  if(dist>0.01){
    var nx=monster.x+(dx/dist)*monster.speed,ny=monster.y+(dy/dist)*monster.speed;
    if(!isWall(nx,monster.y))monster.x=nx;
    if(!isWall(monster.x,ny))monster.y=ny;
  }
  if(dist<10){
    monster.stepTimer+=dt;
    var interval=Math.max(180,monster.stepInterval*(dist/10));
    if(monster.stepTimer>=interval){monster.stepTimer=0;playMonsterStep(dist);}
  }else{monster.stepTimer=0;}
  if(dist<2.5){
    gameSection.classList.add('danger','imminent','shake','monster-flicker');
    if(soundEnabled&&Math.random()<0.015)playTone(65+Math.random()*55,'sawtooth',0.22,0.18);
  }else if(dist<5){
    gameSection.classList.add('danger','shake');
    gameSection.classList.remove('imminent','monster-flicker');
    if(soundEnabled&&Math.random()<0.006)playTone(75+Math.random()*35,'sawtooth',0.35,0.12);
  }else if(dist<8){
    gameSection.classList.add('danger');
    gameSection.classList.remove('imminent','shake','monster-flicker');
  }else{
    gameSection.classList.remove('danger','imminent','shake','monster-flicker');
  }
  if(dist<0.55&&!jumpscareActive&&!gameOver)startJumpscare();
}

// SURVIVE TIMER
function updateSurviveTimer(dt){
  if(surviveTimer<=0||gameOver||jumpscareActive)return;
  surviveTimer=Math.max(0,surviveTimer-dt/1000);
  if(surviveTimer<=0&&!doorUnlocked){
    doorUnlocked=true;
    setMap(15,15,4);
    playUnlockSound();
    showMessage('EXIT OPEN',3500);
    gameSection.classList.add('speed-flash');
    setTimeout(function(){gameSection.classList.remove('speed-flash');},700);
  }
}

// WIN / LOSE
function showEndScreen(eyebrow,titleHTML,tagline,objective,btnText,note){
  gameRunning=false;gameOver=true;
  cancelAnimationFrame(animId);
  gameSection.classList.remove('danger','shake','imminent','monster-flicker','speed-flash','flicker');
  document.getElementById('eyebrow').textContent=eyebrow;
  document.getElementById('title').innerHTML=titleHTML;
  document.getElementById('tagline').textContent=tagline;
  document.getElementById('objective').textContent=objective;
  startBtn.textContent=btnText;
  document.getElementById('screen-note').textContent=note;
  screen.style.display='';
  hud.classList.add('hidden');
}
function triggerWin(){
  if(gameOver)return;
  playWinSound();
  showEndScreen('YOU SURVIVED','YOU<br>ESCAPED<span class="title-dot">.</span>','You made it out alive.','','PLAY AGAIN \u2197','');
}
function triggerDeath(){
  if(gameOver)return;
  playDeathSound();
  showEndScreen('GAME OVER','YOU<br>DIED<span class="title-dot">.</span>','','','TRY AGAIN \u2197','');
}


// GAME LOOP
function gameLoop(timestamp){
  if(!gameRunning)return;
  if(gamePaused){animId=requestAnimationFrame(gameLoop);return;}
  var dt=Math.min(timestamp-lastTime,50);lastTime=timestamp;
  if(!jumpscareActive){
    var ms=MOVE_SPEED*(dt/16.67),ts=TURN_SPEED*(dt/16.67);var moved=false;
    if(keys['w']||keys['arrowup']){tryMove(player.x+Math.cos(player.angle)*ms,player.y+Math.sin(player.angle)*ms);moved=true;}
    if(keys['s']||keys['arrowdown']){tryMove(player.x-Math.cos(player.angle)*ms,player.y-Math.sin(player.angle)*ms);moved=true;}
    if(keys['a']||keys['arrowleft'])player.angle-=ts;
    if(keys['d']||keys['arrowright'])player.angle+=ts;
    if(moved&&soundEnabled){stepFrame++;if(stepFrame%22===0)playStepSound();}
  }
  if(player.lightOn&&player.battery>0){
    player.battery=Math.max(0,player.battery-BATTERY_DRAIN*(dt/16.67));
    if(player.battery<=0)player.lightOn=false;
  }
  updateSurviveTimer(dt);
  render();
  if(jumpscareActive){updateJumpscare(timestamp);}
  else{updateMonster(timestamp,dt);checkInteractions();}
  updateHUD();
  animId=requestAnimationFrame(gameLoop);
}

// START
function startGame(){
  MAP=RAW_MAP.slice();
  player.x=1.5;player.y=1.5;player.angle=0;player.lightOn=true;player.battery=100;
  monster.x=15.5;monster.y=15.5;monster.active=false;
  monster.speed=monster.baseSpeed;monster.breathPhase=0;monster.stepTimer=0;monster.stepInterval=850;
  gameOver=false;gamePaused=false;gameRunning=true;stepFrame=0;
  surviveTimer=SURVIVE_TIME;doorUnlocked=false;jumpscareActive=false;jumpPhase=0;
  gameSection.classList.remove('danger','shake','flicker','imminent','monster-flicker','speed-flash');
  msgEl.classList.remove('visible');
  screen.style.display='none';
  hud.classList.remove('hidden');
  updateHUD();
  cancelAnimationFrame(animId);
  animId=requestAnimationFrame(function(ts){lastTime=ts;monsterStartTime=ts;gameLoop(ts);});
}

startBtn.addEventListener('click',function(){ensureAudio();startGame();});
soundBtn.addEventListener('click',function(){
  ensureAudio();soundEnabled=!soundEnabled;
  soundBtn.textContent=soundEnabled?'SOUND: ON':'SOUND: OFF';
  soundBtn.setAttribute('aria-pressed',soundEnabled);
  if(soundEnabled&&audioCtx&&audioCtx.state==='suspended')audioCtx.resume();
});

