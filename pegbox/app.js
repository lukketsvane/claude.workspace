// Pegbox — generative parametric porcelain forms.
//
// Every sculpture is N copies of a single "fin" arrayed radially around an
// axis (optionally stacked in rings). The fin's profile lives in the
// (radial, vertical) plane and is grown from a scalar field: a vertical
// chain of star-modulated lobes plus a connecting spine, minus punch-holes,
// cut flat at the floor. Marching squares extracts the outline (holes
// included), which is extruded with a bevel and glazed with vertex colors.

import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { mergeVertices } from './vendor/BufferGeometryUtils.js';

// ---------------------------------------------------------------- utilities

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------- param space

const FAMILIES = ['wild', 'spokes', 'lattice', 'crown', 'kelp'];

function genParams(seed) {
  const R = mulberry32(seed);
  const rr = (a, b) => a + R() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 0.999));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  const fam = R() < 0.36 ? 'wild' : pick(FAMILIES.slice(1));
  const P = { seed, family: fam };

  if (fam === 'spokes') {          // low stacked discs of flat radial blades
    P.fins = ri(24, 40); P.rows = 1; P.stacks = ri(2, 3);
    P.height = rr(0.42, 0.62); P.rIn = rr(0.42, 0.55); P.rOut = rr(1.3, 1.55);
    P.aspR = rr(1.0, 1.25); P.aspY = rr(0.8, 1.0);
    P.starK = pick([2, 3]); P.starAmp = rr(0, 0.15);
    P.pw = rr(1.3, 2.2); P.shear = rr(-0.15, 0.15);
    P.thick = rr(0.1, 0.16); P.punch = rr(0, 0.4);
  } else if (fam === 'lattice') {  // stacked star/cross lattice ring
    P.fins = ri(14, 22); P.rows = 3; P.stacks = 1;
    P.height = rr(1.0, 1.35); P.rIn = rr(0.55, 0.7); P.rOut = rr(1.12, 1.3);
    P.aspR = rr(1.1, 1.35); P.aspY = rr(1.0, 1.15);
    P.starK = 4; P.starAmp = rr(0.25, 0.45);
    P.pw = rr(2.0, 4.0); P.shear = rr(-0.1, 0.1);
    P.thick = rr(0.15, 0.22); P.punch = rr(0.6, 1);
  } else if (fam === 'crown') {    // tall angular zigzag blades
    P.fins = ri(16, 26); P.rows = ri(1, 2); P.stacks = 1;
    P.height = rr(1.4, 2.0); P.rIn = rr(0.4, 0.55); P.rOut = rr(1.2, 1.45);
    P.aspR = rr(0.85, 1.1); P.aspY = rr(1.0, 1.2);
    P.starK = pick([2, 3]); P.starAmp = rr(0.2, 0.45);
    P.pw = rr(2.5, 5.0); P.shear = rr(0.35, 0.75) * pick([-1, 1]);
    P.thick = rr(0.07, 0.12); P.punch = rr(0.3, 0.8);
  } else if (fam === 'kelp') {     // soft blobby wavering fins
    P.fins = ri(18, 30); P.rows = ri(2, 3); P.stacks = 1;
    P.height = rr(1.1, 1.55); P.rIn = rr(0.45, 0.6); P.rOut = rr(1.1, 1.35);
    P.aspR = rr(0.95, 1.2); P.aspY = rr(1.0, 1.2);
    P.starK = pick([2, 3]); P.starAmp = rr(0.05, 0.2);
    P.pw = rr(1.0, 1.7); P.shear = rr(-0.3, 0.3);
    P.thick = rr(0.12, 0.2); P.punch = rr(0.5, 1);
  } else {                          // wild — the rest of the space
    P.rows = ri(1, 4);
    P.stacks = P.rows > 2 ? 1 : ri(1, 3);
    P.fins = ri(10, 44);
    P.height = rr(0.4, 2.2) / (P.stacks > 1 ? 1.6 : 1);
    P.rIn = rr(0.35, 0.7); P.rOut = rr(1.0, 1.55);
    P.aspR = rr(0.8, 1.35); P.aspY = rr(0.8, 1.25);
    P.starK = ri(2, 6); P.starAmp = rr(0, 0.5);
    P.pw = rr(1.0, 5.0); P.shear = rr(-0.7, 0.7);
    P.thick = rr(0.06, 0.24); P.punch = rr(0, 1);
  }

  P.starPhase = rr(0, Math.PI * 2);
  P.twistPhase = rr(-0.7, 0.7);
  P.shearAlt = R() < 0.6;
  P.bulge = rr(-0.18, 0.28);
  P.tilt = rr(-0.22, 0.22);
  P.stackTwist = rr(0.6, 1.4);
  P.topCut = P.stacks > 1;
  // celadon glaze range: pale green-grey through blue-grey
  P.hue = rr(150, 210) / 360; P.sat = rr(0.25, 0.45); P.lit = rr(0.5, 0.62);
  return P;
}

