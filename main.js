// ----------------------------------------------------
// TYPEWRITER FUNCTION
// ----------------------------------------------------
function typeWriter(element, text, speed = 40) {
  let i = 0;
  element.textContent = "";

  return new Promise((resolve) => {
    function type() {
      if (i < text.length) {
        element.textContent += text[i];
        i++;
        setTimeout(type, speed);
      } else {
        resolve();
      }
    }
    type();
  });
}

// ----------------------------------------------------
// SCARE AUDIO SETUP
// ----------------------------------------------------
const chainsaw = document.getElementById("chainsaw");
const scream = document.getElementById("scream");

// always start muted
chainsaw.muted = true;
scream.muted = true;

function playScareEvent() {
  chainsaw.pause();
  chainsaw.currentTime = 0;

  scream.pause();
  scream.currentTime = 0;

  chainsaw.play();
  scream.play();
}

// ----------------------------------------------------
// START SCREEN AUDIO
// ----------------------------------------------------
const startSound = document.getElementById("start-sound");

// Loop using JavaScript ONLY
startSound.loop = true;

function unlockStartAudio() {
  // Prevent double-running
  if (startSound._unlocked) return;

  // Unmute on first user click
  startSound.muted = false;
  startSound.volume = 0.45;

  startSound
    .play()
    .then(() => {
      startSound._unlocked = true;
      console.log("Start sound unlocked!");

      // Remove listener once successful
      window.removeEventListener("click", unlockStartAudio);
    })
    .catch((err) => {
      console.warn("Audio unlock failed, waiting for next click:", err);
    });
}

// CLICK ONLY — no keydown allowed
window.addEventListener("click", unlockStartAudio);

// ----------------------------------------------------
// GAME AUDIO (hum + zap)
// ----------------------------------------------------
const lightHum = document.getElementById("light-hum");
const flickerZap = document.getElementById("flicker-zap");

// loop hum forever
lightHum.loop = true;

lightHum.addEventListener("ended", () => {
  lightHum.currentTime = 0;
  lightHum.play();
});

function playFlickerZap() {
  flickerZap.pause();
  flickerZap.currentTime = 0;
  flickerZap.volume = 1;
  flickerZap.play();
}

function unlockGameAudio() {
  lightHum.muted = false;
  flickerZap.muted = false;
  chainsaw.muted = false;
  scream.muted = false;

  lightHum.volume = 0.5;
  lightHum.play();

  window.removeEventListener("click", unlockGameAudio);
  window.removeEventListener("mousemove", unlockGameAudio);
}

// ----------------------------------------------------
// START SCREEN + INTRO HANDLING
// ----------------------------------------------------
const startScreen = document.getElementById("start-screen");
const startBtn = document.getElementById("start-btn");
const storyIntro = document.getElementById("story-intro");

const intro_line1 = document.getElementById("line1");
const intro_line2 = document.getElementById("line2");
const intro_line3 = document.getElementById("line3");

const continueBtn = document.getElementById("continue-btn");
continueBtn.style.opacity = 0;

// CLICK START
startBtn.addEventListener("click", async () => {
  startScreen.classList.add("fade-out");

  setTimeout(async () => {
    startScreen.style.display = "none";

    storyIntro.style.display = "flex";
    storyIntro.style.opacity = 1;

    await typeWriter(
      intro_line1,
      "You needed money and the online ad you found promised money... A lot of money.",
      55
    );
    await typeWriter(
      intro_line2,
      "You were told to meet at a remote location for 'the first puzzle'...",
      55
    );
    await typeWriter(
      intro_line3,
      "But the moment you arrived, everything went black—and you woke up locked in this room.",
      55
    );

    continueBtn.style.opacity = 1;
  }, 1200);
});

// ----------------------------------------------------
// AFTER INTRO → ENTER GAME (***ONLY THIS ONE***)
// ----------------------------------------------------
continueBtn.addEventListener("click", () => {
  storyIntro.style.opacity = 0;

  startSound.pause();
  startSound.currentTime = 0;

  setTimeout(() => {
    storyIntro.style.display = "none";
    document.getElementById("game-container").style.display = "block";

    // UNLOCK ALL GAME AUDIO
    window.addEventListener("click", unlockGameAudio);
    window.addEventListener("mousemove", unlockGameAudio);

    // PLAY SCARE EVENT 5–15 seconds later
    setTimeout(() => {
      playScareEvent();
    }, Math.random() * (15000 - 5000) + 5000);
  }, 1500);
});

// THREE.JS SETUP
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";

//-----------------------------------------------------
// GLOBAL VARIABLES
//-----------------------------------------------------

let cubeLocked = true; // cube starts locked
let numberSprite = null;
let lastColorNum = null;

let selectedBook = null;
const bookMeshes = []; // ONLY books currently on Stroop shelf go here

let playerInput = []; // cube/door code input

let bookshelfUnlocked = false; // becomes true after missing book flies back
let missingBookCollected = false; // becomes true when player clicks missing book

let hauntedShelfSolved = false;
let hauntedShelfOpen = false;
let runesClicked = 0;

