// Hoop: rim, transparent backboard with markings, stanchion and a simple net.
ISO.Hoop = (function () {
  const H = ISO.CONFIG.hoop;
  const COL = ISO.CONFIG.colors;

  function build() {
    const group = new THREE.Group();
    group.name = 'hoop';

    const rim = buildRim();
    const board = buildBackboard();
    const support = buildSupport();
    const net = buildNet();

    group.add(rim, board, support, net.object);
    return { group, rim, net };
  }

  function buildRim() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: COL.rim, roughness: 0.35, metalness: 0.55 });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(H.rimRadius + H.rimTube, H.rimTube, 10, 48), mat);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    g.add(ring);

    // Bracket from the back of the rim to the backboard
    const backOfRim = H.centerZ - H.rimRadius - H.rimTube;
    const len = backOfRim - H.boardZ;
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, len), mat);
    bracket.position.set(0, -0.01, H.boardZ + len / 2 - H.centerZ);
    bracket.castShadow = true;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.02), mat);
    plate.position.set(0, -0.06, H.boardZ + 0.01 - H.centerZ);
    g.add(bracket, plate);

    // Small net hooks under the rim
    const hookGeo = new THREE.BoxGeometry(0.012, 0.025, 0.012);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const hook = new THREE.Mesh(hookGeo, mat);
      hook.position.set(Math.cos(a) * H.rimRadius, -0.018, Math.sin(a) * H.rimRadius);
      g.add(hook);
    }

    g.position.set(0, H.rimHeight, H.centerZ);
    g.name = 'rim';
    return g;
  }

  function buildBackboard() {
    const g = new THREE.Group();
    const cy = H.boardBottom + H.boardHeight / 2;
    const cz = H.boardZ - H.boardThickness / 2;

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(H.boardWidth, H.boardHeight, H.boardThickness),
      new THREE.MeshPhysicalMaterial({
        color: 0xcfe6ff,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0.0,
        clearcoat: 1,
        depthWrite: false,
      })
    );
    glass.position.set(0, cy, cz);
    glass.renderOrder = 2;
    g.add(glass);

    // White markings: outer border + shooter's square, sitting just in front of the glass.
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const frontZ = H.boardZ + 0.002;
    const bw = 0.05;
    const addBar = (w, h, x, y) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), white);
      bar.position.set(x, y, frontZ);
      g.add(bar);
    };
    // outer border
    addBar(H.boardWidth, bw, 0, H.boardBottom + H.boardHeight - bw / 2);
    addBar(H.boardWidth, bw, 0, H.boardBottom + bw / 2);
    addBar(bw, H.boardHeight, -H.boardWidth / 2 + bw / 2, cy);
    addBar(bw, H.boardHeight, H.boardWidth / 2 - bw / 2, cy);
    // shooter's square (24" x 18"), bottom edge just above the rim
    const sqW = 0.61, sqH = 0.457, sqB = H.rimHeight + 0.02;
    addBar(sqW, bw, 0, sqB + sqH - bw / 2);
    addBar(sqW, bw, 0, sqB + bw / 2);
    addBar(bw, sqH, -sqW / 2 + bw / 2, sqB + sqH / 2);
    addBar(bw, sqH, sqW / 2 - bw / 2, sqB + sqH / 2);

    // Padding along the bottom edge
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(H.boardWidth + 0.04, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: COL.padding, roughness: 0.8 })
    );
    pad.position.set(0, H.boardBottom - 0.02, cz);
    pad.castShadow = true;
    g.add(pad);

    // Steel frame behind the glass
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.5, metalness: 0.6 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), steel);
    frame.position.set(0, cy, H.boardZ - H.boardThickness - 0.04);
    frame.castShadow = true;
    g.add(frame);

    g.name = 'backboard';
    return g;
  }

  function buildSupport() {
    const g = new THREE.Group();
    const padMat = new THREE.MeshStandardMaterial({ color: COL.padding, roughness: 0.75 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.45, metalness: 0.6 });

    const baseZ = -2.0;
    // Padded base unit sitting behind the baseline
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.5), padMat);
    base.position.set(0, 0.45, baseZ - 0.2);
    base.castShadow = true;
    base.receiveShadow = true;

    // Vertical pole with a padded wrap at the bottom
    const poleH = 3.75;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, poleH, 0.2), steel);
    pole.position.set(0, poleH / 2, baseZ + 0.45);
    pole.castShadow = true;
    const poleWrap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.8, 0.34), padMat);
    poleWrap.position.set(0, 0.9 + 0.9, baseZ + 0.45);
    poleWrap.castShadow = true;

    // Horizontal arm and diagonal brace out to the backboard frame
    const armStart = baseZ + 0.45;
    const armEnd = H.boardZ - H.boardThickness - 0.07;
    const armLen = armEnd - armStart;
    const armY = 3.55;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, armLen), steel);
    arm.position.set(0, armY, armStart + armLen / 2);
    arm.castShadow = true;

    const braceFrom = new THREE.Vector3(0, 2.4, armStart);
    const braceTo = new THREE.Vector3(0, armY, armEnd - 0.05);
    const braceLen = braceFrom.distanceTo(braceTo);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, braceLen), steel);
    brace.position.copy(braceFrom).add(braceTo).multiplyScalar(0.5);
    brace.lookAt(braceTo);
    brace.castShadow = true;

    g.add(base, pole, poleWrap, arm, brace);
    g.name = 'support';
    return g;
  }

  // Simple diamond-mesh net built from line segments. `sway` lets later steps
  // animate it (e.g. when the ball goes through).
  function buildNet() {
    const strands = 12;
    const rows = 6;
    const topR = H.rimRadius, botR = H.rimRadius * 0.58;
    const depth = 0.42;

    const rest = [];      // rest positions per row/strand
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const radius = topR + (botR - topR) * t;
      const y = -t * depth;
      const offset = (r % 2) * (Math.PI / strands);
      const ring = [];
      for (let s = 0; s < strands; s++) {
        const a = (s / strands) * Math.PI * 2 + offset;
        ring.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
      }
      rest.push(ring);
    }

    // Each node connects to the two nearest nodes in the next row -> diamond pattern.
    const pairs = [];
    for (let r = 0; r < rows; r++) {
      const odd = r % 2 === 1;
      for (let s = 0; s < strands; s++) {
        const a = [r, s];
        const b1 = [r + 1, s];
        const b2 = [r + 1, odd ? (s + 1) % strands : (s - 1 + strands) % strands];
        pairs.push([a, b1], [a, b2]);
      }
    }
    // bottom ring
    for (let s = 0; s < strands; s++) pairs.push([[rows, s], [rows, (s + 1) % strands]]);

    const positions = new Float32Array(pairs.length * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const lines = new THREE.LineSegments(geo, mat);
    lines.position.set(0, H.rimHeight - 0.01, H.centerZ);
    lines.frustumCulled = false;
    lines.name = 'net';

    const tmp = new THREE.Vector3();
    const net = {
      object: lines,
      sway: 0,        // 0..1 impulse, decays over time
      time: 0,
      // Ball went through: a cleaner make (swish) gives a stronger pull.
      pulse(strength) {
        this.sway = Math.max(this.sway, strength);
      },
      update(dt) {
        this.time += dt;
        this.sway *= Math.exp(-dt * 3);
        let i = 0;
        for (const [[ra, sa], [rb, sb]] of pairs) {
          deform(rest[ra][sa], ra, this, tmp); positions[i++] = tmp.x; positions[i++] = tmp.y; positions[i++] = tmp.z;
          deform(rest[rb][sb], rb, this, tmp); positions[i++] = tmp.x; positions[i++] = tmp.y; positions[i++] = tmp.z;
        }
        geo.attributes.position.needsUpdate = true;
      },
    };

    function deform(p, row, n, out) {
      const t = row / rows;
      const idle = Math.sin(n.time * 1.7 + p.x * 6) * 0.004 * t;
      const k = n.sway * t;
      const wobble = Math.sin(n.time * 14) * k;
      out.set(p.x * (1 - 0.25 * k) + idle + wobble * 0.03, p.y * (1 + 0.35 * k), p.z * (1 - 0.25 * k));
    }

    net.update(0);
    return net;
  }

  return { build };
})();
