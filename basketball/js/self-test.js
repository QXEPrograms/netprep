// Self-test (?selftest): permanent regression checks for the 1v1 loop, run
// in the real game through the real input path (keyboard state, possession,
// roles, camera). Results go to an on-screen panel and window.__SELFTEST;
// tests/run-selftest.js runs it headless.
//
// Covers: WASD + diagonals mean the same SCREEN direction on offense and on
// defense (at several spots, facings and defensive states, across repeated
// possession changes), make-it-take-it / miss / blocked miss possession,
// 1s and 2s scoring, first to 11 and the new game, role swaps (locomotion,
// ball owner, input routing, HUD, state cleanup), and the defensive
// interactions: reach / steal, ankle breaks and recovery, the rim's phase.
(function () {
if (!/[?&]selftest\b/.test(window.location.search)) return;

ISO.SelfTest = class {
  constructor(game) {
    this.g = game;
    this.results = [];
    this.frame = 0;
  }

  // ---- plumbing ----------------------------------------------------------------
  step(n = 1) { for (let i = 0; i < n; i++) { this.g.step(1 / 60); this.frame++; } }
  until(cond, max = 1200) { for (let i = 0; i < max; i++) { if (cond()) return true; this.step(); } return cond(); }
  live() { return this.until(() => this.g.possession.state === 'LIVE', 600); }
  check(name, ok, info = '') { this.results.push({ name, ok: !!ok, info }); return ok; }
  get P() { return this.g.possession; }
  get me() { return this.g.localPlayer; }
  keyDown(code) { const I = this.g.input; if (!I.keys.has(code)) I.presses.add(code); I.keys.add(code); }
  keyUp(code) { const I = this.g.input; I.keys.delete(code); I.upTime[code] = performance.now(); }
  releaseAll() { const I = this.g.input; I.keys.clear(); I.presses.clear(); }
  bot(on) {
    for (const p of this.g.roster.players) if (p.controlSource === ISO.CONTROL.CPU) {
      if (!on && p.bot) { p._stBot = p.bot; p.bot = null; }
      if (on && p._stBot) { p.bot = p._stBot; p._stBot = null; }
    }
  }
  // put the local player's current body (and the matchup) at a spot
  place(x, z, gap = 1.4, side = 0) {
    const g = this.g, H = ISO.CONFIG.hoop, h = g.handler, d = g.defenderEntity;
    const hp = new THREE.Vector3(x, 0, z);
    if (h === this.me || !d) {
      h.offense.locomotion.resetMotion(hp, Math.atan2(-x, H.centerZ - z));
      h.offense._updateBallHandling(0);
      if (d) { const u = new THREE.Vector3(-x, 0, H.centerZ - z).normalize(); d.defense.reset(hp.clone().addScaledVector(u, gap).add(new THREE.Vector3(-u.z * side, 0, u.x * side))); }
    } else {
      // I am the defender at (x, z); the ball handler stands `gap` away from me, away from the rim
      const dp = hp, u = new THREE.Vector3(x, 0, z - H.centerZ).normalize();
      const op = dp.clone().addScaledVector(u, gap).add(new THREE.Vector3(-u.z * side, 0, u.x * side));
      h.offense.locomotion.resetMotion(op, Math.atan2(-op.x, H.centerZ - op.z));
      h.offense._updateBallHandling(0);
      d.defense.reset(dp);
    }
    this.step(4);
  }

  // The ball handler at (x, z), their defender `gap` toward the rim (shots).
  placeHandler(x, z, gap) {
    const g = this.g, H = ISO.CONFIG.hoop, h = g.handler, d = g.defenderEntity;
    const hp = new THREE.Vector3(x, 0, z);
    h.offense.locomotion.resetMotion(hp, Math.atan2(-x, H.centerZ - z));
    h.offense._updateBallHandling(0);
    if (d) { const u = new THREE.Vector3(-x, 0, H.centerZ - z).normalize(); d.defense.reset(hp.clone().addScaledVector(u, gap)); }
    this.step(4);
  }

  // Hold keys for `frames` and measure where the body went ON SCREEN (both
  // points through the same, current camera — an independent check of the
  // camera-relative convention).
  screenMove(codes, frames = 20, opts = {}) {
    const g = this.g, A = this.me.active, cam = g.cameraController.camera;
    const p0 = A.position.clone();
    if (opts.sprint) this.keyDown('ShiftLeft');
    if (opts.handsUp) this.keyDown('KeyF');
    codes.forEach((c) => this.keyDown(c));
    this.step(frames);
    codes.forEach((c) => this.keyUp(c));
    if (opts.sprint) this.keyUp('ShiftLeft');
    if (opts.handsUp) this.keyUp('KeyF');
    const p1 = A.position.clone();
    const a = p0.project(cam), b = p1.project(cam);
    return { sx: b.x - a.x, sy: b.y - a.y, dist: A.position.distanceTo(p0) };
  }

  // Each key combo must move the body in that screen direction (within 40°).
  directions(tag, opts = {}) {
    const combos = { W: [0, 1], A: [-1, 0], S: [0, -1], D: [1, 0], WA: [-1, 1], WD: [1, 1], SA: [-1, -1], SD: [1, -1] };
    const codes = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD' };
    let worst = 0, bad = [];
    for (const [k, [ex, ey]] of Object.entries(combos)) {
      if (opts.reset) opts.reset();
      const m = this.screenMove(k.split('').map((c) => codes[c]), opts.frames || 18, opts);
      const ang = Math.abs(Math.atan2(ex * m.sy - ey * m.sx, ex * m.sx + ey * m.sy)) * 57.3;
      worst = Math.max(worst, ang);
      if (ang > 40 || m.dist < 0.15) bad.push(`${k}:${ang.toFixed(0)}°/${m.dist.toFixed(2)}m`);
      this.step(12);
    }
    this.check(`directions ${tag}`, bad.length === 0, bad.length ? 'off: ' + bad.join(' ') : `worst ${worst.toFixed(0)}°`);
  }

  // Everything that must be true right after a possession (re)start.
  roles(tag) {
    const g = this.g, P = this.P, R = g.roster, err = [];
    const h = g.handler, d = g.defenderEntity, me = this.me;
    for (const p of R.players) {
      const want = p.teamId === P.offenseTeamId ? 'offense' : 'defense';
      if (p.role !== want) err.push(`${p.id} role ${p.role}`);
    }
    if (g.ball.ownerPlayerId !== h.id || g.ball.holder !== h.offense) err.push('ball owner');
    if (!(h.offense.locomotion instanceof ISO.OffensiveLocomotion) || h.active !== h.offense) err.push('offense controller');
    if (d && (!(d.defense.locomotion instanceof ISO.DefensiveLocomotion) || d.active !== d.defense)) err.push('defense controller');
    if (d && (d.assignmentId !== h.id || d.defense.opponent !== h.offense || h.offense.locomotion.matchup !== d.defense)) err.push('matchup');
    const role = me.teamId === P.offenseTeamId ? 'offense' : 'defense';
    if (g.humanRole !== role) err.push('humanRole');
    if (g.ui.controlsRole !== role) err.push(`HUD ${g.ui.controlsRole}`);
    if (role === 'offense' && me.offense.input.source !== g.input) err.push('keyboard not on my offense');
    if (role === 'defense' && me.defense.control !== 'human') err.push('my defense not human-controlled');
    if (me.id !== 'P1') err.push('local identity changed');
    // nothing left over from the previous role / possession
    for (const p of R.players) {
      const o = p.offense, s = o.shooting, f = o.finishing;
      if (s.busy || s.shotReleased || f.busy || o.passing.isPassing || o.stepBack.isSteppingBack || o.dribble.currentMove) err.push(`${p.id} offense state`);
      if (o.offense.offensiveFatigue > 0.001) err.push(`${p.id} fatigue`);
      if (p.defense) {
        const L = p.defense.locomotion;
        if (L.jumpState !== 'ground' || L.jumpHeight > 0 || p.defense.handRaise > 0 || p.defense.blocks.active) err.push(`${p.id} defense state`);
      }
    }
    if (g.ball.mode !== 'controlled' || g.ball.blockedBy || g.scoring.pending) err.push('ball/shot state');
    // the camera keeps looking toward the basket whoever has the ball (no flip)
    const cam = g.cameraController.camera, f = cam.getWorldDirection(new THREE.Vector3());
    const toRim = new THREE.Vector3(0, 0, ISO.CONFIG.hoop.centerZ).sub(cam.position).setY(0).normalize();
    if (f.setY(0).normalize().dot(toRim) < 0.8) err.push('camera not facing the basket');
    return this.check(`roles ${tag}`, err.length === 0, err.join(', ') || `${P.offenseTeamId} ball, you ${role}`);
  }

  // Take a shot with the current ball handler (offset from the green release),
  // retrying seeds until the wanted result (all physical). Returns the result.
  shoot(want, { x = 0, z = 6.6, offset = 0, jumpAt = null } = {}) {
    const g = this.g, P = this.P;
    for (let seed = 1; seed < 80; seed++) {
      const team = P.offenseTeamId;
      this.live();
      const h = g.handler, d = g.defenderEntity;
      this.placeHandler(x, z, jumpAt !== null ? 0.75 : 5.5);
      if (d && jumpAt === null) d.defense.reset(new THREE.Vector3(6.5, 0, 12.5));
      h.offense.shooting.setSeed(seed * 7919);
      const ctl = d ? d.defense.control : null;
      if (d && jumpAt !== null) d.defense.setControl('human');
      const before = P.lastShotId, sh = h.offense.shooting, inp = h.input.source;
      const press = () => { if (inp === g.input) this.keyDown('Space'); else inp.press('shoot'); };
      const release = () => { if (inp === g.input) this.keyUp('Space'); else inp.release('shoot'); };
      press();
      let i = 0;
      this.until(() => {
        if (jumpAt !== null && i === jumpAt + (seed % 12) * 2) d.defense.humanInput.jump = true;
        i++;
        if (sh.isShooting && sh.shotTime >= sh.settings.idealRelease + offset) release();
        return P.state === 'SHOT_RESOLVING' || P.state === 'POSSESSION_TRANSITION';
      }, 600);
      release();
      if (d && ctl) d.defense.setControl(ctl);
      const r = g.scoring.lastResult;
      if (r && r.shotId !== before && want(r)) return { r, team };
      // not the result we need: give the same team the ball again and retry
      this.until(() => P.state === 'POSSESSION_START', 600);
      P.devReset(team);
    }
    return { r: null };
  }

  // After a result: the next possession starts; check who has it.
  afterResult(tag, r, team, expectTeam, expectReason) {
    this.until(() => this.P.state === 'POSSESSION_START', 600);
    const P = this.P;
    this.check(`${tag}: ${r ? r.result : 'none'} -> ${expectTeam}`, r && P.offenseTeamId === expectTeam && P.possessionStartReason === expectReason,
      `${team} shot ${r ? r.result : '-'}; next ${P.offenseTeamId} (${P.possessionStartReason})`);
    this.roles(tag);
    this.live();
  }

  // Step 15B: reach / steal, balance + ankle breaks, the protected rim phase.
  // I defend team B's ball handler, who is driven through their own virtual
  // input (same path the CPU uses).
  interactions() {
    const g = this.g, P = this.P, R = g.roster, V3 = (x, z) => new THREE.Vector3(x, 0, z);
    const setup = () => {
      P.devReset('B'); this.live();
      const h = g.handler, me = this.me;
      h.offense.locomotion.resetMotion(V3(0, 9.5), Math.PI); h.offense._updateBallHandling(0);
      me.defense.reset(V3(0, 8.2)); this.step(3);
      h.virtual.axes = { x: 0, y: 0 }; h.virtual.sprint = false;
      return { h, V: h.virtual, d: me.defense };
    };
    const toAxes = (x, z) => ISO.ScreenInput.fromWorld(x, z, g.cameraController.camera);
    const evs = []; g.events.on('ankleBreak', (e) => evs.push(e)); g.events.on('steal', (e) => evs.push(e));
    const callout = () => g.ui.callout.classList.contains('is-shown');
    // HUD: the steal action is listed on defense with its real key
    let { h, V, d } = setup();
    const key = ISO.Input.keyLabel(g.input.bindings.steal[0]);
    this.check('defense HUD lists Steal with its bound key', g.ui.controlsRole === 'defense' && /steal/i.test(g.ui.controls.textContent) && g.ui.controls.textContent.includes(key), `key ${key}`);
    // a press starts a visible reach that recovers on its own
    this.keyDown('KeyE'); this.step(1); this.keyUp('KeyE');
    const started = !!d.reach;
    let peak = 0; for (let i = 0; i < 40 && d.reach; i++) { this.step(); peak = Math.max(peak, d.reachExtent); }
    this.check('steal key: visible reach, then recovery', started && peak > 0.6 && !d.reach, `extent ${peak.toFixed(2)}, ${d.reach ? d.reach.phase : 'recovered'}`);
    // spamming the key does not chain reaches
    ({ h, V, d } = setup());
    const n0 = d.reachCount;
    for (let i = 0; i < 60; i++) { if (i % 2 === 0) this.keyDown('KeyE'); else this.keyUp('KeyE'); this.step(); }
    this.keyUp('KeyE');
    this.check('steal spam: at most 2 reaches in 1 s', d.reachCount - n0 <= 2 && d.reachCount - n0 >= 1, `${d.reachCount - n0} reaches`);
    // no stealing through the ball handler's body: reach from directly behind them
    ({ h, V, d } = setup());
    evs.length = 0;
    d.reset(V3(0, 10.25)); this.step(3);
    for (let i = 0; i < 40; i++) { if (i === 0) this.keyDown('KeyE'); if (i === 1) this.keyUp('KeyE'); this.step(); }
    this.check('no steal through the torso', !evs.some((e) => e.type === 'steal') && P.offenseTeamId === 'B' && g.ball.holder === h.offense, d.lastReachResult);
    // balanced defender + crossover: no ankle break
    ({ h, V, d } = setup());
    evs.length = 0; g.ui.callout.classList.remove('is-shown');
    for (let f = 0; f < 90; f++) {
      if (f < 30) V.axes = toAxes(1, 0); if (f === 30) V.press('crossover'); if (f >= 36) { V.axes = toAxes(-1, -0.6); V.sprint = true; }
      this.step();
    }
    V.axes = { x: 0, y: 0 }; V.sprint = false;
    this.check('balanced defender + crossover: no ankle break', !evs.some((e) => e.type === 'ankleBreak') && !callout(), g.ankleBreaks.last ? `sev ${g.ankleBreaks.last.severity}` : 'no eval');
    // sprinting the wrong way + crossover: stagger, ANKLE BREAKER, offense keeps the ball, defender gets up by itself
    ({ h, V, d } = setup());
    evs.length = 0; g.ui.callout.classList.remove('is-shown');
    let shown = false, lvl = 0, hs = 0;
    for (let f = 0; f < 90; f++) {
      if (f < 30) V.axes = toAxes(1, 0); if (f === 30) V.press('crossover'); if (f >= 36) { V.axes = toAxes(-1, -0.6); V.sprint = true; }
      if (f === 0) { this.keyDown('KeyD'); this.keyDown('ShiftLeft'); } if (f === 44) { this.keyUp('KeyD'); this.keyUp('ShiftLeft'); }
      this.step();
      if (d.locomotion.reaction) { lvl = Math.max(lvl, d.locomotion.reaction.level); hs = Math.max(hs, h.offense.locomotion.speed); }
      shown = shown || callout();
    }
    V.axes = { x: 0, y: 0 }; V.sprint = false;
    const ab = evs.find((e) => e.type === 'ankleBreak');
    this.check('wrong-way commit + crossover: ANKLE BREAKER', ab && ab.reactionLevel >= 2 && lvl >= 2 && shown, ab ? `L${ab.reactionLevel} sev ${ab.severity}` : 'none');
    this.check('offense keeps control through the ankle break', g.ball.holder === h.offense && P.offenseTeamId === 'B' && hs > 3, `speed ${hs.toFixed(1)}`);
    this.until(() => !d.locomotion.reaction, 120); this.step(10);
    this.check('defender recovers automatically', !d.locomotion.reaction && d.locomotion.mode !== 'run' && Math.abs(d.model.root.rotation.x) < 1e-3, d.locomotion.mode);
    // the rim owns a descending shot near it (no late swats); a rising ball is blockable
    const PP = (p, v, shotKind = 'jumpshot') => ISO.BlockSystem.protectedPhase({ position: new THREE.Vector3(...p), velocity: new THREE.Vector3(...v), shotKind });
    const H = ISO.CONFIG.hoop;
    this.check('rim phase: descending near the rim is protected', PP([0.3, H.rimHeight + 0.4, H.centerZ + 0.9], [0, -3, -1]) && PP([0, H.rimHeight + 0.3, H.centerZ], [0, 2, 0]), '');
    this.check('rim phase: rising / away from the rim is blockable', !PP([0, 2.9, H.centerZ + 5], [0, 4, -5]) && !PP([0.2, H.rimHeight - 0.2, H.centerZ + 1.2], [0, 3, -2]), '');
    this.check('rim phase: a dunk is blockable until it is at the rim', !PP([0, H.rimHeight + 0.5, H.centerZ + 0.6], [0, -3, -1], 'dunk') && PP([0, H.rimHeight + 0.1, H.centerZ + 0.2], [0, -3, 0], 'dunk'), '');
    // a steal hands the ball over through the possession system: roles, HUD, camera, input follow
    ({ h, V, d } = setup());
    g.steals._award(this.me, h.offense, 'clean', ISO.DEFENSE.steal.stealResetDelay, { defenderPlayerId: this.me.id });
    this.until(() => P.state === 'POSSESSION_START', 300);
    this.check('steal: possession to the stealing team (STEAL)', P.offenseTeamId === this.me.teamId && P.possessionStartReason === 'STEAL', `${P.offenseTeamId} ${P.possessionStartReason}`);
    this.roles('after steal');
    this.live();
    this.directions('offense after steal', { reset: () => this.place(0, 9.5, 2.6) });
  }

  // Step 17: I defend team B's finisher / ball handler (driven through their
  // virtual input, the CPU's path). Physical results only: a block needs the
  // hand on the ball, a steal needs the reach on an exposed ball.
  defenseChecks() {
    const g = this.g, P = this.P, V3 = (x, z) => new THREE.Vector3(x, 0, z), RIM = { x: 0, z: ISO.CONFIG.hoop.centerZ };
    const toAxes = (x, z) => ISO.ScreenInput.fromWorld(x, z, g.cameraController.camera);
    const ball = g.ball, I = g.input;
    // my defender's movement goes through the keyboard path (the game reads it
    // into the defender's intent every frame): scripted screen axes + sprint
    const getAxes = I.getMoveAxes, getSprint = I.isSprinting;
    let axes = { x: 0, y: 0 }, sprint = false;
    I.getMoveAxes = () => axes; I.isSprinting = () => sprint;
    const move = (a, sp) => { axes = a; sprint = sp; };
    // one finish: B's handler drives from (sx, sz) and presses Space 2.4 m out;
    // my defender starts at dpos, moves with defMove(d, h) and jumps at frame jf.
    // Returns { rel (release frame), blocked, result }.
    const finish = ({ sx, sz, sprint, dpos, defMove }, jf) => {
      P.devReset('B'); this.live();
      const h = g.handler, o = h.offense, L = o.locomotion, V = h.virtual, d = this.me.defense;
      L.resetMotion(V3(sx, sz), Math.atan2(RIM.x - sx, RIM.z - sz)); o._updateBallHandling(0);
      d.reset(V3(dpos[0], dpos[1])); Object.assign(d.humanInput, { x: 0, y: 0, sprint: false, jump: false, handsUp: false }); move({ x: 0, y: 0 }, false);
      o.shooting.setSeed(7); this.step(2);
      const b0 = d.blocks.blocksCount;
      let st = 0, pf = 0, rel = -1, res = null;
      for (let i = 0; i < 260; i++) {
        if (st === 0) { V.sprint = sprint; V.axes = toAxes(RIM.x - L.position.x, RIM.z - L.position.z); if (Math.hypot(L.position.x - RIM.x, L.position.z - RIM.z) < 2.4) { V.press('shoot'); st = 1; pf = i; } }
        else if (st === 1 && i >= pf + 2) { V.release('shoot'); V.axes = { x: 0, y: 0 }; V.sprint = false; st = 2; }
        if (defMove) defMove(d, h);
        if (i === jf) d.humanInput.jump = true;
        this.step();
        if (rel < 0 && ball.mode === 'free' && ball.flightKind === 'shot') rel = i;
        if (g.scoring.resolvedThisFrame) { res = g.scoring.resolvedThisFrame; break; }
      }
      V.axes = { x: 0, y: 0 }; V.sprint = false; move({ x: 0, y: 0 }, false);
      return { rel, blocked: d.blocks.blocksCount > b0, res };
    };
    // blocks over a few jump moments (frames relative to the no-jump release)
    const sweep = (c, offs) => { const base = finish(c, null); let n = 0; const kinds = {}; for (const off of offs) { const r = finish(c, base.rel + off); if (r.blocked) n++; if (r.res) kinds[r.res.result] = (kinds[r.res.result] || 0) + 1; } return { n, of: offs.length, base, kinds }; };
    const chaseSide = (d, h) => { const L = h.offense.locomotion, vl = Math.hypot(L.velocity.x, L.velocity.z) || 1; let nx = -L.velocity.z / vl, nz = L.velocity.x / vl;
      if ((d.position.x - L.position.x) * nx + (d.position.z - L.position.z) * nz < 0) { nx = -nx; nz = -nz; }
      const dx = ball.position.x + nx * 0.45 - d.position.x, dz = ball.position.z + nz * 0.45 - d.position.z;
      move(toAxes(dx, dz), Math.hypot(dx, dz) > 0.5); };
    const help = (d, h) => { const L = h.offense.locomotion, tx = (L.position.x + RIM.x) / 2, tz = (L.position.z + RIM.z) / 2, dx = tx - d.position.x, dz = tz - d.position.z;
      move(Math.hypot(dx, dz) < 0.35 ? { x: 0, y: 0 } : toAxes(dx, dz), false); };
    const good = [-34, -30, -26, -22];
    const layupFront = { sx: 0.3, sz: 6.6, sprint: false, dpos: [0.15, 2.7] };
    let r = sweep(layupFront, good);
    this.check('block: front layup, timed jump', r.n >= 3, `${r.n}/${r.of} blocked (${JSON.stringify(r.kinds)})`);
    const early = sweep(layupFront, [-56, -52]);
    this.check('block: a defender who jumped early is beaten (falling away)', early.n === 0, `${early.n}/${early.of} blocked`);
    r = sweep({ sx: -2.6, sz: 5.6, sprint: false, dpos: [0.9, 2.4], defMove: help }, good);
    this.check('block: side layup (help rotating over)', r.n >= 2, `${r.n}/${r.of} blocked`);
    r = sweep({ sx: 0.3, sz: 7.4, sprint: false, dpos: [0.93, 8.0], defMove: chaseSide }, [-26, -22, -18, -14]);
    this.check('block: chase-down layup (trailing, ball side)', r.n >= 1, `${r.n}/${r.of} blocked`);
    const thru = sweep({ sx: 0.3, sz: 7.4, sprint: false, dpos: [-0.33, 8.0], defMove: chaseSide }, [-30, -26, -22, -18, -14, -10]);
    this.check('block: never through the finisher\'s body (off-side chase)', thru.n === 0, `${thru.n}/${thru.of} blocked`);
    const dunkFront = { sx: 0.3, sz: 9.8, sprint: true, dpos: [0.1, 2.6] };
    r = sweep(dunkFront, [-40, -36, -32, -28]);
    this.check('block: front dunk, timed jump (before it is secured)', r.base.res && r.base.res.shotType === 'dunk' && r.n >= 2, `${r.n}/${r.of} blocked, base ${r.base.res ? r.base.res.shotType : '-'}`);
    r = sweep({ sx: 0.3, sz: 9.8, sprint: true, dpos: [1.0, 9.6], defMove: chaseSide }, [-34, -30, -26, -22, -18]);
    this.check('block: chase-down dunk (level, ball side)', r.n >= 1, `${r.n}/${r.of} blocked`);
    // late: a dunk already secured at the rim can't be knocked loose; a descending ball at the rim is the rim's
    const late = sweep(dunkFront, [0, 4, 8]);
    this.check('block: no late swat on a secured dunk', late.n === 0, `${late.n}/${late.of} blocked`);
    // ---- steals: an exposed ball-side read wins more often than a protected dribble
    const reachRun = (setup, act, presses) => {
      let won = 0, contact = 0;
      const evs = []; const on = (e) => evs.push(e.type || e.result || 'x');
      for (const pressAt of presses) {
        P.devReset('B'); this.live();
        const h = g.handler, V = h.virtual, d = this.me.defense;
        h.offense.locomotion.resetMotion(V3(0, 9.5), Math.PI); h.offense._updateBallHandling(0);
        setup(d); this.step(2);
        const st0 = (g.scoring.stats(this.me.id).steals || 0), team0 = P.offenseTeamId;
        for (let f = 0; f < 60; f++) { act(f, h, V, d); if (f === pressAt) { this.keyDown('KeyE'); } if (f === pressAt + 1) this.keyUp('KeyE'); this.step(); if (P.state !== 'LIVE') break; }
        V.axes = { x: 0, y: 0 };
        if ((g.scoring.stats(this.me.id).steals || 0) > st0) won++;
        if (d.lastReachResult && d.lastReachResult !== 'miss' && d.lastReachResult !== '-') contact++;
        this.until(() => P.state === 'LIVE' || P.state === 'POSSESSION_START', 120);
      }
      return { won, contact, n: presses.length };
    };
    const slide = (f, h, V, d) => { const a = toAxes(1, 0); V.axes = a; move(a, false); };
    const exposed = reachRun((d) => d.reset(V3(0.2, 8.7)), slide, [6, 7, 8, 9]);
    const protectedD = reachRun((d) => d.reset(V3(-0.35, 8.65)), () => {}, [6, 9, 12, 15, 18, 21, 24, 27]);
    this.check('steal: exposed ball-side read can be stolen', exposed.won >= 1 && exposed.contact >= 3, `${exposed.won}/${exposed.n} stolen, ${exposed.contact} contacts`);
    this.check('steal: protected dribble stays protected', protectedD.won === 0, `${protectedD.won}/${protectedD.n} stolen (${protectedD.contact} contacts)`);
    // a reach that comes up empty leaves the defender off balance (vulnerable)
    P.devReset('B'); this.live();
    { const h = g.handler, d = this.me.defense; h.offense.locomotion.resetMotion(V3(0, 9.5), Math.PI); h.offense._updateBallHandling(0); d.reset(V3(0.2, 7.9)); this.step(3);
      this.keyDown('KeyE'); this.step(1); this.keyUp('KeyE'); this.step(16);
      this.check('steal: a missed reach costs balance', d.lastReachResult === 'miss' && d.balance.balance < 0.75 && d.balance.commitment > 0.3, `${d.lastReachResult}, balance ${d.balance.balance.toFixed(2)}, commit ${d.balance.commitment.toFixed(2)}`); }
    Object.assign(this.me.defense.humanInput, { x: 0, y: 0, sprint: false, jump: false, handsUp: false });
    I.getMoveAxes = getAxes; I.isSprinting = getSprint;
    this.releaseAll();
  }

  // Hold the shot clock (legacy checks that spend > 12 s in one possession).
  clockHold(on) {
    const C = ISO.GAMEFLOW.shotClock;
    if (on) { this._clockDur = C.duration; C.duration = 1e6; this.P.shotClock.remaining = 1e6; }
    else if (this._clockDur) { C.duration = this._clockDur; this._clockDur = null; }
  }

  // Step 17: the shot clock — authoritative possession state, release-time rule.
  shotClockChecks() {
    const g = this.g, P = this.P, C = ISO.GAMEFLOW.shotClock, SC = () => P.shotClock, dt = 1 / 60, rules = ISO.GAMEFLOW.rules;
    const viol = []; g.events.on('shotClockViolation', (e) => viol.push(e));
    const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
    const bench = () => { const d = g.defenderEntity; if (d) d.defense.reset(new THREE.Vector3(6.5, 0, 12.5)); };
    // fresh, frozen before live, counts while live
    P.devReset('A');
    const r0 = SC().remaining, run0 = SC().running;
    this.step(5);
    this.check('shot clock: fresh possession = 12.0, frozen before live', C.duration === 12 && r0 === 12 && !run0 && SC().remaining === 12 && P.state === 'POSSESSION_START', `${r0} ${P.state}`);
    this.live();
    const a = SC().remaining; this.step(60);
    this.check('shot clock: counts down while live (60 frames = 1.00 s)', SC().running && near(a - SC().remaining, 1, 1e-6), `${a.toFixed(3)} -> ${SC().remaining.toFixed(3)}`);
    this.check('shot clock HUD: whole seconds', g.ui.clockValue.textContent === String(Math.ceil(SC().remaining - 1e-6)), g.ui.clockValue.textContent);
    // pump fake / dribble move / step-back do not reset it
    this.placeHandler(0, 7.5, 5.5); bench();
    const sh = g.handler.offense.shooting, f0 = sh.pumpFakeCount, c0 = SC().remaining;
    this.keyDown('Space'); this.step(3); this.keyUp('Space'); this.step(40);
    this.check('shot clock: pump fake does not reset', sh.pumpFakeCount > f0 && SC().remaining < c0 - 0.6 && SC().running, `${c0.toFixed(2)} -> ${SC().remaining.toFixed(2)}`);
    const c1 = SC().remaining;
    this.keyDown('KeyD'); this.step(12); this.keyDown('KeyE'); this.step(2); this.keyUp('KeyE'); this.step(20); this.keyUp('KeyD'); this.keyDown('KeyQ'); this.step(2); this.keyUp('KeyQ'); this.step(30);
    this.check('shot clock: dribble moves / step-back do not reset', near(c1 - SC().remaining, 66 * dt, 1e-6), `${c1.toFixed(2)} -> ${SC().remaining.toFixed(2)}`);
    // HUD tenths in the last 5 s
    SC().remaining = 4.96; this.step(1);
    this.check('shot clock HUD: tenths under 5 s', g.ui.clockValue.textContent === '4.9' && g.ui.clockEl.classList.contains('is-low'), g.ui.clockValue.textContent);
    // a jumper with the clock set to `rem` right before the press; returns what happened
    const jumper = (rem, seed = 7919) => {
      P.devReset('A'); this.live(); this.placeHandler(0, 6.6, 5.5); bench();
      const h = g.handler, s2 = h.offense.shooting; s2.setSeed(seed);
      if (rem !== null) SC().remaining = rem;
      const v0 = viol.length, att0 = g.scoring.attempts, sc0 = Object.assign({}, g.scoring.teamScore), shot0 = P.lastShotId;
      this.keyDown('Space');
      let n = 0, rel = -1, inFlight = null, frozen = true;
      for (let i = 0; i < 420 && P.state !== 'POSSESSION_START'; i++) {
        this.step(); n++;
        if (s2.isShooting && s2.shotTime >= s2.settings.idealRelease) this.keyUp('Space');
        if (rel < 0 && g.ball.mode === 'free') { rel = n; inFlight = SC().remaining; }
        else if (rel > 0 && P.state === 'SHOT_IN_FLIGHT' && SC().remaining !== inFlight) frozen = false;
      }
      this.keyUp('Space');
      const res = P.lastShotId !== shot0 ? g.scoring.lastResult : null;
      return { rel, violation: viol.length > v0, attempted: g.scoring.attempts > att0, res, scoreSame: g.scoring.teamScore.A === sc0.A && g.scoring.teamScore.B === sc0.B,
        next: P.offenseTeamId, reason: P.possessionStartReason, clock: SC().remaining, running: SC().running, frozen, atRelease: P.lastReleaseClock };
    };
    const base = jumper(1e6);
    const n = base.rel;
    this.check('shot clock: stops at the release (frozen while the shot flies)', base.frozen && base.attempted && !base.violation, `release step ${n}`);
    this.check('shot clock: make -> fresh 12 (same team)', base.res && base.res.made && base.next === 'A' && base.reason === 'MAKE' && base.clock === 12 && !base.running, `${base.res && base.res.result} ${base.next} ${base.clock}`);
    const before = jumper(n * dt + 0.004);
    this.check('buzzer: release just before zero is a valid shot', !before.violation && before.attempted && before.res && before.atRelease > 0, `left ${before.atRelease} s at release; ${before.res && before.res.result}`);
    const exact = jumper(n * dt);
    this.check('buzzer: zero exactly at the release step = violation', exact.violation && !exact.attempted && exact.scoreSame, `violation ${exact.violation}, attempt ${exact.attempted}`);
    const after = jumper((n - 1) * dt);
    this.check('buzzer: zero before the release = violation, no score', after.violation && !after.attempted && after.scoreSame, `violation ${after.violation}, score unchanged ${after.scoreSame}`);
    this.check('violation: other team\'s ball (SHOT_CLOCK), fresh 12', after.next === 'B' && after.reason === 'SHOT_CLOCK' && after.clock === 12, `${after.next} ${after.reason} ${after.clock}`);
    // a full possession of nothing expires at 12.0 s of simulation time, at any frame rate
    const expiry = (h) => { P.devReset('A'); this.live(); bench(); let t = 0; const v0 = viol.length; for (let i = 0; i < 4000 && viol.length === v0; i++) { g.step(h); t += h; } return t; };
    const t30 = expiry(1 / 30), t144 = expiry(1 / 144);
    this.until(() => P.state === 'POSSESSION_START', 300);
    this.check('shot clock: expires at 12.0 s at 30 and 144 fps', t30 >= 12 - 1e-9 && t30 < 12 + 1 / 30 + 1e-9 && t144 >= 12 - 1e-9 && t144 < 12 + 1 / 144 + 1e-9, `30 fps ${t30.toFixed(4)} s, 144 fps ${t144.toFixed(4)} s`);
    // miss -> fresh 12
    let m = this.shoot((r) => !r.made, { offset: 0.13 });
    this.until(() => P.state === 'POSSESSION_START', 600);
    this.check('shot clock: miss -> other team, fresh 12', m.r && P.offenseTeamId !== m.team && SC().remaining === 12 && !SC().running, `${P.offenseTeamId} ${SC().remaining}`);
    // blocked miss -> fresh 12
    P.devReset('A'); this.live();
    m = this.shoot((r) => r.result === 'BLOCKED_MISS', { jumpAt: 12 });
    this.until(() => P.state === 'POSSESSION_START', 600);
    this.check('shot clock: blocked miss -> defense, fresh 12', m.r && P.offenseTeamId !== m.team && SC().remaining === 12, `${m.r ? m.r.result : 'no block'} ${P.offenseTeamId} ${SC().remaining}`);
    // clean steal -> fresh 12 for the new offense
    P.devReset('B'); this.live(); this.step(60);
    g.steals._award(this.me, g.handler.offense, 'clean', ISO.DEFENSE.steal.stealResetDelay, { defenderPlayerId: this.me.id });
    this.until(() => P.state === 'POSSESSION_START', 300);
    this.check('shot clock: steal -> new offense, fresh 12', P.offenseTeamId === this.me.teamId && P.possessionStartReason === 'STEAL' && SC().remaining === 12, `${P.offenseTeamId} ${SC().remaining}`);
    // a deflection the offense keeps (check-ball reset) does NOT reset it
    this.live(); this.step(90);
    const kept = SC().remaining;
    P.endPossession(P.offenseTeamId, 'DEFLECTION', 0.2);
    this.until(() => P.state === 'POSSESSION_START', 300);
    this.check('shot clock: retained deflection keeps the time', near(SC().remaining, kept, 1e-9) && kept < 11, `${kept.toFixed(2)} -> ${SC().remaining.toFixed(2)}`);
    // the winning basket stops the clock; the next game starts fresh
    const target = rules.targetScore; rules.targetScore = 11;
    P.devReset('A'); this.live();
    g.scoring.teamScore.A = 10; g.scoring.teamScore.B = 3;
    m = this.shoot((r) => r.made);
    const stopped = !SC().running, left = SC().remaining;
    this.step(30);
    const still = SC().remaining === left;
    this.until(() => P.state === 'POSSESSION_START', 900);
    this.check('winning basket stops the clock; new game fresh 12', m.r && stopped && still && g.scoring.teamScore.A === 0 && SC().remaining === 12, `left ${left.toFixed(2)}, new game ${SC().remaining}`);
    rules.targetScore = target;
    this.live();
  }

  // Step 16: the rig contract, colliders on the visible hands, the shot timeline.
  modelChecks() {
    const g = this.g, P = this.P;
    const M = this.me.model, names = ISO.CharacterRig.BONE_NAMES;
    const rig2 = (() => { try { return ISO.CharacterRig.fromObject3D(M.character.mesh); } catch (e) { return null; } })();
    this.check('rig: humanoid contract (21 bones, GLB-style adapter finds them)', names.length === 21 && names.every((n) => M.rig[n] && M.rig[n].isBone) && rig2 && rig2.dims.upperArm === M.rig.dims.upperArm, `${names.length} bones`);
    this.check('rig: gameplay root is separate from the skeleton', M.root.isGroup && !M.root.isBone && M.rig.root.parent !== M.root, '');
    // defender hand colliders sit on the visible hands
    P.devReset('B'); this.live();
    const d = this.me.defense; this.keyDown('KeyF'); this.step(20);
    let off = 0; const v = new THREE.Vector3();
    for (const h of d.blocks.hands) off = Math.max(off, d.model.getHandWorld(h.side, v).distanceTo(h.cur));
    this.keyUp('KeyF');
    this.check('hand colliders follow the visible hand bones', off <= ISO.DEFENSE.hands.fingerOffset + 0.005, `${(off * 100).toFixed(1)} cm`);
    // jump shot (Step 17): a dead-center green release leaves the hand 545-565 ms
    // after the press, just before the top of the jump; tap = pump fake
    const s = this.me.offense.shooting.settings, out = s.idealRelease + s.extendTime, peak = s.takeoff + s.airTime / 2;
    this.check('jump shot: release 545-565 ms, at the top of the jump', out >= 0.545 && out <= 0.565 && Math.abs(out - peak) < 0.03 && s.greenHalfWindow === 0.02, `ball out ${(out * 1000).toFixed(0)} ms, peak ${(peak * 1000).toFixed(0)} ms, green ±${s.greenHalfWindow * 1000} ms`);
    this.check('jump shot: a tap is still a pump fake', s.fakeThreshold < s.gatherTime && s.fakeThreshold >= 0.12, `fake < ${s.fakeThreshold * 1000} ms`);
    // in game: release exactly at the ideal moment -> PERFECT, the ball leaves at the
    // timeline's moment (one 60 fps frame at most later) and the meter's green band
    // holds the fill at the release; a 117 ms tap is a pump fake
    P.devReset('A'); this.live(); this.placeHandler(0, 7.5, 5.5);
    { const dd = this.g.defenderEntity; if (dd) dd.defense.reset(new THREE.Vector3(6.5, 0, 12.5)); }
    const sh = this.me.offense.shooting, I = this.g.input;
    this.keyDown('Space');
    let t = 0, up = false, outT = null, fillAt = null;
    for (let i = 0; i < 90 && outT === null; i++) {
      if (!up && sh.isShooting && sh.shotTime + 1 / 60 >= s.idealRelease) { const age = sh.shotTime + 1 / 60 - s.idealRelease; I.keys.delete('Space'); I.upTime.Space = performance.now() - age * 1000; up = true; }
      this.step(); t += 1 / 60;
      if (fillAt === null && sh.releaseTiming) fillAt = sh.shotMeter;
      if (this.g.ball.mode === 'free') outT = t;
    }
    const z = sh.timingZones;
    this.check('jump shot: dead-center release = PERFECT, ball out on time', sh.releaseTiming === 'PERFECT' && outT !== null && outT >= out - 1e-6 && outT < out + 1 / 60 + 1e-6, `${sh.releaseTiming}, ball out ${outT !== null ? (outT * 1000).toFixed(0) : '-'} ms`);
    this.check('shot meter synced: release lands in the green band', fillAt !== null && fillAt >= z.greenStart - 1e-6 && fillAt <= z.greenEnd + 1e-6 && Math.abs(z.ideal - s.idealRelease / s.autoRelease) < 1e-6, `fill ${fillAt !== null ? fillAt.toFixed(3) : '-'} in [${z.greenStart.toFixed(3)}, ${z.greenEnd.toFixed(3)}]`);
    this.until(() => this.P.state === 'POSSESSION_START', 400); this.live(); this.placeHandler(0, 7.5, 5.5);
    { const dd = this.g.defenderEntity; if (dd) dd.defense.reset(new THREE.Vector3(6.5, 0, 12.5)); }
    const nf = sh.pumpFakeCount, ns = sh.shotCount;
    this.keyDown('Space'); this.step(7); this.keyUp('Space'); this.step(40);
    this.check('pump fake: a 117 ms tap fakes, never shoots', sh.pumpFakeCount === nf + 1 && sh.shotCount === ns, `fakes +${sh.pumpFakeCount - nf}, shots +${sh.shotCount - ns}`);
  }

  // Step 16.5: no teleports/dead frames/camera jerks, frame-rate independent smoothing.
  continuityChecks() {
    const g = this.g, P = this.P, cam = g.cameraController;
    P.devReset('A'); this.live();
    this.placeHandler(0, 8.5, 6);
    const o = this.me.offense, ball = g.ball, M = this.me.model;
    // drive right, crossover, explode left: ball never jumps, the move exits into motion, camera stays smooth
    let maxBallStep = 0, maxCamAcc = 0, maxRootOff = 0, endSpeed = -1, minAfter = 9, endF = -1;
    const pb = ball.position.clone(), pc = cam.camera.position.clone(), pv = new THREE.Vector3();
    this.keyDown('KeyD');
    for (let f = 0; f < 70; f++) {
      if (f === 20) { this.keyDown('KeyE'); }
      if (f === 21) { this.keyUp('KeyE'); this.keyUp('KeyD'); this.keyDown('KeyA'); }
      const busy = !!o.dribble.currentMove;
      this.step();
      if (ball.mode !== 'free') maxBallStep = Math.max(maxBallStep, ball.position.distanceTo(pb));
      pb.copy(ball.position);
      const v = cam.camera.position.clone().sub(pc).multiplyScalar(60);
      if (f > 2) maxCamAcc = Math.max(maxCamAcc, v.distanceTo(pv) * 60);
      pv.copy(v); pc.copy(cam.camera.position);
      maxRootOff = Math.max(maxRootOff, Math.hypot(M.root.position.x - o.position.x, M.root.position.z - o.position.z));
      if (busy && !o.dribble.currentMove && endF < 0) { endF = f; endSpeed = o.locomotion.speed; }
      if (endF >= 0 && f > endF && f - endF <= 6) minAfter = Math.min(minAfter, o.locomotion.speed);
    }
    this.keyUp('KeyA');
    this.check('continuity: ball never jumps while dribbling (crossover at speed)', maxBallStep < 0.3, `max step ${(maxBallStep * 100).toFixed(1)} cm/frame`);
    this.check('continuity: crossover exits straight into motion (no dead frame)', endF >= 0 && minAfter > 0.6 * endSpeed, `${endSpeed.toFixed(2)} -> min ${minAfter.toFixed(2)} m/s`);
    this.check('continuity: camera follow has no jerks (cut + reversal)', maxCamAcc < 45, `max ${maxCamAcc.toFixed(1)} m/s²`);
    this.check('continuity: drawn body stays on the gameplay root', maxRootOff < 0.065, `≤ ${(maxRootOff * 100).toFixed(1)} cm`);
    // frame-rate independence: the damping is exact, and the camera follow matches at 30 / 144 fps
    const runDamp = (fps) => { let x = 0, v = 0; for (let i = 0; i < fps; i++) [x, v] = ISO.Smooth.damp(x, v, 1, 10, 1 / fps); return x; };
    const camAt = (fps) => {
      const c = new ISO.CameraController(16 / 9), tgt = new THREE.Vector3(0, 0, 9);
      c.frame(tgt, null, 0, false, 0); c.snap();
      for (let i = 0; i < fps; i++) { tgt.x += 5 / fps; c.frame(tgt, null, 0, false, 1 / fps); c.update(1 / fps); }
      return c.camera.position.clone();
    };
    const d30 = runDamp(30), d144 = runDamp(144), c30 = camAt(30), c144 = camAt(144);
    this.check('continuity: smoothing is frame-rate independent (30 vs 144 fps)', Math.abs(d30 - d144) < 1e-9 && c30.distanceTo(c144) < 5 / 30, `damp Δ ${Math.abs(d30 - d144).toExponential(1)}, camera Δ ${(c30.distanceTo(c144) * 100).toFixed(1)} cm (< one 30-fps frame of target motion, ${(500 / 30).toFixed(1)} cm)`);
  }

  run() {
    const g = this.g, P = this.P, rules = ISO.GAMEFLOW.rules, target = rules.targetScore;
    this.bot(false);
    const cpuChance = ISO.DEFENSE.steal.cpuChance;
    ISO.DEFENSE.steal.cpuChance = 0;   // a CPU poke mid-measurement would reset the possession under the test
    rules.targetScore = 999;           // shots pile up while retrying; the 11 test sets scores itself
    const other = (t) => g.roster.otherTeam(t);
    // The 12 s shot clock would end the long measurement possessions below
    // mid-test: it is held for them and checked on its own (shotClockChecks).
    this.clockHold(true);

    // ---- 1. directions on offense, then across repeated possession changes ----
    P.devReset('A'); this.live(); this.roles('start');
    this.directions('offense top', { reset: () => this.place(0, 9.5, 2.6) });
    this.directions('offense left wing', { reset: () => this.place(-5.5, 6.5, 2.6) });
    this.directions('offense corner', { reset: () => this.place(6.4, 1.8, 2.6) });
    this.directions('offense sprint', { reset: () => this.place(0, 9.5, 2.6), sprint: true });
    for (let k = 0; k < 2; k++) {
      // miss -> I defend
      let s = this.shoot((r) => !r.made, { offset: 0.13 });
      this.afterResult(`miss #${k + 1}`, s.r, s.team, other(s.team), s.r && s.r.wasBlocked ? 'BLOCK' : 'MISS');
      this.directions(`defense top #${k + 1}`, { reset: () => this.place(0, 8.1, 2.6) });
      this.directions(`defense right wing #${k + 1}`, { reset: () => this.place(5.0, 6.0, 2.6) });
      this.directions(`defense left wing #${k + 1}`, { reset: () => this.place(-5.0, 6.0, 2.6) });
      this.directions(`defense near rim #${k + 1}`, { reset: () => this.place(0.5, 3.2, 2.6) });
      this.directions(`defense corner #${k + 1}`, { reset: () => this.place(-6.0, 2.0, 2.6) });
      this.directions(`defense side-on #${k + 1}`, { reset: () => this.place(0, 8.1, 2.6, 1.6) });
      this.directions(`defense sprint #${k + 1}`, { reset: () => this.place(0, 8.1, 2.6), sprint: true });
      this.directions(`defense hands up #${k + 1}`, { reset: () => this.place(0, 8.1, 2.6), handsUp: true });
      this.directions(`defense after jump #${k + 1}`, { reset: () => { this.place(0, 8.1, 2.6); this.keyDown('Space'); this.step(1); this.keyUp('Space'); this.step(50); } });
      // contact on defense: walking into the ball handler never goes through them
      this.place(0, 8.1, 1.2);
      let minGap = 9;
      this.keyDown('KeyS');
      for (let i = 0; i < 45; i++) { this.step(); minGap = Math.min(minGap, this.me.active.position.distanceTo(this.g.handler.offense.position)); }
      this.keyUp('KeyS');
      this.check(`contact: defender into ball handler #${k + 1}`, minGap > 0.45, `closest ${minGap.toFixed(2)} m`);
      // offensive keys pressed while defending must not fire later
      this.keyDown('KeyC'); this.keyDown('KeyQ'); this.keyDown('KeyR'); this.step(2);
      this.keyUp('KeyC'); this.keyUp('KeyQ'); this.keyUp('KeyR');
      // CPU misses -> I am back on offense
      s = this.shoot((r) => !r.made, { offset: 0.13 });
      this.afterResult(`CPU miss #${k + 1}`, s.r, s.team, other(s.team), s.r && s.r.wasBlocked ? 'BLOCK' : 'MISS');
      this.step(6);
      const o = this.me.offense;
      this.check(`no stale moves after regaining the ball #${k + 1}`, !o.dribble.currentMove && !o.stepBack.isSteppingBack, o.dribble.currentMove || (o.stepBack.isSteppingBack ? 'stepBack' : 'clean'));
      // contact on offense: driving into the set defender never goes through them
      this.placeHandler(0, 9.0, 1.2);
      minGap = 9;
      this.keyDown('KeyW');
      for (let i = 0; i < 45; i++) { this.step(); minGap = Math.min(minGap, this.me.active.position.distanceTo(this.g.defender.position)); }
      this.keyUp('KeyW');
      this.check(`contact: ball handler into defender #${k + 1}`, minGap > 0.45, `closest ${minGap.toFixed(2)} m`);
      this.directions(`offense again #${k + 1}`, { reset: () => this.place(0, 9.5, 2.6) });
    }

    // ---- 2. make-it-take-it (both teams), blocked miss ---------------------------
    for (const team of ['A', 'B']) {
      P.devReset(team); this.live();
      const s = this.shoot((r) => r.result === 'MAKE');
      this.afterResult(`make-it-take-it ${team}`, s.r, s.team, team, 'MAKE');
      const m = this.shoot((r) => r.result === 'MISS', { offset: 0.13 });
      this.afterResult(`miss switches ${team}`, m.r, m.team, other(team), 'MISS');
    }
    P.devReset('A'); this.live();
    const b = this.shoot((r) => r.result === 'BLOCKED_MISS', { jumpAt: 12 });
    this.afterResult('blocked miss', b.r, b.team, 'B', 'BLOCK');

    // ---- 3. scoring: 1 inside, 2 outside, 0 for a miss ----------------------------
    const scoreOf = (t) => g.scoring.teamScore[t];
    P.devReset('A'); this.live();
    let before = scoreOf('A'), s = this.shoot((r) => r.result === 'MAKE', { z: 6.6 });
    this.check('inside make = +1', s.r && !s.r.isThree && scoreOf('A') - before === 1, `+${scoreOf('A') - before}`);
    this.afterResult('after inside make', s.r, 'A', 'A', 'MAKE');
    before = scoreOf('A'); s = this.shoot((r) => r.result === 'MAKE', { z: 9.3 });
    this.check('outside make = +2', s.r && s.r.isThree && scoreOf('A') - before === 2, `+${scoreOf('A') - before}`);
    this.afterResult('after outside make', s.r, 'A', 'A', 'MAKE');
    before = scoreOf('A'); s = this.shoot((r) => r.result === 'MISS', { offset: 0.13 });
    this.check('miss = +0', s.r && scoreOf('A') - before === 0, `+${scoreOf('A') - before}`);
    this.afterResult('after miss', s.r, 'A', 'B', 'MISS');

    // ---- 4. first to 11 ------------------------------------------------------------
    rules.targetScore = target;
    const won = [], started = [];
    g.events.on('gameWon', (e) => won.push(e)); g.events.on('gameStarted', (e) => started.push(e));
    P.devReset('A'); this.live();
    g.scoring.teamScore.A = 10; g.scoring.teamScore.B = 7;
    s = this.shoot((r) => r.result === 'MAKE');
    this.until(() => P.state === 'POSSESSION_START', 900);
    this.check('first to 11: game won once', won.length === 1 && won[0].winnerTeamId === 'A' && won[0].score.A >= 11, JSON.stringify(won.map((w) => w.score)));
    this.check('new game: 0-0, loser\'s ball', scoreOf('A') === 0 && scoreOf('B') === 0 && P.offenseTeamId === 'B' && started.length === 1, `${scoreOf('A')}-${scoreOf('B')} ${P.offenseTeamId} ball`);
    this.roles('new game');
    this.live();
    this.directions('defense in game 2', { reset: () => this.place(0, 8.1, 2.6) });

    // ---- 5. steals, balance, ankle breaks, rim protection --------------------------
    this.interactions();

    // ---- 6. Player Model V2 rig + faster release -----------------------------------
    this.modelChecks();

    // ---- 7. motion continuity (Step 16.5) -----------------------------------------
    this.continuityChecks();

    // ---- 8. defense: finishes are blockable, steals reward reads (Step 17) -------
    this.defenseChecks();

    // ---- 9. the shot clock (Step 17) ---------------------------------------------
    this.clockHold(false);
    this.shotClockChecks();

    rules.targetScore = target;
    ISO.DEFENSE.steal.cpuChance = cpuChance;
    this.releaseAll();
    this.bot(true);
    return this.results;
  }
};

window.addEventListener('load', () => {
  setTimeout(() => {
    const g = window.game;
    g.renderer.setAnimationLoop(null);
    const t0 = performance.now();
    const res = new ISO.SelfTest(g).run();
    const failed = res.filter((r) => !r.ok);
    window.__SELFTEST = { passed: res.length - failed.length, failed: failed.length, results: res, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
    const panel = document.createElement('div');
    Object.assign(panel.style, { position: 'fixed', inset: '20px', overflow: 'auto', background: 'rgba(8,12,22,0.92)', color: '#e8ecf4', font: '12px/1.5 Menlo, Consolas, monospace', padding: '14px', zIndex: 50, whiteSpace: 'pre' });
    panel.textContent = `SELF-TEST  ${window.__SELFTEST.passed} passed, ${failed.length} failed\n\n` + res.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.info}`).join('\n');
    document.body.append(panel);
    g.renderer.setAnimationLoop(() => g.tick());
  }, 300);
});
})();