// forward refs
let hauntedShelf;
let shelfDoor;
let missingBook;
const runes = [];

//-----------------------------------------------------
// SCENE / CAMERA / RENDERER / POST
//-----------------------------------------------------

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(2, 1, 4);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("game-container").appendChild(renderer.domElement);

renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const pixelPass = new RenderPixelatedPass(3, scene, camera);
composer.addPass(pixelPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.1;
controls.maxDistance = 20;
controls.zoomSpeed = 2.0;

//-----------------------------------------------------
// RAYCASTING
//-----------------------------------------------------

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// message pop-up helper
function showBookMessage(text) {
  const msg = document.getElementById("book-message");
  if (!msg) {
    console.warn("book-message element not found");
    return;
  }
  msg.innerText = text;
  msg.style.display = "block";

  clearTimeout(window.__bookMsgTimeout);
  window.__bookMsgTimeout = setTimeout(() => {
    msg.style.display = "none";
  }, 2000);
}
// portal message popup
function showPortalMessage(text) {
  const msg = document.getElementById("portal-message");
  msg.innerText = text;
  msg.style.display = "block";

  clearTimeout(window.__portalMsgTimeout);
  window.__portalMsgTimeout = setTimeout(() => {
    msg.style.display = "none";
  }, 2000);
}

//rune message popup
function showRuneMessage(text = "Maybe I can use this code somewhere....") {
  const msg = document.getElementById("rune-message");
  msg.innerText = text;
  msg.style.display = "block";

  clearTimeout(window.__runeMsgTimeout);
  window.__runeMsgTimeout = setTimeout(() => {
    msg.style.display = "none";
  }, 2000);
}

//-----------------------------------------------------
// LIGHTS
//-----------------------------------------------------

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directional_Light = new THREE.DirectionalLight(0xffffff, 1);
directional_Light.target.position.set(5, 6, 3);
directional_Light.position.set(3, 5, 2);
scene.add(directional_Light.target);

directional_Light.castShadow = true;
directional_Light.shadow.mapSize.set(2048, 2048);
directional_Light.shadow.bias = -0.0001;
directional_Light.shadow.normalBias = 0.02;
scene.add(directional_Light);

// hanging / flicker lights
function makeHangingLight(x, z) {
  const lightGroup = new THREE.Group();

  const wirecord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  wirecord.position.y = -0.5;
  lightGroup.add(wirecord);

  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.25, 16),
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
      metalness: 0.2,
    })
  );
  shade.rotation.x = Math.PI;
  shade.position.y = -1.1;
  shade.castShadow = true;
  shade.receiveShadow = true;
  lightGroup.add(shade);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.6,
      emissive: 0xffffaa,
      emissiveIntensity: 2,
    })
  );
  lamp.position.y = -1.3;
  lightGroup.add(lamp);

  const spot = new THREE.SpotLight(0xffffff, 4, 15, Math.PI / 6, 0.4, 1.5);
  spot.position.set(0, -1.0, 0);
  spot.target.position.set(0, -3, 0);

  spot.castShadow = true;
  spot.shadow.bias = -0.0001;
  spot.shadow.mapSize.width = 1024;
  spot.shadow.mapSize.height = 1024;

  lightGroup.add(spot);
  lightGroup.add(spot.target);

  lightGroup.position.set(x, 2.5, z);

  scene.add(lightGroup);
  return spot;
}

const flickerLights = [
  makeHangingLight(-3, 0.5),
  makeHangingLight(0, -2.5),
  makeHangingLight(2.5, 3),
  makeHangingLight(-1, 4.5),
];

function flickerLight(light) {
  if (Math.random() < 0.01) {
    const original = light.intensity;
    let t = 0;
    const duration = 5 + Math.random() * 10;

    function flicker() {
      t++;
      if (t < duration) {
        light.intensity = original * (0.3 + Math.random() * 0.7);
        requestAnimationFrame(flicker);
      } else {
        light.intensity = original;
      }
    }
    flicker();
  }
}

//-----------------------------------------------------
// TEXTURES
//-----------------------------------------------------

const textureLoader = new THREE.TextureLoader();

const wallTexture = textureLoader.load("textures/wall.jpg", (tex) => {
  setupPixelTexture(tex, 10, 5);
});

const floorTexture = textureLoader.load("textures/floor.jpg", (tex) => {
  setupPixelTexture(tex, 10, 10);
});

function setupPixelTexture(texture, repeatX, repeatY) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
}

//-----------------------------------------------------
// ROOM + TERMINAL + DOOR
//-----------------------------------------------------

const roomGeometry = new THREE.BoxGeometry(10, 5, 10);
const roomMaterial = new THREE.MeshStandardMaterial({
  map: wallTexture,
  side: THREE.BackSide,
  metalness: 0.1,
  roughness: 0.6,
});
const room = new THREE.Mesh(roomGeometry, roomMaterial);
room.receiveShadow = false;
scene.add(room);