// -------------------------------------------------- scalar field for a fin

function buildLobes(P) {
  const J = mulberry32((P.seed ^ 0x9e3779b9) >>> 0); // stable per-seed jitter
  const jr = (a, b) => a + J() * (b - a);
  const rSpan = P.rOut - P.rIn;
  const rMid = (P.rIn + P.rOut) / 2;
  const lobeH = P.height / P.rows;
  const lobes = [], punches = [];

  for (let j = 0; j < P.rows; j++) {
    const cy = lobeH * (j + 0.28);
    const t = clamp(cy / P.height, 0, 1);
    const cx = rMid + (P.bulge * Math.sin(Math.PI * t) + P.tilt * (t - 0.5)) * rSpan;
    lobes.push({
      cx, cy,
      sx: rSpan * 0.5 * P.aspR * jr(0.92, 1.08),
      sy: lobeH * 0.5 * P.aspY * jr(0.92, 1.08),
      k: P.starK,
      amp: P.starAmp * jr(0.85, 1.15),
      phase: P.starPhase + j * P.twistPhase,
      shear: P.shear * (P.shearAlt && j % 2 ? -1 : 1),
      pw: P.pw,
    });
  }
  // punch-holes between rows (or a vertical chain inside single-row fins)
  if (P.punch > 0.05) {
    const pr = lobeH * jr(0.13, 0.2);
    if (P.rows > 1) {
      for (let j = 0; j < P.rows - 1; j++) {
        punches.push({
          cx: P.rIn + rSpan * jr(0.28, 0.5),
          cy: lobeH * (j + 0.78),
          s: pr, amp: 1.5 * P.punch,
        });
      }
    } else if (P.punch > 0.45) {
      const n = 1 + Math.floor(jr(0, 2.99));
      for (let j = 0; j < n; j++) {
        punches.push({
          cx: P.rIn + rSpan * jr(0.25, 0.55),
          cy: P.height * (0.2 + 0.6 * (n === 1 ? 0.5 : j / (n - 1))),
          s: pr * jr(0.8, 1.4), amp: 1.5 * P.punch,
        });
      }
    }
  }
  const spine = P.rows > 1 ? {
    r: P.rIn + rSpan * 0.12,
    w: rSpan * 0.14,
    y0: lobes[0].cy, y1: lobes[lobes.length - 1].cy,
    hs: lobeH * 0.4,
  } : null;
  return { lobes, punches, spine };
}

