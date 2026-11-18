import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { textPixels } from './font.js';

const W = 1280, H = 560;
const FPS = 25, SECONDS = 10, FRAMES = FPS * SECONDS;

// ---------- deterministic helpers ----------
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const hex = (h, k = 1) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };

// ---------- palette (from the avatar) ----------
const PAL = {
  K: hex('#17121f'), R: hex('#e3262f'), W: hex('#fff1e2'), S: hex('#f3d9b1'), E: hex('#120d18'),
  gill: hex('#b5774a'), redDeep: hex('#9b111b'),
};

// ---------- shape 1: the flat avatar sprite ----------
const AVATAR = [
  '................',
  '.....KKKKKK.....',
  '...KKRRRRWWKK...',
  '..KRRRRRWWWWRK..',
  '.KRRWWRRRWWRRRK.',
  '.KRWWWWRRRRRRRK.',
  'KRRWWWWRRRRWWRRK',
  'KRRRWWRRRRWWWWRK',
  'KRRRRRRRRRWWWWRK',
  'KRWWRRRRRRRWWRRK',
  '.KKKKKKKKKKKKKK.',
  '..KSSSESSESSSK..',
  '..KSSSESSESSSK..',
  '..KSSSSSSSSSSK..',
  '...KSSSSSSSSK...',
  '....KKKKKKKK....',
];
const flatFront = [];
AVATAR.forEach((row, y) => [...row].forEach((c, x) => {
  if (c !== '.') flatFront.push({ p: [(x - 7.5) * 1.0, (8 - y) * 1.0 - 0.5, 0], c: PAL[c], s: 1 });
}));

// ---------- shape 2: the 3D voxel mushroom ----------
const mush = [];
{
  const spots = [[0.2, 0.9, 0.4], [-0.75, 0.45, 0.45], [0.8, 0.35, 0.3], [-0.1, 0.5, -0.86], [0.55, 0.55, -0.6], [-0.65, 0.6, -0.4], [0.1, 0.35, 0.95]]
    .map((v) => new THREE.Vector3(...v).normalize());
  const inCap = (x, y, z) => y >= 2 && (x * x + z * z) / (7.6 * 7.6) + ((y - 2) * (y - 2)) / (6.6 * 6.6) <= 1;
  const inStem = (x, y, z) => y >= -6 && y <= 1 && x * x + z * z <= 3.7 * 3.7;
  const solid = (x, y, z) => inCap(x, y, z) || inStem(x, y, z);
  for (let x = -8; x <= 8; x++) for (let y = -7; y <= 9; y++) for (let z = -8; z <= 8; z++) {
    if (!solid(x, y, z)) continue;
    const shell = !solid(x + 1, y, z) || !solid(x - 1, y, z) || !solid(x, y + 1, z) || !solid(x, y - 1, z) || !solid(x, y, z + 1) || !solid(x, y, z - 1);
    if (!shell) continue;
    let c;
    if (inCap(x, y, z)) {
      if (y === 2) {
        const r = Math.sqrt(x * x + z * z);
        c = r > 6.2 ? PAL.K : PAL.gill;
      } else {
        const d = new THREE.Vector3(x, (y - 2) * 1.15, z).normalize();
        const spot = spots.some((s) => d.dot(s) > 0.93);
        c = spot ? PAL.W : (y <= 3 ? PAL.redDeep : PAL.R);
      }
    } else {
      c = PAL.S;
      if (z >= 2 && Math.abs(x) === 1 && (y === -1 || y === -2)) c = PAL.E;
      if (y === -6) c = PAL.K;
    }
    mush.push({ p: [x, y - 0.5, z], c, s: 1 });
  }
}

// ---------- shape 3: voxel type ----------
const letters = [];
{
  const big = textPixels('BIXTICO');
  const pitch = 0.98, w = 41 * pitch;
  for (const [x, y] of big) for (const z of [0, -1]) {
    const c = y <= 2 ? PAL.R : (y <= 4 ? hex('#ff5a4f') : PAL.W);
    letters.push({ p: [x * pitch - w / 2 + pitch / 2, (3 - y) * pitch + 1.9, z * pitch], c: z ? PAL.redDeep : c, s: 0.94 });
  }
  const sub = textPixels('SOFTWARE ENGINEER');
  const sp = 0.4, sw = (17 * 6 - 1) * sp;
  for (const [x, y] of sub) letters.push({ p: [x * sp - sw / 2, (3 - y) * sp - 4.1, 0.4], c: hex('#5eecc4', 1.25), s: 0.36 });
}