// -----------------------------------------------------
// RUNE ORDER CLUE PAPER
// -----------------------------------------------------
const runeClueCanvas = document.createElement("canvas");
runeClueCanvas.width = 2048;
runeClueCanvas.height = 1024;
const rclue = runeClueCanvas.getContext("2d");

// background
rclue.fillStyle = "#f2f2e0";
rclue.fillRect(0, 0, runeClueCanvas.width, runeClueCanvas.height);

// fonts & outlines
rclue.font = "bold 200px Arial Black";
rclue.textAlign = "center";
rclue.textBaseline = "middle";

rclue.strokeStyle = "black";
rclue.lineWidth = 25;
rclue.shadowColor = "black";
rclue.shadowBlur = 40;

// labels
rclue.strokeText("RUNE ORDER", 1024, 200);
rclue.fillStyle = "#111";
rclue.fillText("RUNE ORDER", 1024, 200);

// row of color boxes
function drawColorBox(x, colorHex) {
  rclue.fillStyle = colorHex;
  rclue.fillRect(x - 150, 500 - 150, 300, 300);
  rclue.strokeRect(x - 150, 500 - 150, 300, 300);
}

// RED → BLUE → GREEN
drawColorBox(600, "#ff0000");
drawColorBox(1024, "#0479ffff");
drawColorBox(1450, "#00ffaa");

// arrows
rclue.fillStyle = "#000";
rclue.font = "bold 150px Arial Black";
rclue.fillText("→", 815, 500);
rclue.fillText("→", 1230, 500);

// convert to texture
const runeClueTexture = new THREE.CanvasTexture(runeClueCanvas);
runeClueTexture.minFilter = THREE.LinearFilter;

// make mesh
const runeCluePaper = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 1.5),
  new THREE.MeshBasicMaterial({
    map: runeClueTexture,
    transparent: true,
  })
);

// place it near the cabinet on the wall
runeCluePaper.position.set(-3.2, 0.9, 4.8);
runeCluePaper.rotation.y = Math.PI; // face the room

scene.add(runeCluePaper);

const terminal = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.3, 0.1),
  new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0x1111ff,
    emissiveIntensity: 0.5,
  })
);
terminal.position.set(1.5, -0.5, 4.9);
scene.add(terminal);

const doorWidth = 2;
const doorHeight = 2.5;

const door = new THREE.Mesh(
  new THREE.PlaneGeometry(doorWidth, doorHeight),
  new THREE.MeshStandardMaterial({
    color: 0x333366,
    roughness: 1.0,
    metalness: 0.5,
    emissive: 0x000000,
  })
);
door.position.set(0, doorHeight / 2 - 2.5, 4.95);
door.rotation.y = Math.PI;
scene.add(door);

let doorOpening = false;
let doorOpenProgress = 0;

//-----------------------------------------------------
// CLUE WALL FOR CUBE CODE
//-----------------------------------------------------

const baseColors = [
  0x0000ff, // Blue (4)
  0xff0000, // Red (3)
  0x00ff00, // Green (5)
  0x800080, // Purple (6)
  0xffff00, // Yellow (2)
  0xffa500, // Orange (1)
];

const codeLength = 6;

const clueColors = Array.from({ length: codeLength }, () => {
  const randomIndex = Math.floor(Math.random() * baseColors.length);
  return baseColors[randomIndex];
});

const clueWall = new THREE.Group();
const startZ = -2.5;
const spacing = 0.9;

clueColors.forEach((hex, i) => {
  const tile = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ color: hex })
  );

  const idx = clueColors.length - 1 - i;
  tile.position.set(-4.95, 0.8, startZ + idx * spacing);
  tile.rotation.y = Math.PI / 2;
  clueWall.add(tile);
});
scene.add(clueWall);

//-----------------------------------------------------
// TABLE + PORTAL + CUBE + CAGE
//-----------------------------------------------------

const tableGroup = new THREE.Group();

const tableTop = new THREE.Mesh(
  new THREE.BoxGeometry(3, 0.2, 2),
  new THREE.MeshStandardMaterial({
    color: 0x553311,
    roughness: 0.4,
    metalness: 0.3,
  })
);
tableTop.position.set(0, 0, 0);
tableTop.castShadow = true;
tableTop.receiveShadow = true;
tableGroup.add(tableTop);

function makeleg(x, z) {
  const leg = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 1, 0.15),
    new THREE.MeshStandardMaterial({
      color: 0x332200,
      roughness: 0.9,
    })
  );
  leg.position.set(x, -0.6, z);
  leg.castShadow = true;
  leg.receiveShadow = true;
  return leg;
}
tableGroup.add(makeleg(-1.3, 0.8));
tableGroup.add(makeleg(1.3, 0.8));
tableGroup.add(makeleg(-1.3, -0.8));
tableGroup.add(makeleg(1.3, -0.8));

tableGroup.position.set(0, -1.5, -4);
scene.add(tableGroup);

const tableTopY = tableTop.position.y + 0.2 / 2;

const portal = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 32, 16),
  new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0x000000,
    emissiveIntensity: 1,
  })
);
portal.position.set(-0.4, tableTopY + 0.3 / 2 + 0.25, 0);
portal.castShadow = true;
portal.receiveShadow = true;
tableGroup.add(portal);

