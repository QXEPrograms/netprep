// Rig debug (?rigdebug, development only): the Player Model V2 skeleton drawn
// over the players, plus the gameplay points the rig has to agree with —
// gameplay root, body contact circle, palm centres (visual hands), hand
// colliders, shoe contact points — and a text panel per player.
//
// ?stress=6 (development only): adds visual-only V2 players (no gameplay) and
// measures model update + render time, for the future 3v3 budget.
//
// The panel also keeps a short transition log (Step 16.5): pose-source
// changes per player, and how many one-frame jumps the continuity layers
// (velocity / pose / arm inertialization) absorbed.
(function () {
const Q = window.location.search;

ISO.RigDebug = class {
  constructor(game) {
    this.game = game;
    this.items = [];
    const S = game.scene;
    const mat = (c, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: c, depthTest: false, transparent: true, opacity: 0.85 }, o));
    for (const p of game.roster.players) {
      const M = p.model;
      const skel = new THREE.SkeletonHelper(M.rig.root);
      skel.material.depthTest = false; skel.material.transparent = true;
      S.add(skel);
      const dot = (r, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(c)); m.renderOrder = 999; S.add(m); return m; };
      const ring = new THREE.Mesh(new THREE.RingGeometry(ISO.DEFENSE.contact.radius - 0.01, ISO.DEFENSE.contact.radius, 40), mat(0x33ddff, { side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 999; S.add(ring);
      this.items.push({
        p, skel, ring,
        root: dot(0.03, 0xffffff),
        palms: [dot(0.02, 0xffe14d), dot(0.02, 0xffe14d)],
        colliders: [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(ISO.DEFENSE.hands.radius, 12, 8), mat(0xff4040, { wireframe: true })); m.renderOrder = 999; S.add(m); return m; }),
        soles: [0, 1, 2, 3].map(() => dot(0.015, 0x40ff70)),
      });
    }
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, { position: 'absolute', left: '12px', bottom: '96px', padding: '8px 10px', borderRadius: '8px',
      background: 'rgba(8,12,22,0.78)', color: '#e8ecf4', font: '11px/1.45 Menlo, Consolas, monospace', whiteSpace: 'pre', pointerEvents: 'none', zIndex: 5 });
    document.getElementById('hud').appendChild(this.panel);
    this._v = new THREE.Vector3();
    this.log = [];
    this.t0 = performance.now();
  }

  update() {
    const g = this.game, ball = g.ball.position, lines = ['RIG DEBUG  (white: gameplay root  cyan: body circle  yellow: palm  red: hand collider  green: sole)'];
    for (const it of this.items) {
      const p = it.p, M = p.model, A = p.active;
      M.root.updateMatrixWorld(true);
      it.root.position.copy(A.position).setY(0.02);
      it.ring.position.copy(A.position).setY(0.01);
      const d = [];
      for (const s of [1, -1]) {
        const i = s > 0 ? 0 : 1, pw = M.getHandWorld(s, it.palms[i].position);
        d.push(pw.distanceTo(ball) - g.ball.radius);
        const hc = p.role === 'defense' && p.defense.blocks ? p.defense.blocks.hands[i] : null;
        it.colliders[i].visible = !!hc;
        if (hc) { it.colliders[i].position.copy(hc.cur); it.colliders[i].material.color.setHex(hc.active ? 0xff4040 : 0x804040); }
      }
      let k = 0;
      for (const l of M.legs) for (const sp of [[0, -0.0675, -0.085], [0, -0.06, 0.2]]) it.soles[k++].position.copy(l.ankle.localToWorld(this._v.set(...sp)));
      if (it.src !== undefined && it.src !== M._xfSource) {
        this.log.push(`${((performance.now() - this.t0) / 1000).toFixed(2)}s ${p.id} ${it.src} -> ${M._xfSource}`);
        if (this.log.length > 8) this.log.shift();
      }
      it.src = M._xfSource;
      const rx = M._rx && p.role === 'defense' && p.defense.locomotion.reaction ? `reaction L${M._rx.level} u ${M._rx.u.toFixed(2)}` : 'reaction -';
      lines.push(`${p.id} ${p.role.padEnd(7)} pose ${String(M._xfSource).padEnd(8)} air ${M._airY.toFixed(2)}  palm->ball R ${d[0].toFixed(2)} L ${d[1].toFixed(2)} m  reach ${M._reachW.toFixed(2)}  ${rx}`);
      lines.push(`   absorbed jumps: root ${M._rootInertia.jumps} yaw ${M._yawInertia.jumps} pose ${M._poseInertia.jumps} arms ${M._armInertia.jumps}${M._exact ? '  EXACT (hands are colliders)' : ''}`);
    }
    if (this.log.length) lines.push('transitions:', ...this.log.map((x) => '  ' + x));
    this.panel.textContent = lines.join('\n');
  }
};

// Six-player visual stress test: extra V2 bodies running the same pose code.
ISO.RigStress = class {
  constructor(game, count) {
    this.game = game;
    this.extra = [];
    const looks = Object.values(ISO.PLAYER_LOOKS);
    const styles = ['fade', 'afro', 'buzz', 'twists'];
    for (let i = game.roster.players.length; i < count; i++) {
      const base = looks[i % looks.length];
      const look = JSON.parse(JSON.stringify(base));
      look.jerseyNumber = String(10 + i);
      look.appearance.hair.style = styles[i % styles.length];
      const m = new ISO.PlayerModel(look);
      game.scene.add(m.root);
      this.extra.push({ m, a: (i / count) * Math.PI * 2, vel: new THREE.Vector3(), pos: new THREE.Vector3() });
    }
    this.t = 0;
    this.stats = { frames: 0, modelMs: 0 };
  }

  update(dt) {
    this.t += dt;
    const t0 = performance.now();
    for (const e of this.extra) {
      e.a += dt * 0.6;
      const r = 4.5, x = Math.sin(e.a) * r, z = 6 + Math.cos(e.a) * r * 0.6;
      e.vel.set(x - e.pos.x, 0, z - e.pos.z).divideScalar(Math.max(dt, 1e-3));
      e.pos.set(x, 0, z);
      const facing = Math.atan2(e.vel.x, e.vel.z);
      e.m.update(dt, { position: e.pos, facing, velocity: e.vel, speed: e.vel.length(), runSpeed: 5, sprintSpeed: 7.2, sprinting: false, turnSpeed: 0.6 },
        { defense: { lateral: 0, forward: e.vel.length(), run: true, jumpY: 0, contest: 0, planting: false } });
    }
    this.stats.modelMs += performance.now() - t0;
    this.stats.frames++;
  }
};

ISO.RigDebug.enabled = /[?&]rigdebug\b/.test(Q);
ISO.RigStress.count = (Q.match(/[?&]stress=(\d+)/) || [])[1] | 0;
})();
