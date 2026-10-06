// Court: hardwood floor and markings, painted onto a canvas texture so the
// lines stay crisp and cost nothing extra to render.
ISO.Court = (function () {
  const C = ISO.CONFIG.court;
  const H = ISO.CONFIG.hoop;
  const COL = ISO.CONFIG.colors;

  // World area covered by the floor texture (court + apron).
  const minX = -C.width / 2 - C.apron;
  const maxX = C.width / 2 + C.apron;
  const minZ = -C.apron - 1.2;               // extra room behind the baseline for the stanchion
  const maxZ = C.halfLength + C.apron;
  const worldW = maxX - minX;
  const worldD = maxZ - minZ;
  const PX_PER_M = 112;

  function build(renderer) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(worldW * PX_PER_M);
    canvas.height = Math.round(worldD * PX_PER_M);
    const ctx = canvas.getContext('2d');

    // Map world (x, z) to canvas pixels. The plane is laid flat with canvas top = minZ.
    const px = (x) => (x - minX) * PX_PER_M;
    const pz = (z) => (z - minZ) * PX_PER_M;
    const m = (v) => v * PX_PER_M;

    drawApron(ctx, canvas);
    drawWood(ctx, px(-C.width / 2), pz(0), m(C.width), m(C.halfLength));
    drawPaint(ctx, px, pz, m);
    drawLines(ctx, px, pz, m);
    drawLogos(ctx, px, pz, m);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.42,
      metalness: 0.0,
      clearcoat: 0.55,          // lacquered hardwood sheen
      clearcoatRoughness: 0.22,
    });
    const geo = new THREE.PlaneGeometry(worldW, worldD);
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    floor.receiveShadow = true;
    floor.name = 'court';
    return floor;
  }

  function drawApron(ctx, canvas) {
    ctx.fillStyle = COL.apron;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // subtle stained-wood planks on the apron too
    plankPass(ctx, 0, 0, canvas.width, canvas.height, [32, 49, 75], 10, 0.5);
  }

  function drawWood(ctx, x, y, w, h) {
    ctx.fillStyle = '#c98f55';
    ctx.fillRect(x, y, w, h);
    plankPass(ctx, x, y, w, h, [201, 143, 85], 22, 1);
  }

  // Planks run lengthwise (along z), with staggered butt joints and soft grain.
  function plankPass(ctx, x0, y0, w, h, base, variance, alpha) {
    const plankW = Math.max(6, Math.round(0.072 * PX_PER_M));
    let seed = 1337;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.globalAlpha = alpha;
    for (let x = x0; x < x0 + w; x += plankW) {
      let y = y0 - rand() * 3 * PX_PER_M;
      while (y < y0 + h) {
        const len = (1.8 + rand() * 2.6) * PX_PER_M;
        const v = (rand() - 0.5) * variance;
        const r = clamp(base[0] + v), g = clamp(base[1] + v * 0.8), b = clamp(base[2] + v * 0.6);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, plankW, len);
        // grain streaks
        ctx.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.04})`;
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(x + rand() * plankW, y, 1, len);
        }
        // butt joint
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x, y + len - 1, plankW, 1);
        y += len;
      }
      // seam between planks
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + plankW - 1, y0, 1, h);
    }
    ctx.restore();
  }

  function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

  function drawPaint(ctx, px, pz, m) {
    // Key
    ctx.fillStyle = COL.paint;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(px(-C.keyWidth / 2), pz(0), m(C.keyWidth), m(C.freeThrowDist));
    // Top half of the free-throw circle tinted lightly
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(px(0), pz(C.freeThrowDist), m(C.ftCircleRadius), 0, Math.PI);
    ctx.fill();
    // Center circle at half court
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(px(0), pz(C.halfLength), m(C.centerCircleRadius), Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawLines(ctx, px, pz, m) {
    const lw = m(C.lineWidth);
    const halfW = C.width / 2;
    ctx.strokeStyle = COL.lines;
    ctx.fillStyle = COL.lines;
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';

    // Boundary: baseline, sidelines, half-court line (drawn inside the court)
    ctx.strokeRect(px(-halfW) + lw / 2, pz(0) + lw / 2, m(C.width) - lw, m(C.halfLength) - lw);

    // Key outline
    ctx.strokeRect(px(-C.keyWidth / 2), pz(0), m(C.keyWidth), m(C.freeThrowDist));

    // Lane hash marks and blocks
    const marks = [2.13, 2.97, 3.88, 4.79];
    marks.forEach((z, i) => {
      const len = m(0.2);
      const thick = i === 0 ? m(0.3) : lw;
      ctx.fillRect(px(-C.keyWidth / 2) - len, pz(z), len, thick);
      ctx.fillRect(px(C.keyWidth / 2), pz(z), len, thick);
    });

    // Free-throw circle: solid outside the key, dashed inside
    ctx.beginPath();
    ctx.arc(px(0), pz(C.freeThrowDist), m(C.ftCircleRadius), 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([m(0.38), m(0.3)]);
    ctx.beginPath();
    ctx.arc(px(0), pz(C.freeThrowDist), m(C.ftCircleRadius), Math.PI, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Restricted area arc + short legs to the backboard
    ctx.beginPath();
    ctx.arc(px(0), pz(H.centerZ), m(C.restrictedRadius), 0, Math.PI);
    ctx.moveTo(px(-C.restrictedRadius), pz(H.centerZ));
    ctx.lineTo(px(-C.restrictedRadius), pz(H.boardZ));
    ctx.moveTo(px(C.restrictedRadius), pz(H.centerZ));
    ctx.lineTo(px(C.restrictedRadius), pz(H.boardZ));
    ctx.stroke();

    // Three-point line: straight corners joined to an arc around the rim
    const cornerZ = H.centerZ + Math.sqrt(C.threeRadius ** 2 - C.threeCornerX ** 2);
    const a = Math.atan2(cornerZ - H.centerZ, C.threeCornerX); // angle where arc meets corner
    ctx.beginPath();
    ctx.moveTo(px(-C.threeCornerX), pz(0));
    ctx.lineTo(px(-C.threeCornerX), pz(cornerZ));
    ctx.arc(px(0), pz(H.centerZ), m(C.threeRadius), Math.PI - a, a, true);
    ctx.lineTo(px(C.threeCornerX), pz(0));
    ctx.stroke();

    // Center circle at half court (only our half is visible)
    ctx.beginPath();
    ctx.arc(px(0), pz(C.halfLength), m(C.centerCircleRadius), Math.PI, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(0), pz(C.halfLength), m(0.6), Math.PI, 2 * Math.PI);
    ctx.stroke();

    // Rim projection dot under the basket
    ctx.beginPath();
    ctx.arc(px(0), pz(H.centerZ), m(0.06), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLogos(ctx, px, pz, m) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${m(0.62)}px "Arial Black", Arial, sans-serif`;

    // Wordmarks on the apron along each sideline
    const sideX = C.width / 2 + C.apron / 2;
    [-1, 1].forEach((s) => {
      ctx.save();
      ctx.translate(px(s * sideX), pz(C.halfLength * 0.45));
      ctx.rotate(s * Math.PI / 2);
      ctx.fillText('ISO  COURT', 0, 0);
      ctx.restore();
    });

    // Small accent stripe along the baseline apron
    ctx.fillStyle = ISO.CONFIG.colors.accent;
    ctx.fillRect(px(-C.width / 2), pz(-0.35), m(C.width), m(0.08));
    ctx.restore();
  }

  return { build };
})();