function makeNumberTexture(n) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 96px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 64, 70);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 1;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function setSpriteNumber(n) {
  if (!numberSprite) {
    const mat = new THREE.SpriteMaterial({
      map: makeNumberTexture(n),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    numberSprite = new THREE.Sprite(mat);
    numberSprite.position.set(0, 0.55, 0.15);
    numberSprite.scale.set(0.6, 0.6, 1);
    portal.add(numberSprite);
  } else {
    numberSprite.material.map.dispose();
    numberSprite.material.map = makeNumberTexture(n);
    numberSprite.material.needsUpdate = true;
  }
}

const faceMaterials = [
  new THREE.MeshStandardMaterial({ color: "green" }),
  new THREE.MeshStandardMaterial({ color: "purple" }),
  new THREE.MeshStandardMaterial({ color: "yellow" }),
  new THREE.MeshStandardMaterial({ color: "blue" }),
  new THREE.MeshStandardMaterial({ color: "orange" }),
  new THREE.MeshStandardMaterial({ color: "red" }),
];

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.5, 0.5),
  faceMaterials
);
cube.castShadow = true;
cube.position.set(0.4, tableTopY + 0.5 / 2, 0);
tableGroup.add(cube);

const cageMaterial = new THREE.MeshStandardMaterial({
  color: 0x444444,
  metalness: 0.7,
  roughness: 0.3,
});

const cage = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({
    color: 0x8888ff,
    transparent: true,
    opacity: 0.3,
    metalness: 0.3,
    roughness: 0.2,
  })
);
const cageSize = 1.5;
const cageHeight = 1.5;
const barThickness = 0.05;
const cageY = tableTopY + 0.75;

cage.position.set(0, cageY, 0);
tableGroup.add(cage);
cage.visible = true;

function makeBar(x, y, z, sx, sy, sz) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), cageMaterial);
  bar.position.set(x, y, z);
  return bar;
}

const metalCage = new THREE.Group();
metalCage.add(cage);

const numBars = 4;
for (let i = 0; i < numBars; i++) {
  const offset = -cageHeight / 2 + (i * cageHeight) / (numBars - 1);

  metalCage.add(
    makeBar(
      0,
      cageY + offset,
      cageSize / 2,
      cageSize,
      barThickness,
      barThickness
    )
  );
  metalCage.add(
    makeBar(
      0,
      cageY + offset,
      -cageSize / 2,
      cageSize,
      barThickness,
      barThickness
    )
  );
  metalCage.add(
    makeBar(
      cageSize / 2,
      cageY + offset,
      0,
      barThickness,
      barThickness,
      cageSize
    )
  );
  metalCage.add(
    makeBar(
      -cageSize / 2,
      cageY + offset,
      0,
      barThickness,
      barThickness,
      cageSize
    )
  );
}

metalCage.add(
  makeBar(0, cageY + cageHeight / 2, 0, cageSize, barThickness, cageSize)
);
metalCage.add(
  makeBar(0, cageY - cageHeight / 2, 0, cageSize, barThickness, cageSize)
);

tableGroup.add(metalCage);

//-----------------------------------------------------
// BOOKSHELF (STROOP SHELF) + NOTES
//-----------------------------------------------------

const bookshelfGroup = new THREE.Group();

