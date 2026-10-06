// Arena: surrounding floor, tiered stands with an instanced crowd, LED boards.
// Everything here is decorative and kept cheap (a few draw calls via instancing).
ISO.Arena = (function () {
  const C = ISO.CONFIG.court;

  const courtMinX = -C.width / 2 - C.apron;
  const courtMaxX = C.width / 2 + C.apron;
  const courtMinZ = -C.apron - 1.2;
  const courtMaxZ = C.halfLength + C.apron;

  function build() {
    const group = new THREE.Group();
    group.name = 'arena';

    // Dark concourse floor beyond the apron
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x10141d, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.005, 6);
    ground.receiveShadow = true;
    group.add(ground);

    const crowd = new CrowdBuilder();

    // Sideline stands (left and right) and baseline stands
    const sideStart = courtMinZ - 1.6, sideEnd = courtMaxZ + 2;
    addStands(group, crowd, { axis: 'x', sign: -1, edge: courtMinX - 1.1, from: sideStart, to: sideEnd });
    addStands(group, crowd, { axis: 'x', sign: 1, edge: courtMaxX + 1.1, from: sideStart, to: sideEnd });
    addStands(group, crowd, { axis: 'z', sign: -1, edge: courtMinZ - 1.6, from: courtMinX - 1.1, to: courtMaxX + 1.1 });

    group.add(crowd.finish());

    // LED advertising-style boards (original artwork) along the court edges
    const ledTex = makeLedTexture();
    const boardH = 0.85;
    const addBoard = (w, x, z, rotY) => {
      const tex = ledTex.clone();
      tex.repeat.set(w / (boardH * 16), 1); // keep the 16:1 artwork undistorted
      const mat = new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.6,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, boardH, 0.12), mat);
      b.position.set(x, boardH / 2, z);
      b.rotation.y = rotY;
      group.add(b);
    };
    const sideLen = sideEnd - sideStart;
    addBoard(sideLen, courtMinX - 0.5, (sideStart + sideEnd) / 2, Math.PI / 2);
    addBoard(sideLen, courtMaxX + 0.5, (sideStart + sideEnd) / 2, -Math.PI / 2);
    addBoard(courtMaxX - courtMinX + 1, 0, courtMinZ - 0.6, 0);

    // Back walls rising behind the stands so the scene never looks open-ended
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x151b28, roughness: 0.9 });
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 14, 50), wallMat);
    wallL.position.set(courtMinX - 9.5, 7, 6);
    const wallR = wallL.clone();
    wallR.position.x = courtMaxX + 9.5;
    const wallB = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 0.5), wallMat);
    wallB.position.set(0, 7, courtMinZ - 10);
    group.add(wallL, wallR, wallB);

    return group;
  }

  // Tiered seating along one edge. `axis` is the axis the stands face across.
  function addStands(group, crowd, { axis, sign, edge, from, to }) {
    const tiers = 9, rise = 0.42, depth = 0.85;
    const length = to - from;
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.85 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 0.7 });

    for (let i = 0; i < tiers; i++) {
      const h = rise * (i + 1);
      const out = edge + sign * (i + 0.5) * depth; // center of this tier along the facing axis
      const step = new THREE.Mesh(
        axis === 'x' ? new THREE.BoxGeometry(depth, h, length) : new THREE.BoxGeometry(length, h, depth),
        i % 2 ? stepMat : trimMat
      );
      if (axis === 'x') step.position.set(out, h / 2, (from + to) / 2);
      else step.position.set((from + to) / 2, h / 2, out);
      step.receiveShadow = true;
      group.add(step);

      // seat a row of spectators on this tier
      for (let s = from + 0.4; s < to - 0.3; s += 0.62) {
        if (Math.random() < 0.14) continue; // empty seats
        const jitter = (Math.random() - 0.5) * 0.08;
        if (axis === 'x') crowd.add(out + sign * 0.12, h, s + jitter, sign > 0 ? -Math.PI / 2 : Math.PI / 2);
        else crowd.add(s + jitter, h, out + sign * 0.12, 0);
      }
    }
  }

  // Collects spectator transforms and emits two instanced meshes (bodies + heads).
  function CrowdBuilder() {
    const bodies = [];
    const palette = [0x1d3a5f, 0xff7a1a, 0xf2f4f7, 0x2f6fb1, 0x3b3f4a, 0xd94a2b, 0x5e7a99, 0x222831];
    const skins = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x5c3a21, 0xffdbac];

    this.add = (x, y, z, rot) => bodies.push({ x, y, z, rot });

    this.finish = () => {
      const g = new THREE.Group();
      const n = bodies.length;
      const bodyMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.42, 0.55, 0.3),
        new THREE.MeshStandardMaterial({ roughness: 0.9 }),
        n
      );
      const headMesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ roughness: 0.8 }),
        n
      );
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const s = new THREE.Vector3(1, 1, 1);
      const p = new THREE.Vector3();
      const c = new THREE.Color();
      bodies.forEach((b, i) => {
        const scale = 0.9 + Math.random() * 0.2;
        s.set(scale, scale, scale);
        q.setFromAxisAngle(up, b.rot + (Math.random() - 0.5) * 0.4);
        p.set(b.x, b.y + 0.28 * scale, b.z);
        m.compose(p, q, s);
        bodyMesh.setMatrixAt(i, m);
        bodyMesh.setColorAt(i, c.setHex(palette[(Math.random() * palette.length) | 0]));
        p.y = b.y + 0.68 * scale;
        m.compose(p, q, s);
        headMesh.setMatrixAt(i, m);
        headMesh.setColorAt(i, c.setHex(skins[(Math.random() * skins.length) | 0]));
      });
      g.add(bodyMesh, headMesh);
      g.name = 'crowd';
      return g;
    };
  }

  function makeLedTexture() {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 64;
    const ctx = cv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, cv.width, 0);
    grad.addColorStop(0, '#0d1b2e');
    grad.addColorStop(0.5, '#173257');
    grad.addColorStop(1, '#0d1b2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '800 38px "Arial Black", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const items = [['ISO COURT', '#ffffff'], ['●', '#ff7a1a'], ['FIRST TO 11', '#ff9a4a'], ['●', '#ff7a1a']];
    let x = 20;
    for (let k = 0; k < 2; k++) {
      for (const [text, color] of items) {
        ctx.fillStyle = color;
        ctx.fillText(text, x, 34);
        x += ctx.measureText(text).width + 28;
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  return { build };
})();