function fieldValue(r, y, F, P) {
  if (y < 0 || r < 0.04) return -1;
  if (P.topCut && y > P.height) return -1;
  let f = 0;
  for (const L of F.lobes) {
    let dx = (r - L.cx) / L.sx;
    const dy = (y - L.cy) / L.sy;
    dx += L.shear * dy;
    const m = 1 + L.amp * Math.cos(L.k * Math.atan2(dy, dx) + L.phase);
    const d2 = (dx * dx + dy * dy) * m * m;
    f += 1 / (1 + Math.pow(d2, L.pw));
  }
  const S = F.spine;
  if (S) {
    const dr = (r - S.r) / S.w;
    const dyv = (y < S.y0 ? S.y0 - y : y > S.y1 ? y - S.y1 : 0) / S.hs;
    const d2 = dr * dr + dyv * dyv;
    f += 0.9 / (1 + d2 * d2);
  }
  for (const Q of F.punches) {
    const dx = (r - Q.cx) / Q.s, dy = (y - Q.cy) / Q.s;
    const d2 = dx * dx + dy * dy;
    f -= Q.amp / (1 + d2 * d2);
  }
  return f - 0.5;
}

// ------------------------------------------------------- marching squares

// Extract iso-contours of fn>0 over grid as closed loops of [x,y] points.
function marchLoops(fn, x0, x1, y0, y1, nx, ny) {
  const xs = new Float64Array(nx), ys = new Float64Array(ny);
  for (let i = 0; i < nx; i++) xs[i] = x0 + (x1 - x0) * i / (nx - 1);
  for (let j = 0; j < ny; j++) ys[j] = y0 + (y1 - y0) * j / (ny - 1);
  const V = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      let v = (i === 0 || j === 0 || i === nx - 1 || j === ny - 1)
        ? -1 : fn(xs[i], ys[j]);
      if (v === 0) v = 1e-9;
      V[j * nx + i] = v;
    }

  const pts = new Map();   // edge key -> point index
  const coords = [];       // point coords
  const segs = [];         // [keyA, keyB]
  const adj = new Map();   // edge key -> seg indices

  function edgePoint(key, xa, ya, va, xb, yb, vb) {
    let idx = pts.get(key);
    if (idx === undefined) {
      const t = va / (va - vb);
      idx = coords.length;
      coords.push([xa + t * (xb - xa), ya + t * (yb - ya)]);
      pts.set(key, idx);
    }
    return idx;
  }
  function addSeg(ka, kb) {
    const s = segs.length;
    segs.push([ka, kb]);
    for (const k of [ka, kb]) {
      let l = adj.get(k);
      if (!l) adj.set(k, l = []);
      l.push(s);
    }
  }

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v00 = V[j * nx + i], v10 = V[j * nx + i + 1];
      const v01 = V[(j + 1) * nx + i], v11 = V[(j + 1) * nx + i + 1];
      let idx = 0;
      if (v00 > 0) idx |= 1; if (v10 > 0) idx |= 2;
      if (v11 > 0) idx |= 4; if (v01 > 0) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      // edge keys: B bottom, R right, T top, L left
      const B = 'h' + i + '_' + j, T = 'h' + i + '_' + (j + 1);
      const L = 'v' + i + '_' + j, Rk = 'v' + (i + 1) + '_' + j;
      const pB = () => edgePoint(B, xs[i], ys[j], v00, xs[i + 1], ys[j], v10);
      const pT = () => edgePoint(T, xs[i], ys[j + 1], v01, xs[i + 1], ys[j + 1], v11);
      const pL = () => edgePoint(L, xs[i], ys[j], v00, xs[i], ys[j + 1], v01);
      const pR = () => edgePoint(Rk, xs[i + 1], ys[j], v10, xs[i + 1], ys[j + 1], v11);
      const S = (a, b, ka, kb) => { a(); b(); addSeg(ka, kb); };
      switch (idx) {
        case 1: case 14: S(pL, pB, L, B); break;
        case 2: case 13: S(pB, pR, B, Rk); break;
        case 3: case 12: S(pL, pR, L, Rk); break;
        case 4: case 11: S(pR, pT, Rk, T); break;
        case 6: case 9: S(pB, pT, B, T); break;
        case 7: case 8: S(pL, pT, L, T); break;
        case 5: case 10: {
          const c = (v00 + v10 + v01 + v11) / 4;
          if ((c > 0) === (idx === 5)) { S(pL, pT, L, T); S(pB, pR, B, Rk); }
          else { S(pL, pB, L, B); S(pR, pT, Rk, T); }
          break;
        }
      }
    }
  }

  // chain segments into closed loops
  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const startKey = segs[s0][0];
    let curKey = segs[s0][1];
    const keyLoop = [startKey, curKey];
    let guard = segs.length + 2;
    while (curKey !== startKey && guard-- > 0) {
      const cand = adj.get(curKey) || [];
      let next = -1;
      for (const s of cand) if (!used[s]) { next = s; break; }
      if (next < 0) break;
      used[next] = 1;
      curKey = segs[next][0] === curKey ? segs[next][1] : segs[next][0];
      keyLoop.push(curKey);
    }
    if (keyLoop.length > 3 && keyLoop[keyLoop.length - 1] === startKey) {
      keyLoop.pop();
      loops.push(keyLoop.map(k => coords[pts.get(k)]));
    }
  }
  return loops;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
      inside = true;
  }
  return inside;
}

