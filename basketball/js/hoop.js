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

  function buildNet() {
    return new ISO.Net();
  }

  return { build };
})();
