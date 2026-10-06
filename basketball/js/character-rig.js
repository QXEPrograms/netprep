// Player Model V2: an original stylized basketball player built from code as
// ONE skinned mesh on a humanoid THREE.Skeleton.
//
//   ISO.createBasketballPlayer({ teamId, playerId, jerseyNumber, colors, appearance })
//     -> { root, rig, mesh, setAppearance(appearance) }
//
// root   THREE.Group the gameplay code positions/rotates (never the skeleton)
// rig    the character rig contract (ISO.CharacterRig): named bones + measured
//        segment lengths. Gameplay/pose code only talks to this contract, so a
//        future original GLB character with the same bone names and rest pose
//        can replace the procedural mesh (ISO.CharacterRig.fromObject3D).
//
// Rest pose (the contract): Y up, facing +Z, character right = -X, arms and
// legs hanging straight down, every bone's local rotation = identity. Pose code
// writes local rotations relative to that rest pose.
//
// Cost: one SkinnedMesh with two materials (body: shared vertex-coloured
// material; jersey numbers: per-player canvas texture) = 2 draw calls and one
// shadow caster per player, 21 bones.
(function () {

// ---- the rig contract ------------------------------------------------------------
// [name, parent, rest position relative to the parent]. Character right = -x.
const BONES = [
  ['root',          null,           [0, 0, 0]],
  ['hips',          'root',         [0, 1.0, 0]],
  ['spineLower',    'hips',         [0, 0.1, 0]],
  ['spineUpper',    'spineLower',   [0, 0.16, 0]],
  ['chest',         'spineUpper',   [0, 0.16, 0]],
  ['neck',          'chest',        [0, 0.18, 0]],
  ['head',          'neck',         [0, 0.1, 0]],
  ['rightClavicle', 'chest',        [-0.06, 0.1, 0]],
  ['rightUpperArm', 'rightClavicle', [-0.21, 0.02, 0]],
  ['rightForearm',  'rightUpperArm', [0, -0.34, 0]],
  ['rightHand',     'rightForearm', [0, -0.26, 0]],
  ['leftClavicle',  'chest',        [0.06, 0.1, 0]],
  ['leftUpperArm',  'leftClavicle', [0.21, 0.02, 0]],
  ['leftForearm',   'leftUpperArm', [0, -0.34, 0]],
  ['leftHand',      'leftForearm',  [0, -0.26, 0]],
  ['rightThigh',    'hips',         [-0.11, -0.08, 0]],
  ['rightShin',     'rightThigh',   [0, -0.44, 0]],
  ['rightFoot',     'rightShin',    [0, -0.41, 0]],
  ['leftThigh',     'hips',         [0.11, -0.08, 0]],
  ['leftShin',      'leftThigh',    [0, -0.44, 0]],
  ['leftFoot',      'leftShin',     [0, -0.41, 0]],
];
const REQUIRED = BONES.map((b) => b[0]);
// Points in a bone's local space the gameplay/pose code uses.
const HAND_CENTER = [0, -0.06, 0];   // palm centre (hand collider / ball contact)

ISO.CharacterRig = class {
  // bones: { name: THREE.Bone }
  constructor(bones, skeleton = null) {
    for (const n of REQUIRED) {
      if (!bones[n]) throw new Error(`CharacterRig: missing bone "${n}"`);
      this[n] = bones[n];
    }
    this.bones = REQUIRED.map((n) => bones[n]);
    this.skeleton = skeleton;
    this.handCenter = new THREE.Vector3(...HAND_CENTER);
    // Segment lengths measured from the rest pose (IK and leg math use these,
    // so another body with the same contract keeps working).
    const len = (n) => bones[n].position.length();
    this.dims = {
      upperArm: len('rightForearm'),
      forearm: len('rightHand') + this.handCenter.length(),   // elbow -> palm centre
      thigh: len('rightShin'),
      shin: len('rightFoot'),
      hipY: bones.hips.position.y + bones.rightThigh.position.y,
    };
    this.dims.ankleY = this.dims.hipY - this.dims.thigh - this.dims.shin;
  }

  // Adapter for a future original GLB/GLTF character: find the contract bones
  // by name (optionally through a name map, e.g. { rightUpperArm: 'upperarm_r' })
  // and wrap them. The asset must be authored in the contract's rest pose.
  static fromObject3D(object, nameMap = {}) {
    const found = {};
    object.traverse((o) => { if (o.isBone) found[o.name] = o; });
    const bones = {};
    for (const n of REQUIRED) bones[n] = found[nameMap[n] || n];
    let skeleton = null;
    object.traverse((o) => { if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton; });
    return new ISO.CharacterRig(bones, skeleton);
  }
};
ISO.CharacterRig.BONE_NAMES = REQUIRED;

// ---- appearance --------------------------------------------------------------------
ISO.DEFAULT_APPEARANCE = {
  skinTone: 0x8d5a3b,
  jersey: { primary: 0xf26b1d, secondary: 0x1d3a5f, accent: 0xffffff, number: '7' },
  shorts: { primary: 0xf26b1d, secondary: 0x1d3a5f },
  shoes: { upper: 0xf4f4f4, sole: 0x24262b, accent: 0xf26b1d },
  socks: 0xffffff,
  hair: { style: 'fade', color: 0x16100c },
  accessories: { headband: 0xffffff, wristbands: 0xffffff },   // null = none
};

// Old PlayerModel options ({ jersey, trim, skin, shoes, number }) still work.
ISO.resolveAppearance = function (opts = {}) {
  const A = JSON.parse(JSON.stringify(ISO.DEFAULT_APPEARANCE));
  const merge = (dst, src) => { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]); else dst[k] = src[k]; } return dst; };
  if (opts.jersey !== undefined && typeof opts.jersey !== 'object') {
    A.jersey.primary = opts.jersey; A.shorts.primary = opts.jersey;
  }
  if (opts.trim !== undefined) { A.jersey.secondary = opts.trim; A.shorts.secondary = opts.trim; }
  if (opts.skin !== undefined) A.skinTone = opts.skin;
  if (opts.shoes !== undefined && typeof opts.shoes !== 'object') A.shoes.upper = opts.shoes;
  if (opts.number !== undefined) A.jersey.number = String(opts.number);
  if (opts.appearance) merge(A, opts.appearance);
  if (opts.jerseyNumber !== undefined) A.jersey.number = String(opts.jerseyNumber);
  if (opts.colors) merge(A, opts.colors);
  return A;
};