function smoothLoop(pts, alpha) {
  const n = pts.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    out[i] = [
      p[0] * (1 - alpha) + (a[0] + b[0]) * alpha / 2,
      p[1] * (1 - alpha) + (a[1] + b[1]) * alpha / 2,
    ];
  }
  return out;
}

function simplifyDP(pts, eps) {
  const n = pts.length;
  if (n < 8) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1];
    const dx = pts[b][0] - ax, dy = pts[b][1] - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let dmax = 0, imax = -1;
    for (let i = a + 1; i < b; i++) {
      const t = clamp(((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2, 0, 1);
      const ex = pts[i][0] - (ax + t * dx), ey = pts[i][1] - (ay + t * dy);
      const d = ex * ex + ey * ey;
      if (d > dmax) { dmax = d; imax = i; }
    }
    if (imax > 0 && dmax > eps * eps) {
      keep[imax] = 1;
      stack.push([a, imax], [imax, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

// ----------------------------------------------------------- fin geometry

function buildShapes(P) {
  const F = buildLobes(P);
  const rMax = P.rOut * 1.3, yMax = P.height * (P.topCut ? 1.02 : 1.4);
  const nx = 140, ny = Math.round(nx * yMax / rMax) + 20;
  const cell = rMax / nx;
  let loops = marchLoops((r, y) => fieldValue(r, y, F, P),
    0, rMax, -cell * 2, yMax, nx, clamp(ny, 80, 320));

  loops = loops
    .map(l => simplifyDP(smoothLoop(l, 0.5), cell * 0.3))
    .filter(l => l.length > 5);

  const info = loops.map(l => ({ pts: l, area: Math.abs(signedArea(l)), depth: 0 }));
  for (const a of info)
    for (const b of info)
      if (a !== b && b.area > a.area && pointInPoly(b.pts, a.pts[0][0], a.pts[0][1]))
        a.depth++;

  const maxArea = Math.max(...info.map(o => o.area), 1e-9);
  const outers = info.filter(o => o.depth % 2 === 0 && o.area > maxArea * 0.02);
  const shapes = [];
  for (const o of outers) {
    const shape = new THREE.Shape(o.pts.map(p => new THREE.Vector2(p[0], p[1])));
    for (const h of info) {
      if (h.depth === o.depth + 1 && h.area < o.area &&
          pointInPoly(o.pts, h.pts[0][0], h.pts[0][1]) &&
          h.area > maxArea * 0.001) {
        shape.holes.push(new THREE.Path(h.pts.map(p => new THREE.Vector2(p[0], p[1]))));
      }
    }
    shapes.push(shape);
  }
  return shapes;
}

function buildFinGeometry(P) {
  const shapes = buildShapes(P);
  if (!shapes.length) return null;
  const bs = Math.min(P.thick * 0.36, 0.026);
  let geo = new THREE.ExtrudeGeometry(shapes, {
    depth: P.thick, steps: 1, curveSegments: 1,
    bevelEnabled: true, bevelThickness: bs * 0.9, bevelSize: bs, bevelSegments: 2,
  });
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  geo.translate(0, 0, -P.thick / 2);

  // glaze: celadon body, thin white glaze on outermost tips + top edges
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const body = new THREE.Color().setHSL(P.hue, P.sat, P.lit);
  const white = new THREE.Color(0xfbfbf6);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const tip = smoothstep(bb.max.x * 0.85, bb.max.x * 0.985, x);
    const top = P.topCut ? 0 : smoothstep(bb.max.y * 0.93, bb.max.y * 0.995, y) * 0.75;
    c.copy(body).lerp(white, Math.min(1, tip + top) * 0.95);
    const shade = 0.88 + 0.12 * smoothstep(bb.min.x, bb.max.x, x);
    col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ------------------------------------------------------------------ scene

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, preserveDrawingBuffer: true,
});
renderer.setClearColor(0xf3f2ef, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
camera.position.set(0, 0.42, 3.7);
camera.lookAt(0, 0, 0);

const key = new THREE.DirectionalLight(0xffffff, 0.55);
key.position.set(2, 4, 3);
scene.add(key);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dcd8, 0.35));

const rig = new THREE.Group();    // pitch (drag up/down)
const spin = new THREE.Group();   // turntable (drag left/right)
const holder = new THREE.Group(); // fit scale + centering
rig.add(spin); spin.add(holder); scene.add(rig);
rig.rotation.x = 0.24;

// soft contact shadow
const shadowTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, 'rgba(88,98,94,0.42)');
  grad.addColorStop(0.55, 'rgba(88,98,94,0.16)');
  grad.addColorStop(1, 'rgba(88,98,94,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
})();
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false,
  })
);
shadow.rotation.x = -Math.PI / 2;
holder.add(shadow);

