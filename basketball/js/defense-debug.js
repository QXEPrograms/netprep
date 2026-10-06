// DefenseDebug (?debug only): draws what the defender is thinking.
//   yellow ring      desired guard spot
//   cyan ring        reaction target (where the AI believes the ball handler is,
//                    i.e. the delayed + extrapolated view)
//   white line       defender -> ball handler
//   orange line      ball handler -> basket
//   green arrow      defender's facing; red arrow: facing-assist target
//   grey circles     personal-space (contact) radius of both players
//   hand spheres     the actual hand colliders (grey = inactive, red = can block)
//   ball sphere      the ball's collision radius (white wire)
//   magenta dot      shot release position; yellow star: block contact point
//   text panel       state, facing error/lock, turn rate, reaction delay,
//                    last reaction, contest values, contact
(function () {
ISO.DefenseDebug = class {
  constructor(scene, defender, hud) {
    this.d = defender;
    this.group = new THREE.Group();
    this.group.name = 'defense-debug';
    scene.add(this.group);
    const ring = (r, color, w = 0.04) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 5;
      this.group.add(m);
      return m;
    };
    const line = (color) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      l.renderOrder = 6;
      this.group.add(l);
      return l;
    };
    const R = ISO.DEFENSE.contact.radius;
    this.spot = ring(0.22, 0xffd23f);
    this.target = ring(0.16, 0x3fe0ff);
    this.offCircle = ring(R, 0xbfc6d4, 0.02);
    this.defCircle = ring(R, 0xbfc6d4, 0.02);
    this.toBall = line(0xffffff);
    this.lane = line(0xff8a2a);
    this.facing = line(0x39e07a);
    this.facingTarget = line(0xff4a4a);
    const wire = (r, color) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9, depthTest: false }));
      m.renderOrder = 7;
      this.group.add(m);
      return m;
    };
    this.handSpheres = defender.blocks.hands.map((h) => wire(h.radius, 0x9aa3b2));
    this.ballSphere = wire(ISO.Basketball.RADIUS, 0xffffff);
    this.releaseMark = wire(0.05, 0xff3cf0);
    this.contactMark = wire(0.06, 0xffe23c);
    this.releaseMark.visible = false;
    this.contactMark.visible = false;

    this.panel = document.createElement('div');
    this.panel.className = 'defense-debug';
    Object.assign(this.panel.style, {
      position: 'absolute', left: '12px', top: '12px', padding: '8px 10px', borderRadius: '8px',
      background: 'rgba(8,12,22,0.78)', color: '#e8ecf4', font: '11px/1.45 Menlo, Consolas, monospace',
      whiteSpace: 'pre', pointerEvents: 'none', zIndex: 5,
    });
    hud.appendChild(this.panel);
  }

  update() {
    const d = this.d, L = d.locomotion, ai = d.ai, O = d.opponent.locomotion;
    const y = 0.03;
    this.spot.position.set(ai.guardSpot.x, y, ai.guardSpot.z);
    this.target.position.set(ai.reactionTarget.x, y + 0.002, ai.reactionTarget.z);
    this.offCircle.position.set(O.position.x, y, O.position.z);
    this.defCircle.position.set(L.position.x, y, L.position.z);
    const set = (l, a, b) => { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; l.geometry.computeBoundingSphere(); };
    const v = (x, yy, z) => new THREE.Vector3(x, yy, z);
    set(this.toBall, v(L.position.x, 0.06, L.position.z), v(O.position.x, 0.06, O.position.z));
    set(this.lane, v(O.position.x, 0.05, O.position.z), v(0, 0.05, ISO.CONFIG.hoop.centerZ));
    set(this.facing, v(L.position.x, 0.08, L.position.z), v(L.position.x + Math.sin(L.facing) * 1.1, 0.08, L.position.z + Math.cos(L.facing) * 1.1));
    const ta = L.defensiveFacingAngle;
    set(this.facingTarget, v(L.position.x, 0.1, L.position.z), v(L.position.x + Math.sin(ta) * 0.8, 0.1, L.position.z + Math.cos(ta) * 0.8));

    const B = d.blocks, ball = d.ball;
    B.hands.forEach((h, i) => {
      const m = this.handSpheres[i];
      m.position.copy(h.cur);
      m.material.color.setHex(h.active && B.active ? 0xff3c3c : h.active ? 0xff9a3c : 0x9aa3b2);
    });
    this.ballSphere.position.copy(ball.position);
    const sh = d.opponent.shooting, fi = d.opponent.finishing;
    if (sh.shotReleased || fi.shotReleased) {
      this.releaseMark.position.copy(sh.shotReleased ? sh.releasePosition || ball.position : fi.releasePosition);
      this.releaseMark.visible = true;
    }
    if (B.blockOccurred) { this.contactMark.position.copy(B.blockContactPoint); this.contactMark.visible = true; }
    const c = d.contest, rel = c.atRelease;
    const v3 = (a) => a ? a.map((x) => x.toFixed(1)).join(',') : '-';
    const lb = B.lastBlock;
    const deg = (r) => (r * 180 / Math.PI).toFixed(0).padStart(4) + '°';
    this.panel.textContent = [
      `DEFENSE  ${d.state.toUpperCase()}  (${L.mode}${L.isPlanting ? ', planting' : ''})`,
      `facing err ${deg(L.defensiveFacingError)}  locked ${L.isDefensiveLocked ? 'yes' : 'no '}  turn ${L.defensiveTurnRate.toFixed(1).padStart(5)} rad/s`,
      `speed ${L.speed.toFixed(1)}  slide ${L.lateralSpeed.toFixed(1).padStart(5)}  fwd ${L.forwardSpeed.toFixed(1).padStart(5)}`,
      `reaction delay ${(ai.reactionDelay * 1000).toFixed(0)} ms   bites ${ai.biteCount}  beaten ${ai.beatenCount}`,
      `last: ${ai.lastReaction || '-'}`,
      `contest ${c.contestStrength.toFixed(2)}  dist ${c.contestDistance.toFixed(2)}  angle ${deg(c.contestAngle)}  hand ${c.contestHandHeight.toFixed(2)}m`,
      `at release: ${rel ? `${rel.shotType} ${rel.strength}  (${rel.distance}m${rel.jumped ? ', jumped' : ''})` : '-'}`,
      `contact ${d.contact.touching ? 'YES' : 'no '}  overlap ${(d.contact.overlap * 100).toFixed(0)} cm`,
      `jump ${L.jumpState.padEnd(6)} height ${L.jumpHeight.toFixed(2)} m  vy ${L.verticalVelocity.toFixed(2).padStart(5)} m/s  arm ${d.handRaise.toFixed(2)}`,
      `hand-ball ${isFinite(B.handBallDistance) ? B.handBallDistance.toFixed(2) : '-'} m  block collision ${B.active ? 'ACTIVE' : 'off'}  blocks ${B.blocksCount}`,
      `last block: ${lb ? `${lb.blockType} (${lb.blockHand}) @${lb.blockContactTime}s  gap ${lb.blockHandBallGap ?? lb.handBallGap}` : '-'}`,
      `  ball v before ${lb ? v3(lb.velocityBefore) : '-'}  after ${lb ? v3(lb.blockDeflectionVelocity) : '-'}`,
    ].join('\n');
  }
};
})();