// Region -> colour. Every vertex belongs to one region, so a new appearance is
// just a colour rewrite (no rebuild).
const REGIONS = ['skin', 'jersey', 'jerseyTrim', 'jerseyAccent', 'shorts', 'shortsTrim', 'sock',
  'shoeUpper', 'shoeSole', 'shoeAccent', 'shoeLining', 'hair', 'eye', 'headband', 'wristband', 'lip'];
const R = Object.fromEntries(REGIONS.map((r, i) => [r, i]));
function palette(A) {
  const c = (hex) => new THREE.Color().setHex(hex);
  const skin = c(A.skinTone);
  return [
    skin,
    c(A.jersey.primary), c(A.jersey.secondary), c(A.jersey.accent),
    c(A.shorts.primary), c(A.shorts.secondary), c(A.socks),
    c(A.shoes.upper), c(A.shoes.sole), c(A.shoes.accent), c(0x2a2a2e),
    c(A.hair.color), c(0x15100d),
    c(A.accessories.headband ?? A.hair.color), c(A.accessories.wristbands ?? A.skinTone),
    skin.clone().multiplyScalar(0.72),
  ];
}

// ---- geometry building blocks (all in rest-pose model space) ----------------------
// A part: indexed geometry + per-vertex region + per-vertex skin binding.
class PartBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.reg = []; this.si = []; this.sw = []; this.idx = []; this.groups = []; }

  // geo: BufferGeometry (indexed or not) already in model space
  // region(x, y, z) -> region id; skin(x, y, z) -> [boneA, boneB, wB]
  add(geo, region, skin, group = 0) {
    // smooth normals from the indexed shape; then (multi-colour parts) one
    // colour per triangle so trims and panels have crisp edges
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const perFace = typeof region === 'function';
    if (perFace && geo.index) { const g2 = geo.toNonIndexed(); geo.dispose(); geo = g2; }
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (perFace) {
        // one colour per quad (the two triangles of a quad are consecutive)
        if (i % 6 === 0) {
          const m = Math.min(6, p.count - i);
          let cx = 0, cy = 0, cz = 0;
          for (let k = 0; k < m; k++) { cx += p.getX(i + k); cy += p.getY(i + k); cz += p.getZ(i + k); }
          this._faceReg = region(cx / m, cy / m, cz / m);
        }
        this.reg.push(this._faceReg);
      } else this.reg.push(region);
      const [a, b, w] = skin(x, y, z);
      this.si.push(a, b, 0, 0);
      this.sw.push(1 - w, w, 0, 0);
    }
    const start = this.idx.length;
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    const last = this.groups[this.groups.length - 1];
    if (last && last.materialIndex === group) last.count += this.idx.length - start;
    else this.groups.push({ start, count: this.idx.length - start, materialIndex: group });
    geo.dispose();
  }

  build() {
    // group by material so each material is one contiguous draw range
    const byMat = new Map();
    for (const g of this.groups) { if (!byMat.has(g.materialIndex)) byMat.set(g.materialIndex, []); byMat.get(g.materialIndex).push(g); }
    const idx = []; const groups = [];
    for (const [m, gs] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) {
      const start = idx.length;
      for (const g of gs) for (let i = g.start; i < g.start + g.count; i++) idx.push(this.idx[i]);
      groups.push({ start, count: idx.length - start, materialIndex: m });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length), 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    geo.setIndex(idx);
    for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex);
    geo.userData.regions = Uint8Array.from(this.reg);
    return geo;
  }
}