const material = new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness: 0.16, metalness: 0,
  clearcoat: 1.0, clearcoatRoughness: 0.18,
  envMapIntensity: 1.0, specularIntensity: 1.0,
});

let mesh = null;
let bounds = { width: 2, height: 1 };

function assemble(P) {
  if (mesh) {
    holder.remove(mesh);
    mesh.geometry.dispose();
    mesh = null;
  }
  const geo = buildFinGeometry(P);
  if (!geo) return;
  const count = P.fins * P.stacks;
  mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const halfStep = Math.PI / P.fins;
  const stackDy = P.height * 0.985;
  let n = 0;
  for (let s = 0; s < P.stacks; s++) {
    const rot0 = s * halfStep * P.stackTwist;
    for (let i = 0; i < P.fins; i++) {
      dummy.position.set(0, s * stackDy, 0);
      dummy.rotation.set(0, rot0 + i * Math.PI * 2 / P.fins, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
  }
  holder.add(mesh);

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const totalH = (P.stacks - 1) * stackDy + bb.max.y;
  bounds = { width: bb.max.x * 2, height: totalH };
  shadow.scale.setScalar(bb.max.x * 3.1);
  shadow.position.y = bb.min.y - 0.005;
  fit();

  // gentle scale-in
  const target = holder.scale.x;
  holder.scale.setScalar(target * 0.9);
  const t0 = performance.now();
  (function pop(now) {
    const t = Math.min(1, (now - t0) / 260);
    holder.scale.setScalar(target * (0.9 + 0.1 * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(pop);
  })(t0);
}

function fit() {
  const dist = camera.position.length();
  const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const visW = visH * camera.aspect;
  const s = Math.min((visH * 0.6) / bounds.height, (visW * 0.76) / bounds.width);
  holder.scale.setScalar(s);
  holder.position.y = -bounds.height * s / 2;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fit();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));

// -------------------------------------------------- rotate-only interaction

let velY = 0, velX = 0, dragging = false, lastX = 0, lastY = 0, lastMove = 0;
let activePointer = null;

canvas.addEventListener('pointerdown', (e) => {
  if (activePointer !== null) return; // single pointer only — no pinch
  activePointer = e.pointerId;
  dragging = true;
  lastX = e.clientX; lastY = e.clientY;
  velY = velX = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || e.pointerId !== activePointer) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  const k = 5 / Math.min(innerWidth, innerHeight);
  spin.rotation.y += dx * k;
  rig.rotation.x = clamp(rig.rotation.x + dy * k * 0.6, -0.4, 0.85);
  velY = dx * k; velX = dy * k * 0.6;
  lastMove = performance.now();
});
function endPointer(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  dragging = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ----------------------------------------------------------------- UI

const SLIDERS = [
  ['fins',   'fins',   8, 48, 1],
  ['rows',   'rows',   1, 4, 1],
  ['stacks', 'stacks', 1, 3, 1],
  ['height', 'height', 0.4, 2.4, 0.01],
  ['rOut',   'spread', 0.9, 1.6, 0.01],
  ['starAmp','wave',   0, 0.6, 0.01],
  ['pw',     'edge',   1, 5, 0.05],
  ['shear',  'slant', -0.8, 0.8, 0.01],
  ['thick',  'thick',  0.05, 0.28, 0.005],
  ['punch',  'holes',  0, 1, 0.01],
];

let P = null;
let rebuildQueued = false;

function queueRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    P.topCut = P.stacks > 1;
    assemble(P);
  });
}