const shelf = new THREE.Mesh(
  new THREE.BoxGeometry(3, 0.2, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
);
shelf.position.set(0, 0, 0);
bookshelfGroup.add(shelf);

bookshelfGroup.position.set(4.9, -1.2, 1);
bookshelfGroup.rotation.y = -Math.PI / 2;
scene.add(bookshelfGroup);

// Sticky note
const noteCanvas = document.createElement("canvas");
noteCanvas.width = 4096;
noteCanvas.height = 4096;
const nctx = noteCanvas.getContext("2d");

nctx.fillStyle = "#fff58f";
nctx.fillRect(0, 0, noteCanvas.width, noteCanvas.height);

nctx.font = "bold 300px Arial Black";
nctx.textAlign = "center";
nctx.textBaseline = "middle";

nctx.strokeStyle = "black";
nctx.lineWidth = 50;
nctx.shadowColor = "black";
nctx.shadowBlur = 90;

let line1 = 1100;
let line2 = 2000;
let line3 = 2900;

nctx.strokeText("COLORS DECEIVE…", 2048, line1);
nctx.fillStyle = "#222222";
nctx.fillText("COLORS DECEIVE…", 2048, line1);

nctx.strokeText("READ WHAT YOU SEE,", 2048, line2);
nctx.fillText("READ WHAT YOU SEE,", 2048, line2);

nctx.strokeText("NOT WHAT IS WRITTEN.", 2048, line3);
nctx.fillText("NOT WHAT IS WRITTEN.", 2048, line3);

const noteTexture = new THREE.CanvasTexture(noteCanvas);
noteTexture.minFilter = THREE.NearestFilter;
noteTexture.magFilter = THREE.NearestFilter;

const stickyNote = new THREE.Mesh(
  new THREE.PlaneGeometry(2.5, 2.5),
  new THREE.MeshBasicMaterial({
    map: noteTexture,
    transparent: true,
  })
);
stickyNote.position.set(-3.2, 1.1, 0.05);
stickyNote.rotation.y = 0;
bookshelfGroup.add(stickyNote);

// Portal riddle near table
const riddleCanvas = document.createElement("canvas");
riddleCanvas.width = 4096;
riddleCanvas.height = 4096;

const rctx = riddleCanvas.getContext("2d");
rctx.fillStyle = "#fff58f";
rctx.fillRect(0, 0, riddleCanvas.width, riddleCanvas.height);

rctx.font = "bold 300px Arial Black";
rctx.textAlign = "center";
rctx.textBaseline = "middle";

rctx.strokeStyle = "black";
rctx.lineWidth = 50;
rctx.shadowColor = "black";
rctx.shadowBlur = 90;

const riddleline1 = 1100;
const riddleline2 = 2000;
const riddleline3 = 2900;

rctx.strokeText("WALL = ORDER", 2048, riddleline1);
rctx.fillStyle = "#222222";
rctx.fillText("WALL = ORDER", 2048, riddleline1);

rctx.strokeText("CUBE = NUMBER", 2048, riddleline2);
rctx.fillText("CUBE = NUMBER", 2048, riddleline2);

rctx.strokeText("TRUST COLOR, NOT WORD", 2048, riddleline3);
rctx.fillText("TRUST COLOR, NOT WORD", 2048, riddleline3);

const riddleTexture = new THREE.CanvasTexture(riddleCanvas);
riddleTexture.minFilter = THREE.NearestFilter;
riddleTexture.magFilter = THREE.NearestFilter;

const riddleCard = new THREE.Mesh(
  new THREE.PlaneGeometry(2.5, 2.5),
  new THREE.MeshBasicMaterial({
    map: riddleTexture,
    transparent: true,
  })
);
riddleCard.position.set(-2.2, 0.4, -4.95);
riddleCard.rotation.y = 0;
scene.add(riddleCard);

//-----------------------------------------------------
// STROOP BOOK ORDER
//-----------------------------------------------------

const correctOrder = [
  0xffa500, // ORANGE
  0xffff00, // YELLOW
  0x800080, // PURPLE
  0x0000ff, // BLUE
  0xff0000, // RED
];

const startingBooks = [
  0x800080, // purple
  0xffa500, // orange
  0x0000ff, // blue
  0xffff00, // yellow
  0xff0000, // red
];

bookMeshes.length = 0;

for (let i = 0; i < startingBooks.length; i++) {
  const color = startingBooks[i];

  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.0, 0.25),
    new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      metalness: 0.1,
    })
  );

  book.position.set(-0.8 + i * 0.45, 0.5, 0.1);

  book.userData.stroopColor = color;
  book.userData.isBook = true;

  bookshelfGroup.add(book);
  bookMeshes.push(book);
}

//-----------------------------------------------------
// HAUNTED CABINET (DOOR WALL, LEFT OF DOOR) + RUNES + MISSING BOOK
//-----------------------------------------------------

// 1) Haunted cabinet
hauntedShelf = new THREE.Group();

// Wooden box
const shelfBox = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 0.8, 0.6),
  new THREE.MeshStandardMaterial({
    color: 0x2e1e0f,
    roughness: 0.8,
    metalness: 0.1,
  })
);
hauntedShelf.add(shelfBox);

// Door panel
const shelfDoorGeom = new THREE.BoxGeometry(1.15, 0.75, 0.1);
const shelfDoorMat = new THREE.MeshStandardMaterial({
  color: 0x3a2a1a,
  roughness: 0.7,
  metalness: 0.2,
});
shelfDoor = new THREE.Mesh(shelfDoorGeom, shelfDoorMat);
shelfDoor.position.set(0, 0, 0.35);
hauntedShelf.add(shelfDoor);

// Position: same wall as door, to the left
hauntedShelf.position.set(-2.2, -0.6, 4.8);
hauntedShelf.rotation.y = Math.PI;
scene.add(hauntedShelf);

// 2) Runes on cabinet door
const runeGeometry = new THREE.PlaneGeometry(0.25, 0.25);
const runeColors = [0xff0000, 0x5500ff, 0x00ffaa]; // red, blue/purple, green

for (let i = 0; i < 3; i++) {
  const rune = new THREE.Mesh(
    runeGeometry,
    new THREE.MeshBasicMaterial({ color: runeColors[i] })
  );

  // slight offset out from the door so they don't clip
  rune.position.set(-0.4 + i * 0.4, 0, 0.46);

  // let parent rotation handle facing the room
  rune.rotation.y = 0;

  rune.userData.index = i;
  hauntedShelf.add(rune);
  runes.push(rune);
}

// 3) Missing book – pick the 3rd book on Stroop shelf
missingBook = bookMeshes[2];

// Remove missing book from Stroop shelf mesh & puzzle list
bookshelfGroup.remove(missingBook);
bookMeshes.splice(bookMeshes.indexOf(missingBook), 1);