// Loft along Y: rings of (y, rx, rz, cx, cz) with a superellipse cross-section.
// caps: close the bottom/top ends.
function loftY(rings, seg = 12, { capBottom = false, capTop = false, exp = 2 } = {}) {
  const pos = [], uv = [], idx = [];
  const se = (a) => { const c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.abs(c) ** (2 / exp), Math.sign(s) * Math.abs(s) ** (2 / exp)]; };
  rings.forEach((r, j) => {
    const [y, rx, rz, cx = 0, cz = 0] = r;
    for (let i = 0; i <= seg; i++) {
      const [c, s] = se(Math.PI + (i / seg) * Math.PI * 2);   // seam at the back
      pos.push(cx + rx * s, y, cz + rz * c);
      uv.push(i / seg, j / (rings.length - 1));
    }
  });
  const W = seg + 1;
  // outward winding: rings listed top-down use (a, c, b), bottom-up the reverse
  const descending = rings[0][0] > rings[rings.length - 1][0];
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (descending) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  // caps: (centre, a, b) faces +y
  const cap = (j, faceUp) => {
    const [y, , , cx = 0, cz = 0] = rings[j];
    const ci = pos.length / 3; pos.push(cx, y, cz); uv.push(0.5, 0.5);
    for (let i = 0; i < seg; i++) { const a = j * W + i, b = a + 1; if (faceUp) idx.push(ci, a, b); else idx.push(ci, b, a); }
  };
  const lowest = descending ? rings.length - 1 : 0, highest = descending ? 0 : rings.length - 1;
  if (capBottom) cap(lowest, false);
  if (capTop) cap(highest, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Loft along Z (shoes): sections (z, halfWidth, yBottom, yTop) with a rounded-box profile.
function loftZ(sections, cx, seg = 16, exp = 3.2) {
  const pos = [], idx = [];
  const se = (a) => { const c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.abs(c) ** (2 / exp), Math.sign(s) * Math.abs(s) ** (2 / exp)]; };
  for (const [z, hw, y0, y1] of sections) {
    const cy = (y0 + y1) / 2, hh = (y1 - y0) / 2;
    for (let i = 0; i <= seg; i++) { const [c, s] = se(-Math.PI / 2 + (i / seg) * Math.PI * 2); pos.push(cx + hw * c, cy + hh * s, z); }   // seam under the sole
  }
  const W = seg + 1;
  for (let j = 0; j < sections.length - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  for (const [j, flip] of [[0, true], [sections.length - 1, false]]) {
    const [z, , y0, y1] = sections[j];
    const ci = pos.length / 3; pos.push(cx, (y0 + y1) / 2, z);
    for (let i = 0; i < seg; i++) { const a = j * W + i, b = a + 1; if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(cx, cy, cz, rx, ry, rz, ws = 14, hs = 10, thetaLen = Math.PI) {
  const g = new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, thetaLen);
  g.scale(rx, ry, rz); g.translate(cx, cy, cz);
  return g;
}
function capsuleY(x, y0, y1, r, z = 0, seg = 8) {
  const g = new THREE.CapsuleGeometry(r, Math.abs(y1 - y0), 3, seg);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the player body ------------------------------------------------------------------
function buildBody(B, A, numberMaterialIndex) {
  const P = new PartBuilder();
  const I = (n) => B.index[n];

  // Skin bindings (rest pose heights; see BONES).
  const spineW = (x, y) => {
    // hips 1.0 | spineLower 1.1 | spineUpper 1.26 | chest 1.42 | neck 1.6 | head 1.7
    const chain = [[1.02, 'hips'], [1.14, 'spineLower'], [1.3, 'spineUpper'], [1.46, 'chest'], [1.62, 'neck'], [1.71, 'head']];
    if (y <= chain[0][0]) return [I('hips'), I('hips'), 0];
    for (let k = 0; k < chain.length - 1; k++) {
      const [y0, a] = chain[k], [y1, b] = chain[k + 1];
      if (y <= y1) return [I(a), I(b), ss(y0, y1, y)];
    }
    return [I('head'), I('head'), 0];
  };
  const armW = (pre) => (x, y) => {
    if (y > 1.5) return [I(pre + 'Clavicle'), I(pre + 'UpperArm'), 1 - ss(1.5, 1.63, y) * 0.6];
    if (y > 1.17) return [I(pre + 'UpperArm'), I(pre + 'Forearm'), ss(1.25, 1.15, y)];
    if (y > 0.93) return [I(pre + 'Forearm'), I(pre + 'Hand'), ss(0.955, 0.925, y)];
    return [I(pre + 'Hand'), I(pre + 'Hand'), 0];
  };
  const legW = (pre) => (x, y) => {
    if (y > 0.84) return [I('hips'), I(pre + 'Thigh'), ss(0.97, 0.84, y)];
    if (y > 0.43) return [I(pre + 'Thigh'), I(pre + 'Shin'), ss(0.53, 0.43, y)];
    if (y > 0.05) return [I(pre + 'Shin'), I(pre + 'Foot'), ss(0.12, 0.06, y)];
    return [I(pre + 'Foot'), I(pre + 'Foot'), 0];
  };
  const headW = () => [I('head'), I('head'), 0];

  // -- torso: sleeveless jersey -----------------------------------------------------
  // (y, half width, half depth, -, forward offset)
  const torso = [
    [1.625, 0.07, 0.06, 0, 0.0],
    [1.605, 0.13, 0.08, 0, 0.0],
    [1.585, 0.17, 0.098, 0, 0.0],
    [1.565, 0.205, 0.115, 0, 0.0],
    [1.52, 0.225, 0.132, 0, 0.006],
    [1.48, 0.23, 0.14, 0, 0.01],
    [1.44, 0.228, 0.144, 0, 0.012],
    [1.36, 0.216, 0.142, 0, 0.012],
    [1.27, 0.194, 0.13, 0, 0.006],
    [1.17, 0.18, 0.122, 0, 0.0],
    [1.07, 0.18, 0.122, 0, 0.0],
    [0.99, 0.184, 0.124, 0, 0.0],
  ];
  const ringAt = (y) => {
    for (let k = 0; k < torso.length - 1; k++) {
      const a = torso[k], b = torso[k + 1];
      if (y <= a[0] && y >= b[0]) { const t = (a[0] - y) / (a[0] - b[0]); return a.map((v, j) => v + (b[j] - v) * t); }
    }
    return torso[torso.length - 1];
  };
  P.add(loftY(torso, 28), (x, y, z) => {
    if (y > 1.586) return R.jerseyTrim;                                  // collar (ring-aligned)
    if (y > 1.46 && Math.abs(x) > 0.2) return R.jerseyTrim;             // armhole piping
    const r = ringAt(y), side = Math.abs(x / r[1]) / Math.hypot(x / r[1], (z - r[4]) / r[2]);
    if (side > 0.95 && y < 1.44) return R.jerseyAccent;                // side panels (constant angular width)
    return R.jersey;
  }, spineW);

  // -- jersey numbers (skinned decals: front small, back large) -------------------
  const decal = (cy, size, back) => {
    const n = 8, pos = [], uv = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const u = i / n, v = j / n;
      const x = (u - 0.5) * size * (back ? -1 : 1), y = cy + (v - 0.5) * size;   // reads left-to-right from its side
      const r = ringAt(y), rx = r[1], rz = r[2], fz = r[4];
      const q = Math.min(0.98, Math.abs(x) / rx);
      const z = fz + rz * Math.sqrt(1 - q * q) + 0.004;
      pos.push(x, y, back ? -z + 2 * fz : z);
      uv.push(u, v);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  P.add(decal(1.31, 0.17, false), R.jersey, spineW, numberMaterialIndex);
  P.add(decal(1.34, 0.24, true), R.jersey, spineW, numberMaterialIndex);

  // -- neck & head -----------------------------------------------------------------
  P.add(loftY([[1.73, 0.048, 0.05, 0, -0.004], [1.64, 0.052, 0.054, 0, -0.004], [1.56, 0.06, 0.058, 0, -0.004]], 10), R.skin, spineW);
  P.add(ellipsoid(0, 1.805, -0.004, 0.097, 0.116, 0.106, 18, 14), R.skin, headW);           // cranium
  P.add(ellipsoid(0, 1.745, 0.026, 0.074, 0.06, 0.074, 14, 10), R.skin, headW);             // jaw / chin
  P.add(ellipsoid(0, 1.79, 0.104, 0.016, 0.03, 0.02, 8, 6), R.skin, headW);                 // nose
  for (const s of [-1, 1]) {
    P.add(ellipsoid(s * 0.097, 1.795, -0.006, 0.014, 0.03, 0.022, 8, 6), R.skin, headW);    // ears
    P.add(ellipsoid(s * 0.036, 1.818, 0.092, 0.014, 0.01, 0.01, 8, 6), R.eye, headW);       // eyes
    P.add(ellipsoid(s * 0.036, 1.842, 0.096, 0.022, 0.006, 0.01, 8, 4), R.hair, headW);     // brows
  }
  P.add(ellipsoid(0, 1.728, 0.088, 0.03, 0.008, 0.012, 10, 4), R.lip, headW);                // mouth

  // hair styles (original, geometry only)
  const hair = A.hair.style;
  if (hair === 'fade' || hair === 'buzz') {
    const t = hair === 'fade' ? 0.012 : 0.004;
    P.add(ellipsoid(0, 1.81 + t * 0.5, -0.008, 0.1 + t, 0.118 + t, 0.11 + t, 18, 10, Math.PI * 0.52), R.hair, headW);
    if (hair === 'fade') P.add(ellipsoid(0, 1.885, -0.004, 0.085, 0.045, 0.098, 14, 6, Math.PI * 0.5), R.hair, headW);
  } else if (hair === 'afro') {
    P.add(ellipsoid(0, 1.86, -0.012, 0.142, 0.118, 0.14, 18, 12, Math.PI * 0.62), R.hair, headW);
  } else if (hair === 'twists') {
    P.add(ellipsoid(0, 1.812, -0.008, 0.106, 0.124, 0.115, 18, 10, Math.PI * 0.5), R.hair, headW);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rr = k % 2 ? 0.055 : 0.03;
      const g = new THREE.CylinderGeometry(0.014, 0.018, 0.07, 6);
      g.rotateX(0.35 * Math.cos(a)); g.rotateZ(-0.35 * Math.sin(a));
      g.translate(Math.sin(a) * rr, 1.925, Math.cos(a) * rr - 0.01);
      P.add(g, R.hair, headW);
    }
  }
  if (A.accessories.headband !== null && A.accessories.headband !== undefined) {
    const g = new THREE.TorusGeometry(0.106, 0.014, 6, 24);
    g.rotateX(Math.PI / 2); g.scale(1, 1, 1.08); g.translate(0, 1.85, -0.006);
    P.add(g, R.headband, headW);
  }

  // -- arms ----------------------------------------------------------------------------
  for (const [pre, s] of [['right', -1], ['left', 1]]) {
    const x = 0.27 * s, w = armW(pre);
    P.add(ellipsoid(x - s * 0.005, 1.535, 0, 0.07, 0.068, 0.068, 14, 10), R.skin, w);         // deltoid
    P.add(loftY([[1.57, 0.06, 0.062, x], [1.47, 0.066, 0.068, x], [1.37, 0.06, 0.064, x],
      [1.27, 0.05, 0.052, x], [1.2, 0.047, 0.048, x]], 14), R.skin, w);                          // upper arm
    P.add(loftY([[1.23, 0.048, 0.049, x], [1.14, 0.054, 0.055, x], [1.04, 0.045, 0.045, x],
      [0.96, 0.036, 0.035, x], [0.93, 0.034, 0.032, x]], 14), R.skin, w);                       // forearm
    if (A.accessories.wristbands !== null) P.add(loftY([[1.0, 0.047, 0.047, x], [0.95, 0.042, 0.042, x]], 14, { capTop: true, capBottom: true }), R.wristband, w);
    // hand: palm faces the body (thin in x), fingers together, slightly cupped
    P.add(loftY([[0.945, 0.024, 0.032, x], [0.915, 0.022, 0.045, x], [0.875, 0.021, 0.047, x],
      [0.84, 0.019, 0.043, x - s * 0.004], [0.815, 0.016, 0.034, x - s * 0.008], [0.8, 0.01, 0.02, x - s * 0.01]], 10, { capBottom: true }), R.skin, w);
    const th = new THREE.CapsuleGeometry(0.012, 0.045, 2, 6);
    th.rotateX(0.45); th.translate(x - s * 0.012, 0.9, 0.046);
    P.add(th, R.skin, w);                                                                       // thumb
  }

  // -- shorts --------------------------------------------------------------------------
  P.add(loftY([[1.085, 0.19, 0.132], [1.055, 0.193, 0.134], [1.035, 0.195, 0.136], [0.96, 0.2, 0.14], [0.88, 0.19, 0.13], [0.85, 0.12, 0.08]], 24, { capBottom: true }),
    (x, y) => (y > 1.036 ? R.shortsTrim : R.shorts), spineW);
  for (const [pre, s] of [['right', -1], ['left', 1]]) {
    const x = 0.11 * s, w = legW(pre);
    P.add(loftY([[0.96, 0.1, 0.116, x + s * 0.01], [0.86, 0.108, 0.114, x + s * 0.01], [0.74, 0.108, 0.11, x + s * 0.008], [0.67, 0.106, 0.108, x + s * 0.007], [0.64, 0.104, 0.106, x + s * 0.006]], 20),
      (xx, y, z) => { const dx = (xx - x - s * 0.008) / 0.106, dz = z / 0.11;
        return y < 0.665 ? R.shortsTrim : (dx * s > 0 && Math.abs(dx) / Math.hypot(dx, dz) > 0.96 ? R.shortsTrim : R.shorts); }, w);
    // legs: thigh, knee, calf, sock
    P.add(loftY([[0.68, 0.082, 0.086, x], [0.57, 0.072, 0.074, x], [0.48, 0.06, 0.064, x],
      [0.4, 0.066, 0.072, x, -0.01], [0.32, 0.06, 0.064, x, -0.008], [0.22, 0.047, 0.05, x]], 14), R.skin, w);
    P.add(loftY([[0.226, 0.05, 0.053, x], [0.15, 0.047, 0.05, x], [0.08, 0.044, 0.048, x, -0.004]], 14), R.sock, w);
    // shoe: rounded profile from heel to toe (z), sole, side panel, collar
    const shoe = [
      [-0.088, 0.035, 0.004, 0.09], [-0.078, 0.05, 0.003, 0.125], [-0.05, 0.056, 0.002, 0.135], [-0.01, 0.058, 0.002, 0.13],
      [0.05, 0.061, 0.002, 0.1], [0.11, 0.06, 0.002, 0.082], [0.16, 0.054, 0.002, 0.07], [0.19, 0.044, 0.004, 0.062], [0.205, 0.026, 0.008, 0.05],
    ];
    P.add(loftZ(shoe, x), (xx, y, z) => {
      const dx = Math.abs(xx - x);
      if (y < 0.026) return R.shoeSole;
      if (y > 0.112 && z < 0.0) return R.shoeLining;                                // ankle opening
      if (dx > 0.045 && y > 0.04 && y < 0.075 && z > -0.06 && z < 0.12) return R.shoeAccent;   // side panel
      if (z < -0.07 && y < 0.11) return R.shoeAccent;                               // heel counter
      return R.shoeUpper;
    }, legW(pre));
  }
  return P.build();
}

// Jersey number texture (front and back decal share it).
function numberTexture(A) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = '800 92px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12; ctx.strokeStyle = '#' + A.jersey.accent.toString(16).padStart(6, '0');
  ctx.strokeText(A.jersey.number, 64, 70);
  ctx.fillStyle = '#' + A.jersey.secondary.toString(16).padStart(6, '0');
  ctx.fillText(A.jersey.number, 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let SHARED_BODY_MATERIAL = null;

ISO.createBasketballPlayer = function (cfg = {}) {
  const A = ISO.resolveAppearance(cfg);
  // bones
  const bones = {}, index = {};
  const list = BONES.map(([name, parent, p], i) => {
    const b = new THREE.Bone(); b.name = name; b.position.set(p[0], p[1], p[2]);
    bones[name] = b; index[name] = i;
    if (parent) bones[parent].add(b);
    return b;
  });
  const skeleton = new THREE.Skeleton(list);
  const geo = buildBody({ index }, A, 1);
  if (!SHARED_BODY_MATERIAL) SHARED_BODY_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  const numberMat = new THREE.MeshStandardMaterial({ map: numberTexture(A), transparent: true, alphaTest: 0.35, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.SkinnedMesh(geo, [SHARED_BODY_MATERIAL, numberMat]);
  mesh.name = 'player-body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;            // poses (falls, dunks) leave the rest-pose bounds
  mesh.add(list[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton);

  const root = new THREE.Group();
  root.name = 'player';
  root.add(mesh);
  const rig = new ISO.CharacterRig(bones, skeleton);

  const applyColors = (appearance) => {
    const pal = palette(appearance), regions = geo.userData.regions, col = geo.attributes.color;
    for (let i = 0; i < regions.length; i++) { const c = pal[regions[i]]; col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
  };
  applyColors(A);

  return {
    root, rig, mesh, appearance: A,
    teamId: cfg.teamId || null, playerId: cfg.playerId || null,
    // Colours and number change in place; a different hair style needs a new body.
    setAppearance(next) {
      const B2 = ISO.resolveAppearance({ appearance: Object.assign({}, this.appearance, next) });
      applyColors(B2);
      if (B2.jersey.number !== this.appearance.jersey.number || B2.jersey.secondary !== this.appearance.jersey.secondary || B2.jersey.accent !== this.appearance.jersey.accent) {
        numberMat.map.dispose(); numberMat.map = numberTexture(B2); numberMat.needsUpdate = true;
      }
      this.appearance = B2;
    },
  };
};
})();