// ---------- pair shapes onto one pool of cubes ----------
const N = Math.max(flatFront.length * 3, mush.length, letters.length);
const flat = [];
for (let i = 0; flat.length < N; i++) {
  const f = flatFront[i % flatFront.length], layer = Math.floor(i / flatFront.length);
  const k = 1 - layer * 0.28;
  flat.push({ p: [f.p[0], f.p[1], -layer], c: f.c.map((v) => v * k), s: 1 });
}
// dust slots for shapes that have fewer cubes than the pool
const dust = (i) => ({ dust: true, a: rnd() * Math.PI * 2, r: 15 + rnd() * 7, y: -5 + rnd() * 14, c: rnd() < 0.5 ? hex('#5eecc4', 2.4) : hex('#ff5f8f', 2.4), s: 0.16 + rnd() * 0.14 });
const pad = (arr) => { const out = arr.slice(); while (out.length < N) out.push(dust(out.length)); return out; };

// instance identity follows the flat sprite; other shapes are sorted to line up with it
const order = (arr, key) => arr.map((e, i) => [key(e), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const assign = (shape, keyA, keyB) => {
  const padded = pad(shape);
  const oa = order(flat, keyA), ob = order(padded, (e) => (e.dust ? 1e9 + e.a : keyB(e)));
  const out = new Array(N);
  oa.forEach((fi, rank) => { out[fi] = padded[ob[rank]]; });
  return out;
};
const keyYX = (e) => -e.p[1] * 1000 + e.p[0] * 10 - e.p[2];
const mushA = assign(mush, keyYX, keyYX);
const keyXY = (e) => e.p[0] * 1000 - e.p[1] * 10 - e.p[2];
const lettA = assign(letters, keyXY, keyXY);

// per-instance randomness
const R = Array.from({ length: N }, () => ({
  lift: 3 + rnd() * 9, kick: (rnd() - 0.5) * 10, spin: 1 + Math.floor(rnd() * 3), ax: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
  delay: rnd(), wob: rnd() * Math.PI * 2,
}));
const flatDist = flat.map((e) => Math.hypot(e.p[0], e.p[1]) / 11.5);
const lettX = lettA.map((e) => (e.dust ? 0.5 + e.a / (Math.PI * 4) : clamp((e.p[0] + 20) / 40)));

// ---------- three.js setup ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070d');
scene.fog = new THREE.FogExp2('#05070d', 0.018);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 400);

scene.add(new THREE.HemisphereLight('#bcd7ff', '#1a0f1f', 0.55));
const key = new THREE.DirectionalLight('#fff1dc', 2.4); key.position.set(-14, 22, 18); scene.add(key);
const rimC = new THREE.DirectionalLight('#38e8ff', 2.6); rimC.position.set(20, 6, -16); scene.add(rimC);
const rimM = new THREE.DirectionalLight('#ff3d8b', 2.2); rimM.position.set(-22, 4, -12); scene.add(rimM);
const fill = new THREE.PointLight('#ff6a3d', 40, 40, 1.6); fill.position.set(0, -4, 12); scene.add(fill);

// cubes
const geo = new RoundedBoxGeometry(0.92, 0.92, 0.92, 2, 0.13);
const mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 });
const cubes = new THREE.InstancedMesh(geo, mat, N);
cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
scene.add(cubes);

