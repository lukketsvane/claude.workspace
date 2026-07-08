/*
 * toys-gl.js — the same three scenes as toys.js, rendered for real:
 * the actual textured GLB models from the physical set (models/),
 * lit by exactly two directional lights — a warm key and a cool
 * fill, no ambient, no environment — with soft mapped shadows on
 * the page itself (transparent canvas, shadow-catcher ground).
 *
 * The physics comes straight from toys.js: TOYS[name].scene(u)
 * returns each block's rigid transform; this file only draws.
 *
 * Usage:
 *   <script type="module" src="/toys-gl.js"></script>
 *   <block-toys-gl name="rull"></block-toys-gl>
 *
 * Attributes: name, scale (px per mm, default 0.55), title.
 */

import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { TOYS, bounds } from "./toys.js";

/* ---- the physical models (glTF y-up, centred; spec from BLOCKS.md) ---- */

const MODELS = {
  plank75: { file: "block_blue_02.glb", dims: [75, 30, 15] },
  plank60: { file: "block_blue_01.glb", dims: [60, 30, 15] },
  cube: { file: "block_lightblue_cube.glb", dims: [30, 30, 30] },
  cyl: { file: "block_red_cylinder.glb", dims: [30, 30, 60] },
  orange: { file: "block_orange.glb", dims: [45, 45, 24] },
};

/* model axes → scene axes (z-up, bottom-centred, mm):
 * our x = model z (length), our y = model x (width), our z = model y (up) */
const M2W = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 1, 0),  // model x → our y
  new THREE.Vector3(0, 0, 1),  // model y → our z
  new THREE.Vector3(1, 0, 0),  // model z → our x
);

/* upright60 uses the plank60 model stood on end: local 60×30×15
 * rotated to 15×30×60 (see toys.js) */
const PRE_UPRIGHT = new THREE.Matrix4().set(
  0, 0, -1, 7.5,
  0, 1, 0, 0,
  1, 0, 0, 30,
  0, 0, 0, 1,
);

const BASE = new URL(".", import.meta.url);

let protosPromise = null;
function loadProtos() {
  protosPromise ??= (async () => {
    const loader = new GLTFLoader();
    const protos = {};
    await Promise.all(Object.entries(MODELS).map(async ([key, m]) => {
      const gltf = await loader.loadAsync(new URL(`models/${m.file}`, BASE).href);
      const rot = new THREE.Group();
      rot.quaternion.setFromRotationMatrix(M2W);
      rot.add(gltf.scene);
      // measure in scene axes, then scale each axis to the exact
      // physical dimensions so contacts match the physics
      const box = new THREE.Box3().setFromObject(rot);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const fit = new THREE.Group();
      fit.scale.set(m.dims[0] / size.x, m.dims[1] / size.y, m.dims[2] / size.z);
      fit.add(rot);
      const proto = new THREE.Group();
      proto.add(fit);
      // bottom-centred origin, like the physics frames
      fit.position.set(
        -centre.x * fit.scale.x,
        -centre.y * fit.scale.y,
        -centre.z * fit.scale.z + m.dims[2] / 2,
      );
      proto.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) o.material.shadowSide = THREE.FrontSide;
        }
      });
      protos[key] = proto;
    }));
    return protos;
  })();
  return protosPromise;
}

/* ---- the two lights, and only the two lights ---- */

const KEY = { dir: new THREE.Vector3(0.56, 0.28, 0.9).normalize(), color: 0xffd9b0, intensity: 3.1 };
const FILL = { dir: new THREE.Vector3(-0.76, -0.3, 0.6).normalize(), color: 0xa3bfff, intensity: 1.15 };

/* camera: the same isometric framing as toys.js (azimuth 45°,
 * elevation 30°), so the GL cards line up with the canvas ones */
const SIN_E = 0.5, COS_E = Math.sqrt(3) / 2, K = Math.SQRT1_2;

function makeLight({ dir, color, intensity }, r, mapSize, radius) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.copy(dir).multiplyScalar(600);
  l.castShadow = true;
  l.shadow.mapSize.set(mapSize, mapSize);
  l.shadow.camera.left = -r; l.shadow.camera.right = r;
  l.shadow.camera.top = r; l.shadow.camera.bottom = -r;
  l.shadow.camera.near = 100; l.shadow.camera.far = 1400;
  l.shadow.radius = radius;
  l.shadow.blurSamples = 16;
  l.shadow.bias = -0.0002;
  return l;
}

class BlockToysGL extends HTMLElement {
  static observedAttributes = ["name", "scale"];
  #renderer = null;
  #scene = null;
  #camera = null;
  #actors = null;
  #raf = null;
  #io = null;
  #visible = true;
  #start = performance.now();
  #built = false;