// Put missing book in the scene, hidden, inside cabinet
missingBook.visible = false;
scene.add(missingBook);

missingBook.position.copy(
  hauntedShelf.position.clone().add(new THREE.Vector3(0, -0.05, 0.05))
);
missingBook.rotation.set(0, Math.random() * Math.PI, 0);
missingBook.userData.isMissingBook = true;

// Cabinet open animation (SLOW + CREEPY)
function openHauntedShelf() {
  if (hauntedShelfOpen) return;
  hauntedShelfOpen = true;

  let t = 0;

  function swing() {
    t += 0.02; // ← slow creeping rotation

    shelfDoor.rotation.y = -t;

    if (t < Math.PI / 2) {
      requestAnimationFrame(swing);
    } else {
      shelfDoor.rotation.y = -Math.PI / 2;

      // Reveal the missing book inside the cabinet
      missingBook.visible = true;

      // Local position INSIDE the cabinet
      const localPos = new THREE.Vector3(0, -0.05, 0.3);

      // Convert to world coordinates
      hauntedShelf.localToWorld(localPos);

      // Move book there
      missingBook.position.copy(localPos);

      console.log("📘 Missing book revealed inside cabinet!");
    }
  }

  swing();
}

//-----------------------------------------------------
// STROOP CLUE PAPER ABOVE SHELF
//-----------------------------------------------------

const paperCanvas = document.createElement("canvas");
paperCanvas.width = 2048;
paperCanvas.height = 4096;
const pctx = paperCanvas.getContext("2d");

pctx.fillStyle = "#f2f2e8";
pctx.fillRect(0, 0, paperCanvas.width, paperCanvas.height);

pctx.font = "bold 300px sans-serif";
pctx.textAlign = "left";
pctx.textBaseline = "middle";

pctx.strokeStyle = "black";
pctx.lineWidth = 25;
pctx.shadowColor = "black";
pctx.shadowBlur = 40;

const stroopClue = [
  { word: "RED", color: "#ff7b00ff" }, // orange ink
  { word: "BLUE", color: "#ffff00" }, // yellow ink
  { word: "ORANGE", color: "#800080" }, // purple ink
  { word: "YELLOW", color: "#0715dfff" }, // blue ink
  { word: "PURPLE", color: "#ff0318ff" }, // red ink
];

for (let i = 0; i < stroopClue.length; i++) {
  const xText = 400;
  const yText = 400 + i * 650;

  pctx.fillStyle = "black";
  pctx.beginPath();
  pctx.arc(250, yText - 20, 40, 0, Math.PI * 2);
  pctx.fill();

  pctx.strokeText(stroopClue[i].word, xText, yText);
  pctx.fillStyle = stroopClue[i].color;
  pctx.fillText(stroopClue[i].word, xText, yText);
}

const paperTexture = new THREE.CanvasTexture(paperCanvas);
paperTexture.minFilter = THREE.LinearFilter;
paperTexture.magFilter = THREE.NearestFilter;

const paper = new THREE.Mesh(
  new THREE.PlaneGeometry(3.0, 1.9),
  new THREE.MeshBasicMaterial({
    map: paperTexture,
    transparent: false,
  })
);
scene.add(paper);
paper.position.set(4.85, 1.0, 1.0);
paper.rotation.y = -Math.PI / 2;

//-----------------------------------------------------
// FLOOR
//-----------------------------------------------------

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({
    map: floorTexture,
    color: 0xffffff,
    metalness: 0.2,
    roughness: 0.7,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.49;
floor.receiveShadow = true;
scene.add(floor);

//-----------------------------------------------------
// CUBE: FACE COLOR → NUMBER
//-----------------------------------------------------

function getFacingColor() {
  const axes = [
    { vec: new THREE.Vector3(1, 0, 0), colorNum: 5 }, // right -> green
    { vec: new THREE.Vector3(-1, 0, 0), colorNum: 6 }, // left -> purple
    { vec: new THREE.Vector3(0, 1, 0), colorNum: 2 }, // top -> yellow
    { vec: new THREE.Vector3(0, -1, 0), colorNum: 4 }, // bottom -> blue
    { vec: new THREE.Vector3(0, 0, 1), colorNum: 1 }, // front -> orange
    { vec: new THREE.Vector3(0, 0, -1), colorNum: 3 }, // back -> red
  ];

  let best = axes[0];
  let bestDot = -Infinity;

  for (let i = 0; i < axes.length; i++) {
    const worldVec = axes[i].vec.clone().applyQuaternion(cube.quaternion);
    const dot = worldVec.dot(new THREE.Vector3(0, 0, 1));
    if (dot > bestDot) {
      bestDot = dot;
      best = axes[i];
    }
  }
  return best.colorNum;
}

const colorMap = {
  1: 0xffa500,
  2: 0xffff00,
  3: 0xff0000,
  4: 0x0000ff,
  5: 0x00ff00,
  6: 0x800080,
};

const colorToNumber = {
  0xffa500: 1,
  0xffff00: 2,
  0xff0000: 3,
  0x0000ff: 4,
  0x00ff00: 5,
  0x800080: 6,
};

const correctCode = clueColors.map((hex) => colorToNumber[hex]);
console.log("Current cube puzzle code (for testing):", correctCode);

//-----------------------------------------------------
// CUBE PUZZLE INPUT
//-----------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    const current = getFacingColor();
    playerInput.push(current);
    console.log("Entered:", current, "→", playerInput);

    portal.material.emissiveIntensity = 2;
    setTimeout(() => (portal.material.emissiveIntensity = 1), 150);
  }

  if (e.code === "Enter") {
    checkPlayerCode();
  }

  if (e.code === "Backspace") {
    playerInput = [];
    console.log("code reset");
  }
});