const slidersDiv = document.getElementById('sliders');
const inputs = {};
for (const [k, label, min, max, step] of SLIDERS) {
  const row = document.createElement('div');
  row.className = 'row';
  const lab = document.createElement('label');
  lab.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
  inp.addEventListener('input', () => {
    P[k] = parseFloat(inp.value);
    queueRebuild();
  });
  row.append(lab, inp);
  slidersDiv.append(row);
  inputs[k] = inp;
}
const seedDiv = document.getElementById('seed');

function syncUI() {
  for (const [k] of SLIDERS) inputs[k].value = P[k];
  seedDiv.textContent = 'SEED ' + P.seed + ' · ' + P.family.toUpperCase();
}

function shuffle(seed) {
  P = genParams(seed >>> 0);
  history.replaceState(null, '', '#' + P.seed);
  syncUI();
  assemble(P);
}

document.getElementById('shuffle').addEventListener('click', () => {
  shuffle((Math.random() * 0xffffffff) >>> 0);
});
document.getElementById('tune').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('open');
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space') shuffle((Math.random() * 0xffffffff) >>> 0);
});

// ----------------------------------------------------------------- loop

let running = true;
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) requestAnimationFrame(tick);
});

function tick(now) {
  if (!running) return;
  requestAnimationFrame(tick);
  if (!dragging) {
    spin.rotation.y += velY;
    rig.rotation.x = clamp(rig.rotation.x + velX, -0.4, 0.85);
    velY *= 0.95; velX *= 0.92;
    if (performance.now() - lastMove > 3000) {
      velY += (0.0018 - velY) * 0.02; // idle turntable drift
    }
  }
  renderer.render(scene, camera);
}

// expose a capture hook for icon generation / testing
window.__pegbox = {
  capture(size) {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = '#f3f2ef';
    g.fillRect(0, 0, size, size);
    const m = Math.min(src.width, src.height);
    g.drawImage(src, (src.width - m) / 2, (src.height - m) / 2 * 0.86, m, m,
      0, 0, size, size);
    return cv.toDataURL('image/png');
  },
  shuffle,
  get params() { return P; },
};

resize();
const hashSeed = parseInt(location.hash.slice(1), 10);
shuffle(Number.isFinite(hashSeed) ? hashSeed : (Math.random() * 0xffffffff) >>> 0);
requestAnimationFrame(tick);