// floor: fading grid + glow ring
const floorY = -8.2;
const gridMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uT: { value: 0 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
  fragmentShader: `varying vec3 vW; uniform float uT;
    float line(float c,float w){ float d=abs(fract(c-0.5)-0.5)/fwidth(c); return 1.-min(d/w,1.); }
    void main(){
      vec2 p=vW.xz/2.;
      float g=max(line(p.x,1.),line(p.y,1.));
      float r=length(vW.xz);
      float fade=smoothstep(60.,8.,r);
      float pulse=smoothstep(1.2,0.,abs(r-mod(uT*44.,44.)))*0.9;
      vec3 col=mix(vec3(0.08,0.35,0.55),vec3(0.95,0.2,0.45),smoothstep(0.,40.,r));
      gl_FragColor=vec4(col*(g*0.55+pulse*g*2.2), (g*0.55+pulse*0.25)*fade);
    }`,
  extensions: { derivatives: true },
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), gridMat);
floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; scene.add(floor);
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.2, 1.8), transparent: true, opacity: 0.9, side: THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(9.6, 9.9, 128), ringMat);
ring.rotation.x = -Math.PI / 2; ring.position.y = floorY + 0.02; scene.add(ring);
const ring2 = new THREE.Mesh(new THREE.RingGeometry(11.4, 11.5, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.4, 0.9), transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
ring2.rotation.x = -Math.PI / 2; ring2.position.y = floorY + 0.02; scene.add(ring2);

// spores
const SP = 520;
const spPos = new Float32Array(SP * 3), spCol = new Float32Array(SP * 3);
const spSeed = Array.from({ length: SP }, () => ({ a: rnd() * Math.PI * 2, r: 2 + rnd() * 26, o: rnd(), k: 1 + Math.floor(rnd() * 2), sw: rnd() * Math.PI * 2 }));
spSeed.forEach((s, i) => { const c = [hex('#5eecc4', 1.8), hex('#ff5f8f', 1.8), hex('#ffd166', 1.8), hex('#8ecbff', 1.8)][i % 4]; spCol.set(c, i * 3); });
const spGeo = new THREE.BufferGeometry();
spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
const spTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const spores = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.55, map: spTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(spores);

// orbiting tech cards (pixel-font textures)
const TECH = [['REACT NATIVE', '#5eecc4'], ['EXPO', '#a99cff'], ['NESTJS', '#ff4d5e'], ['SWIFT', '#ff7a45'], ['AWS', '#ffb020'], ['POSTGRES', '#6fb6ff'], ['TYPESCRIPT', '#4aa3ff'], ['DOCKER', '#3ad1ff']];
const cards = TECH.map(([label, color], i) => {
  const px = 4, tw = label.length * 6 - 1, cw = (tw + 22) * px, ch = 19 * px;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,12,22,0.86)'; g.beginPath(); g.roundRect(0, 0, cw, ch, 14); g.fill();
  g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); g.roundRect(2, 2, cw - 4, ch - 4, 12); g.stroke();
  g.fillStyle = color; g.fillRect(6 * px, 6 * px, 7 * px, 7 * px);
  g.fillStyle = '#f4f7fb';
  for (const [x, y] of textPixels(label)) g.fillRect((17 + x) * px, (6 + y) * px, px, px);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cw / ch * 1.9, 1.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  m.userData = { a0: (i / TECH.length) * Math.PI * 2, y: -2.5 + (i % 3) * 3.4 + (i % 2) * 0.8, r: 13.5 + (i % 2) * 2.2 };
  scene.add(m);
  return m;
});

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.5, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- timeline ----------
// [start, end] in loop-time 0..1
const T_EXTRUDE = [0.09, 0.31], T_EXPLODE = [0.56, 0.69], T_COLLAPSE = [0.86, 0.995];
const CAM = [ // t, azimuth(deg), elevation(deg), distance, targetY
  [0.00, 0, 2, 41, 0.3], [0.08, 0, 2, 41, 0.3], [0.30, 38, 16, 40, 0.8], [0.44, 8, 11, 37, 0.8], [0.56, -26, 13, 39, 0.8],
  [0.70, 0, 3, 47, 0.6], [0.84, 0, 4, 44, 0.6], [1.00, 0, 2, 41, 0.3],
];
function camAt(t) {
  let i = 0; while (i < CAM.length - 2 && t > CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[i + 1], u = easeInOutCubic(clamp((t - a[0]) / (b[0] - a[0])));
  return a.map((v, k) => lerp(v, b[k], u)).slice(1);
}

function shapePos(e, which, t, i, out) {
  if (e.dust) {
    const a = e.a + t * Math.PI * 2 * (which === 2 ? -1 : 1);
    out.set(Math.cos(a) * e.r, e.y + Math.sin(t * Math.PI * 4 + e.a * 3) * 0.6, Math.sin(a) * e.r);
    return;
  }
  out.set(e.p[0], e.p[1], e.p[2]);
  if (which === 0) { // flat sprite breathes a little
    out.z += Math.sin(t * Math.PI * 2 * 4 + e.p[0] * 0.5 + e.p[1] * 0.3) * 0.08;
  } else if (which === 1) { // mushroom spins and bobs
    const th = (t - 0.09) * Math.PI * 2 * 1.15;
    const c = Math.cos(th), s = Math.sin(th);
    const x = out.x * c + out.z * s, z = -out.x * s + out.z * c;
    out.x = x; out.z = z; out.y += Math.sin(t * Math.PI * 2 * 3) * 0.35;
  } else { // type ripples
    out.y += Math.sin(t * Math.PI * 2 * 5 - e.p[0] * 0.35) * 0.18;
    out.z += Math.max(0, Math.sin(t * Math.PI * 2 * 3 - e.p[0] * 0.22)) * 0.5;
  }
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
const A = new THREE.Vector3(), B = new THREE.Vector3();
const col = new THREE.Color();
const shapes = [flat, mushA, lettA];

function segment(t) {
  if (t < T_EXTRUDE[0]) return [0, 0, 0, T_EXTRUDE];
  if (t < T_EXTRUDE[1]) return [0, 1, (t - T_EXTRUDE[0]) / (T_EXTRUDE[1] - T_EXTRUDE[0]), T_EXTRUDE];
  if (t < T_EXPLODE[0]) return [1, 1, 0, T_EXPLODE];
  if (t < T_EXPLODE[1]) return [1, 2, (t - T_EXPLODE[0]) / (T_EXPLODE[1] - T_EXPLODE[0]), T_EXPLODE];
  if (t < T_COLLAPSE[0]) return [2, 2, 0, T_COLLAPSE];
  if (t < T_COLLAPSE[1]) return [2, 0, (t - T_COLLAPSE[0]) / (T_COLLAPSE[1] - T_COLLAPSE[0]), T_COLLAPSE];
  return [0, 0, 0, T_COLLAPSE];
}

function renderAt(t) {
  const [sa, sb, u] = segment(t);
  for (let i = 0; i < N; i++) {
    const ea = shapes[sa][i], eb = shapes[sb][i], r = R[i];
    shapePos(ea, sa, t, i, A);
    let p = 0;
    if (sa !== sb) {
      const d = sb === 1 ? flatDist[i] * 0.42 : sb === 2 ? r.delay * 0.4 : lettX[i] * 0.45;
      const span = sb === 2 ? 0.6 : 0.55;
      p = clamp((u - d) / span);
      shapePos(eb, sb, t, i, B);
    }
    const pe = sa === sb ? 0 : (sb === 2 ? easeInOutCubic(p) : easeOutBack(p));
    v.copy(A).lerp(sa === sb ? A : B, pe);
    const arc = Math.sin(Math.PI * clamp(p));
    if (sa !== sb) {
      v.y += arc * (sb === 2 ? r.lift * 0.8 : r.lift * 0.35);
      v.z += arc * (sb === 1 ? 4 + r.kick * 0.3 : r.kick * 0.6);
      q.setFromAxisAngle(r.ax, smooth(clamp(p)) * Math.PI * 0.5 * r.spin * 2);
    } else q.identity();
    const s = lerp(ea.s, eb.s, sa === sb ? 0 : smooth(clamp(p))) * (1 + arc * 0.15);
    sc.set(s, s, s);
    m4.compose(v, q, sc);
    cubes.setMatrixAt(i, m4);
    const ca = ea.c, cb = eb.c, k = sa === sb ? 0 : smooth(clamp(p));
    const flash = sa !== sb ? arc * 0.22 : 0;
    cubes.instanceColor.setXYZ(i, lerp(ca[0], cb[0], k) + flash * 0.4, lerp(ca[1], cb[1], k) + flash * 0.9, lerp(ca[2], cb[2], k) + flash);
  }
  cubes.instanceMatrix.needsUpdate = true;
  cubes.instanceColor.needsUpdate = true;

  // spores rise in loops that close at t=1
  spSeed.forEach((s, i) => {
    const h = ((s.o + t * s.k) % 1);
    const a = s.a + t * Math.PI * 2 * (s.k % 2 ? 1 : -1) * 0.25;
    spPos[i * 3] = Math.cos(a) * s.r + Math.sin(t * Math.PI * 2 * 2 + s.sw) * 0.6;
    spPos[i * 3 + 1] = floorY + h * 24;
    spPos[i * 3 + 2] = Math.sin(a) * s.r;
  });
  spGeo.attributes.position.needsUpdate = true;
  spores.material.opacity = 0.85;

  // cards orbit while the mushroom is on stage
  const cardVis = smooth(clamp((t - 0.24) / 0.06)) * (1 - smooth(clamp((t - 0.53) / 0.05)));
  cards.forEach((m, i) => {
    const d = m.userData, a = d.a0 + t * Math.PI * 2 * 0.9;
    m.position.set(Math.cos(a) * d.r, d.y + Math.sin(t * Math.PI * 6 + i) * 0.4, Math.sin(a) * d.r);
    m.quaternion.copy(camera.quaternion);
    const s = cardVis * (0.85 + 0.15 * Math.sin(t * Math.PI * 8 + i));
    m.scale.setScalar(Math.max(0.0001, s));
    m.visible = cardVis > 0.01;
  });

  ring.scale.setScalar(1 + Math.sin(t * Math.PI * 2 * 4) * 0.03);
  ring2.rotation.z = t * Math.PI * 2;
  gridMat.uniforms.uT.value = (t * 2) % 1;

  const [az, el, dist, ty] = camAt(t);
  const azr = THREE.MathUtils.degToRad(az), elr = THREE.MathUtils.degToRad(el);
  camera.position.set(Math.sin(azr) * Math.cos(elr) * dist, ty + Math.sin(elr) * dist, Math.cos(azr) * Math.cos(elr) * dist);
  camera.lookAt(0, ty, 0);
  // re-face cards after the camera moves
  cards.forEach((m) => m.quaternion.copy(camera.quaternion));

  composer.render();
  drawHud(t);
}

// ---------- HUD ----------
const hud = document.getElementById('hud');
hud.width = W; hud.height = H;
const hg = hud.getContext('2d');
function pixText(str, x, y, px, color, alpha = 1) {
  hg.globalAlpha = alpha; hg.fillStyle = color;
  for (const [a, b] of textPixels(str)) hg.fillRect(x + a * px, y + b * px, px, px);
  hg.globalAlpha = 1;
}
const PHASES = [[0, '01  SPRITE'], [T_EXTRUDE[0], '02  EXTRUDE'], [T_EXTRUDE[1], '03  RENDER'], [T_EXPLODE[0], '04  COMPILE'], [T_EXPLODE[1], '05  SHIP'], [T_COLLAPSE[0], '06  RESET']];
function drawHud(t) {
  hg.clearRect(0, 0, W, H);
  const f = Math.round(t * FRAMES);
  // scanlines + vignette
  const vg = hg.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  hg.fillStyle = vg; hg.fillRect(0, 0, W, H);

  // corner brackets
  hg.strokeStyle = 'rgba(94,236,196,0.75)'; hg.lineWidth = 3;
  const m = 26, L = 34;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    hg.beginPath(); hg.moveTo(x, y + sy * L); hg.lineTo(x, y); hg.lineTo(x + sx * L, y); hg.stroke();
  });

  // title block
  const typed = 'BIXTICO.CV';
  const n = Math.min(typed.length, Math.floor(clamp(t / 0.06) * typed.length + 0.0001));
  const shown = t < 0.06 ? typed.slice(0, n) : typed;
  pixText(shown, 52, 50, 4, '#f4f7fb');
  if (Math.floor(t * 20) % 2 === 0) hg.fillStyle = '#ff2d3a', hg.fillRect(52 + shown.length * 24, 50, 16, 28);
  pixText('M. AL MANZALAWY', 54, 96, 2, '#5eecc4');
  pixText('SOFTWARE ENGINEER / EGYPT', 54, 116, 2, '#8a96ad');

  // rec + timecode
  const blink = Math.floor(t * 10) % 2 === 0;
  if (blink) { hg.fillStyle = '#ff2d3a'; hg.beginPath(); hg.arc(W - 186, 64, 8, 0, Math.PI * 2); hg.fill(); }
  pixText('REC', W - 168, 57, 2, '#ff2d3a');
  const secs = Math.floor(f / FPS), fr = f % FPS;
  pixText(`00:0${secs % 10}:${String(fr).padStart(2, '0')}`, W - 168 + 0, 80, 2, '#f4f7fb', 0.85);

  // phase label
  let label = PHASES[0][1];
  for (const [s, l] of PHASES) if (t >= s) label = l;
  pixText(label, 52, H - 74, 3, '#ffd166');
  // progress bar
  hg.fillStyle = 'rgba(255,255,255,0.12)'; hg.fillRect(52, H - 46, 260, 4);
  hg.fillStyle = '#ffd166'; hg.fillRect(52, H - 46, 260 * t, 4);

  // voxel counter
  const [sa, sb] = segment(t);
  const counts = [flatFront.length, mush.length, letters.length];
  const shownCount = Math.round(lerp(counts[sa], counts[sb], segment(t)[2]));
  pixText(`VOXELS ${String(shownCount).padStart(4, '0')}`, W - 230, H - 74, 2, '#f4f7fb', 0.85);
  pixText(`FRAME  ${String(f).padStart(4, '0')}`, W - 230, H - 52, 2, '#8a96ad');
}

window.FRAMES = FRAMES;
window.renderAt = renderAt;
window.ready = true;