function arraysMatch(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function checkPlayerCode() {
  if (arraysMatch(playerInput, correctCode)) {
    console.log("correct cube code");
    onCubePuzzleSolved();
  } else {
    console.log("wrong code. Try again!!");
    playerInput = [];
  }
}

function onCubePuzzleSolved() {
  doorOpening = true;
  console.log("🎉 Cube puzzle solved! Door opening...");

  let t = 0;
  function pulse() {
    t += 0.05;
    portal.material.emissiveIntensity = 1.5 + Math.sin(t * 8);
    if (t < Math.PI * 2) requestAnimationFrame(pulse);
    else portal.material.emissiveIntensity = 1;
  }
  pulse();
}

// update portal color + sprite
function portalColorUpdate() {
  const colorNum = getFacingColor();
  portal.material.emissive.setHex(colorMap[colorNum]);

  if (colorNum !== lastColorNum) {
    lastColorNum = colorNum;
    setSpriteNumber(colorNum);
  }
}

//-----------------------------------------------------
// MANUAL CUBE ROTATION (WASD) – locked until bookshelf solved
//-----------------------------------------------------

const keysPressed = {};
const rotationSpeed = 0.03;

window.addEventListener("keydown", (e) => {
  keysPressed[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  keysPressed[e.key.toLowerCase()] = false;
});

function rotateCube() {
  if (cubeLocked) return;

  if (keysPressed["w"]) cube.rotation.x -= rotationSpeed;
  if (keysPressed["s"]) cube.rotation.x += rotationSpeed;
  if (keysPressed["a"]) cube.rotation.y -= rotationSpeed;
  if (keysPressed["d"]) cube.rotation.y += rotationSpeed;
}

//-----------------------------------------------------
// TERMINAL UI
//-----------------------------------------------------

function openInterface() {
  const el = document.getElementById("code-interface");
  if (!el) return;
  el.style.display = "block";
  controls.enabled = false;
}

document.getElementById("cancel-btn")?.addEventListener("click", () => {
  const el = document.getElementById("code-interface");
  if (!el) return;
  el.style.display = "none";
  controls.enabled = true;
});

document.getElementById("submit-btn")?.addEventListener("click", () => {
  const inputEl = document.getElementById("code-input");
  if (!inputEl) return;

  const userInput = inputEl.value.split("").map((n) => parseInt(n));

  if (arraysMatch(userInput, correctCode)) {
    const el = document.getElementById("code-interface");
    if (el) el.style.display = "none";
    controls.enabled = true;
    onCubePuzzleSolved();
  } else {
    inputEl.value = "";
  }
});

//-----------------------------------------------------
// BOOKSHELF CHECK
//-----------------------------------------------------

function checkBooks() {
  const currentOrder = bookMeshes
    .slice()
    .sort((a, b) => a.position.x - b.position.x)
    .map((b) => b.userData.stroopColor);

  let isCorrect = true;
  for (let i = 0; i < correctOrder.length; i++) {
    if (currentOrder[i] !== correctOrder[i]) {
      isCorrect = false;
      break;
    }
  }

  if (isCorrect) {
    onBookshelfSolved();
  }
}

function onBookshelfSolved() {
  cubeLocked = false;
  metalCage.visible = false;

  bookMeshes.forEach((book) => book.material.color.set(0x00ff00));

  console.log("📚 Bookshelf puzzle solved! Cube unlocked.");
}

//-----------------------------------------------------
// CLICK HANDLER
//-----------------------------------------------------
window.addEventListener("click", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // ----- PORTAL CLICK -----
  const portalHits = raycaster.intersectObjects([portal], true);
  if (portalHits.length > 0) {
    if (cubeLocked) {
      showPortalMessage("The portal is inactive... solve the bookshelf first.");
    } else {
      console.log("Portal active!");
    }
    return;
  }

  // RUNE ORDER HINT
  const runeClueHit = raycaster.intersectObjects([runeCluePaper], true);
  if (runeClueHit.length > 0) {
    showRuneMessage("Maybe this code is used somewhere...");
    return;
  }

  // ----- HAUNTED RUNES PUZZLE -----
  if (!hauntedShelfSolved) {
    const runeHits = raycaster.intersectObjects(runes);
    if (runeHits.length > 0) {
      showRuneMessage(); // popup for runes

      const clickedRune = runeHits[0].object;

      if (clickedRune.userData.index === runesClicked) {
        runesClicked++;
        clickedRune.material.color.set(0x00ff00); // correct highlight

        if (runesClicked === 3) {
          hauntedShelfSolved = true;
          console.log("🧿 Haunted shelf solved!");

          flickerLights.forEach((light) => {
            light.intensity = 8;
            setTimeout(() => (light.intensity = 0.3), 80);
            setTimeout(() => (light.intensity = 1.0), 200);
          });

          openHauntedShelf();
        }
      } else {
        // wrong rune → reset
        runesClicked = 0;
        runes.forEach((r, i) =>
          r.material.color.set(
            i === 0 ? 0xff0000 : i === 1 ? 0x5500ff : 0x00ffaa
          )
        );
      }

      return; // stop here
    }
  }

  // ----- TERMINAL CLICK -----
  const terminalHits = raycaster.intersectObjects([terminal]);
  if (terminalHits.length > 0) {
    openInterface();
    return;
  }

  // ----- MISSING BOOK CLICK -----
  const missingHit = raycaster.intersectObjects([missingBook]);
  if (missingHit.length > 0 && !missingBookCollected) {
    missingBookCollected = true;
    console.log("📘 Missing book found!");

    flickerLights.forEach((light) => {
      light.intensity = 8;
      setTimeout(() => (light.intensity = 0.2), 80);
      setTimeout(() => (light.intensity = 1), 200);
    });

    const slotIndex = 2;
    const shelfLocal = new THREE.Vector3(-0.8 + slotIndex * 0.45, 0.5, 0.1);
    const targetPos = shelfLocal
      .clone()
      .applyMatrix4(bookshelfGroup.matrixWorld);

    let t = 0;
    function launchBook() {
      t += 0.02;

      missingBook.position.y += Math.sin(t * 3) * 0.01;
      missingBook.position.lerp(targetPos, 0.04);
      missingBook.rotation.x += 0.02;
      missingBook.rotation.y += 0.015;

      if (missingBook.position.distanceTo(targetPos) > 0.03) {
        requestAnimationFrame(launchBook);
      } else {
        missingBook.position.copy(targetPos);
        missingBook.rotation.set(0, 0, 0);

        bookshelfGroup.worldToLocal(missingBook.position);

        const worldQuat = missingBook.quaternion.clone();
        missingBook.quaternion.copy(
          bookshelfGroup
            .getWorldQuaternion(new THREE.Quaternion())
            .invert()
            .multiply(worldQuat)
        );

        scene.remove(missingBook);
        bookshelfGroup.add(missingBook);

        bookMeshes.push(missingBook);

        bookshelfUnlocked = true;
        console.log("📚 Bookshelf puzzle is now active!");
      }
    }
    launchBook();

    return;
  }

  // ----- BOOKSHELF PUZZLE -----
  const bookHits = raycaster.intersectObjects(bookMeshes);
  if (bookHits.length > 0) {
    if (!bookshelfUnlocked) {
      showBookMessage("One book is missing... find it first");
      return;
    }

    const hitBook = bookHits[0].object;

    if (!selectedBook) {
      selectedBook = hitBook;
    } else {
      if (hitBook !== selectedBook) {
        const tempPos = selectedBook.position.clone();
        selectedBook.position.copy(hitBook.position);
        hitBook.position.copy(tempPos);

        selectedBook = null;
        checkBooks();
      } else {
        selectedBook = null;
      }
    }
  }

  console.log(
    "Book X positions:",
    bookMeshes.map((b) => b.position.x)
  );
});

//-----------------------------------------------------
// MAIN LOOP
//-----------------------------------------------------

function animate() {
  controls.update();
  rotateCube();
  portalColorUpdate();

  // Haunted runes movement when not solved
  if (!hauntedShelfSolved) {
    const viewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.quaternion
    );
    const shelfDir = hauntedShelf.position
      .clone()
      .sub(camera.position)
      .normalize();
    const dot = viewDir.dot(shelfDir);

    if (dot < 0.97) {
      // not looking → twitch slightly but stay on door
      runes.forEach((r, i) => {
        r.position.x = -0.4 + i * 0.4 + (Math.random() - 0.5) * 0.015;
        r.position.y = (Math.random() - 0.5) * 0.015;
        r.position.z = 0.46; // keep on door surface
        r.rotation.z += (Math.random() - 0.5) * 0.04;
      });
    } else {
      // looking → calm + exact alignment
      runes.forEach((r, i) => {
        r.position.set(-0.4 + i * 0.4, 0, 0.46);
        r.rotation.z = 0;
      });
    }
  }

  composer.render();
  flickerLights.forEach(flickerLight);

  if (doorOpening && doorOpenProgress < 1) {
    doorOpenProgress += 0.01;
    door.position.y = 0.5 + doorOpenProgress * 4;
  }
}
renderer.setAnimationLoop(animate);

//-----------------------------------------------------
// RESIZE
//-----------------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

console.log("Three.js scene initialized.");
console.log(OrbitControls);