  connectedCallback() {
    const name = this.getAttribute("name");
    if (!TOYS[name] || this.#renderer) return;
    this.style.display = "inline-block";
    this.style.lineHeight = "0";
    this.style.verticalAlign = "middle";
    this.setAttribute("role", "img");
    this.setAttribute("aria-label", this.getAttribute("title") || name);
    this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.18;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.VSMShadowMap;
    this.append(this.#renderer.domElement);
    this.#build();
  }

  async #build() {
    const name = this.getAttribute("name");
    const toy = TOYS[name];
    const protos = await loadProtos();
    if (!this.isConnected || this.#built) return;
    this.#built = true;

    this.#scene = new THREE.Scene();

    const r = toy.ext.r * 1.9;
    this.#scene.add(makeLight(KEY, r, 2048, 5));
    this.#scene.add(makeLight(FILL, r, 1024, 9));

    // shadow catcher: the page itself is the floor
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(toy.ext.r * 6, toy.ext.r * 6),
      new THREE.ShadowMaterial({ opacity: 0.42 }),
    );
    ground.receiveShadow = true;
    this.#scene.add(ground);

    // one actor per piece in the scene at u = 0
    this.#actors = toy.scene(0).map((p) => {
      const src = p.block === "upright60" ? "plank60" : p.block;
      const actor = protos[src].clone();
      actor.matrixAutoUpdate = false;
      this.#scene.add(actor);
      return actor;
    });

    this.#camera = new THREE.OrthographicCamera();
    this.#camera.up.set(0, 0, 1);
    this.#camera.position.set(K * COS_E, K * COS_E, SIN_E).multiplyScalar(1000);
    this.#camera.lookAt(0, 0, 0);
    this.#camera.near = 1;
    this.#camera.far = 3000;

    this.#layout();
    this.#io = new IntersectionObserver(([entry]) => {
      this.#visible = entry.isIntersecting;
      this.#sync();
    });
    this.#io.observe(this);
    REDUCED.addEventListener("change", () => this.#sync());
    this.#frame();
    this.#sync();
  }

  disconnectedCallback() {
    this.#stop();
    this.#io && this.#io.disconnect();
  }

  attributeChangedCallback() {
    if (!this.#built) return;
    this.#layout();
    this.#frame();
  }

  get #scale() {
    const s = Number(this.getAttribute("scale"));
    return s > 0 ? s : 0.55;
  }

  #layout() {
    const toy = TOYS[this.getAttribute("name")];
    const scale = this.#scale;
    const { w, h, ox, oy } = bounds(toy.ext, scale);
    const dpr = window.devicePixelRatio || 1;
    this.#renderer.setPixelRatio(dpr);
    this.#renderer.setSize(Math.ceil(w), Math.ceil(h));
    this.#renderer.domElement.style.width = w + "px";
    this.#renderer.domElement.style.height = h + "px";
    // match the canvas renderer's isometric projection exactly:
    // camera x = (y-x)K = proj_x, camera y = -proj_y (screen y down)
    this.#camera.left = -ox / scale;
    this.#camera.right = (w - ox) / scale;
    this.#camera.top = oy / scale;
    this.#camera.bottom = -(h - oy) / scale;
    this.#camera.updateProjectionMatrix();
  }

  #pose(u) {
    const toy = TOYS[this.getAttribute("name")];
    const pieces = toy.scene(u);
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i], m = this.#actors[i].matrix;
      m.set(
        p.xf.r[0][0], p.xf.r[0][1], p.xf.r[0][2], p.xf.t[0],
        p.xf.r[1][0], p.xf.r[1][1], p.xf.r[1][2], p.xf.t[1],
        p.xf.r[2][0], p.xf.r[2][1], p.xf.r[2][2], p.xf.t[2],
        0, 0, 0, 1,
      );
      if (p.block === "upright60") m.multiply(PRE_UPRIGHT);
    }
  }

  #frame() {
    const toy = TOYS[this.getAttribute("name")];
    const u = ((performance.now() - this.#start) / 1000 / toy.dur) % 1;
    this.#pose(REDUCED.matches ? 0 : u);
    this.#renderer.render(this.#scene, this.#camera);
  }

  /* deterministic still frame (exports, tests); stops the clock */
  renderAt(u) {
    if (!this.#built) return false;
    this.#stop();
    this.#io && this.#io.disconnect();
    this.#pose(u);
    this.#renderer.render(this.#scene, this.#camera);
    return true;
  }

  get ready() { return this.#built; }

  #sync() {
    if (!this.#built) return;
    const run = this.#visible && !REDUCED.matches;
    if (run && this.#raf === null) {
      const tick = () => { this.#frame(); this.#raf = requestAnimationFrame(tick); };
      this.#raf = requestAnimationFrame(tick);
    } else if (!run) {
      this.#stop();
      this.#frame(); // static first frame
    }
  }

  #stop() {
    if (this.#raf !== null) cancelAnimationFrame(this.#raf);
    this.#raf = null;
  }
}

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

if (!customElements.get("block-toys-gl")) {
  customElements.define("block-toys-gl", BlockToysGL);
}
