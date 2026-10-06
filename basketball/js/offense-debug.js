// OffenseDebug (?debug only): the ball handler's movement, drawn at the feet.
//   white   input direction        green   velocity       yellow  acceleration
//   blue    hip facing             cyan    chest facing   magenta lean (x3)
//   orange  line to the orientation target (rim / matchup blend)
// Text panel: locomotion level and blend, plant state, lean values, facing vs
// travel, dribble hand, matchup state.
(function () {
ISO.OffenseDebug = class {
  constructor(scene, player, hud) {
    this.p = player;
    this.group = new THREE.Group();
    this.group.name = 'offense-debug';
    scene.add(this.group);
    const line = (color) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      l.renderOrder = 8;
      this.group.add(l);
      return l;
    };
    this.lines = {
      input: line(0xffffff), vel: line(0x3ce07a), acc: line(0xffe23c), hips: line(0x3c7bff),
      chest: line(0x3fe0ff), lean: line(0xff3cf0), target: line(0xff9a3c),
    };
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'absolute', left: '12px', bottom: '84px', padding: '8px 10px', borderRadius: '8px',
      background: 'rgba(8,12,22,0.78)', color: '#e8ecf4', font: '11px/1.45 Menlo, Consolas, monospace',
      whiteSpace: 'pre', pointerEvents: 'none', zIndex: 5,
    });
    hud.appendChild(this.panel);
  }

  update() {
    const P = this.p, L = P.locomotion, O = L.orientation, B = P.bodyPose;
    if (!O) return;
    const o = L.position, y = 0.07;
    const set = (l, dx, dz, h = y) => { const a = l.geometry.attributes.position; a.setXYZ(0, o.x, h, o.z); a.setXYZ(1, o.x + dx, h, o.z + dz); a.needsUpdate = true; l.geometry.computeBoundingSphere(); };
    const yaw = (a, len) => [Math.sin(a) * len, Math.cos(a) * len];
    set(this.lines.input, L.inputDir.x * 1.2, L.inputDir.z * 1.2, 0.05);
    set(this.lines.vel, L.velocity.x * 0.3, L.velocity.z * 0.3, 0.06);
    set(this.lines.acc, L.acceleration.x * 0.05, L.acceleration.z * 0.05, 0.08);
    set(this.lines.hips, ...yaw(L.facing, 0.9), 0.09);
    set(this.lines.chest, ...yaw(O.chestYaw, 0.7), 0.11);
    set(this.lines.lean, B.lean.x * 3, B.lean.y * 3, 0.13);
    set(this.lines.target, O.engagePoint.x - o.x, O.engagePoint.z - o.z, 0.04);
    const deg = (r) => (r * 57.3).toFixed(0).padStart(4) + '°';
    const travel = L.speed > 0.3 ? Math.atan2(L.velocity.x, L.velocity.z) : L.facing;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    this.panel.textContent = [
      `OFFENSE  ${L.level.toUpperCase()}  commitment ${L.attack.toFixed(2)}  (size-up ${Math.max(0, 1 - L.attack * 2).toFixed(2)} / drive ${Math.min(1, L.attack * 2).toFixed(2)} / sprint ${Math.max(0, L.attack * 2 - 1).toFixed(2)})`,
      `speed ${L.speed.toFixed(2)}  accel ${Math.hypot(L.acceleration.x, L.acceleration.z).toFixed(1)}  plant ${L.plantState}${L.plantState !== 'none' ? (L.plantSide > 0 ? ' (R foot)' : ' (L foot)') : ''}  plants ${L.plantCount}`,
      `hips vs travel ${deg(wrap(L.facing - travel))}  hips open ${O.open.toFixed(2)}  chest twist ${deg(O.twist)}  head ${deg(O.headYaw)}`,
      `lean now ${B.currentBodyLean.toFixed(2)} target ${B.targetBodyLean.toFixed(2)}  lateral ${B.lateralLean.toFixed(2).padStart(5)}  forward ${B.forwardLean.toFixed(2).padStart(5)}`,
      `  from velocity ${B.movementLean.toFixed(2)}  from accel ${B.accelerationLean.toFixed(2)}  plant ${B.plantLean.toFixed(2)}`,
      `dribble hand ${P.dribble ? P.dribble.hand : '-'}  move ${P.dribble && P.dribble.currentMove || '-'}`,
      `matchup ${O.matchupState}  beaten ${O.beaten ? 'YES' : 'no'}  depth ${O.matchupDepth.toFixed(2)}  lateral ${O.matchupLateral.toFixed(2)}`,
    ].join('\n');
  }
};
})();
