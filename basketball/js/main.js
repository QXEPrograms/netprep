// Entry point: renderer, scene assembly and the render loop.
ISO.Game = class {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(ISO.CONFIG.colors.background);
    this.scene.fog = new THREE.Fog(ISO.CONFIG.colors.background, 32, 70);

    this.scene.add(ISO.Court.build(this.renderer));
    this.hoop = ISO.Hoop.build();
    this.scene.add(this.hoop.group);
    this.scene.add(ISO.Arena.build());
    this.lights = ISO.Lighting.build(this.scene);

    this.cameraController = new ISO.CameraController(container.clientWidth / container.clientHeight);
    this.cameraController.setAspect(container.clientWidth / container.clientHeight);

    this.input = new ISO.Input();
    // Simulation results as plain events (UI listens; networking later).
    this.events = new ISO.GameEvents();
    // Hoop collisions + made-basket detection for the free ball.
    this.hoopPhysics = new ISO.HoopPhysics();
    // The net is driven by the ball itself; rim hits add a shake.
    this.hoopPhysics.onRimHit = (strength, normal) => this.hoop.net.kick(Math.min(4, strength), normal);
    if (ISO.CONFIG.debugPhysics) this.scene.add(this.hoopPhysics.buildDebug());

    this.ball = new ISO.Basketball();
    this.ball.world = this.hoopPhysics;
    this.ball.addTo(this.scene);

    // ---- teams & players ------------------------------------------------------
    // Player identity is permanent (id, team, control source, body); roles
    // (offense / defense) come and go with possession. You are P1 on team A.
    // P2 (team B) is the CPU: DefenderAI on defense, the dev test bot on
    // offense. ?nodefense: P1 alone (practice).
    const camera = this.cameraController.camera, GF = ISO.GAMEFLOW;
    this.roster = new ISO.Roster();
    this.roster.addTeam(new ISO.Team(ISO.TEAM_A, GF.teams.A));
    this.roster.addTeam(new ISO.Team(ISO.TEAM_B, GF.teams.B));
    const mk = (id, teamId, name, control, look) => this.roster.addPlayer(new ISO.PlayerEntity({ id, teamId, name, controlSource: control, look, ball: this.ball, camera, keyboard: this.input }));
    mk('P1', ISO.TEAM_A, 'Player 1', ISO.CONTROL.LOCAL, {});
    if (ISO.DEFENSE.enabled) mk('P2', ISO.TEAM_B, 'Player 2', ISO.CONTROL.CPU, { jersey: 0x2f6fe0, trim: 0xf4f6fa, skin: 0x6b4428, shoes: 0x1b2333, number: '3' });
    this.roster.buildDefense({ ball: this.ball, camera, events: this.events });
    for (const p of this.roster.players) {
      this.scene.add(p.object);
      if (p.defense) p.defense.setControl(p.controlSource === ISO.CONTROL.LOCAL ? 'human' : 'cpu');
      // The CPU's offense (development test bot) writes the same input a human would.
      if (p.controlSource === ISO.CONTROL.CPU) {
        p.bot = new ISO.OffenseTestBot({ player: p.offense, input: p.virtual, camera, defender: null });
        p.bot.managed = true;
      }
    }

    // No teammates yet, so passing has no target in normal play. In debug mode
    // (?debug) a marker on the wing catches passes and throws them back.
    if (ISO.CONFIG.debugPhysics) {
      this.debugPassTarget = new ISO.DebugPassTarget({
        position: new THREE.Vector3(-5.2, 1.25, 7.2),
        getReceiver: () => new THREE.Vector3(this.player.position.x, 1.2, this.player.position.z),
      });
      for (const p of this.roster.players) p.offense.passing.addTarget(this.debugPassTarget);
      this.scene.add(this.debugPassTarget.object);
    }

    // Shots: every player's jumper/finish systems, tagged with who they are.
    this.scoring = new ISO.ScoringSystem({
      shooters: () => this._shooters,
      hoop: this.hoopPhysics,
      ball: this.ball,
      events: this.events,
      teamIds: Object.keys(this.roster.teams),
    });
    this._shooters = [];
    for (const p of this.roster.players) {
      this._shooters.push({ system: p.offense.shooting, playerId: p.id, teamId: p.teamId });
      this._shooters.push({ system: p.offense.finishing, playerId: p.id, teamId: p.teamId });
    }

    // Possession: the one authority on who has the ball and the flow between
    // possessions (possession.js).
    this.possession = new ISO.PossessionSystem({ roster: this.roster, ball: this.ball, hoop: this.hoopPhysics, scoring: this.scoring, events: this.events });
    this.possession.onReset = (e) => this._onPossessionReset(e);

    this.ui = new ISO.UI(document.getElementById('hud'), { role: 'offense', teams: this.roster.teams, roster: this.roster });
    this.events.on('blockOccurred', (e) => this.ui.showBlock(e));
    if (ISO.CONFIG.debugPhysics) {
      const hud = document.getElementById('hud');
      this.offenseDebug = new ISO.OffenseDebug(this.scene, this.roster.players[0].offense, hud);
      if (this.roster.players[0].defense) this.defenseDebug = new ISO.DefenseDebug(this.scene, this.roster.players[0].defense, hud);
      this.possessionDebug = new ISO.PossessionDebug(this.possession, this.roster, this.scoring, hud);
    }

    // ?defenseplayer: start on defense (the CPU's team has the ball first).
    const first = ISO.DEFENSE.enabled && ISO.DEFENSE.playerControlsDefense ? ISO.TEAM_B : GF.firstPossession;
    this._focus = new THREE.Vector3();
    this.possession.begin(first);
    this.ball.update(0);

    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => this.tick());
  }

  onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.cameraController.setAspect(w / h);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.step(dt);
    this.renderer.render(this.scene, this.cameraController.camera);
  }

  // ---- who is who right now --------------------------------------------------
  // (Roles change with possession; these always answer for the current one.)

  // The ball handler's player entity, and their offensive controller.
  get handler() { return this.roster.get(this.possession.ballHandlerPlayerId) || this.roster.players[0]; }
  get player() { return this.handler.offense; }
  // The defender assigned to the ball handler (null in practice mode).
  get defenderEntity() { return this.roster.defendersOf(this.handler)[0] || null; }
  get defender() { const d = this.defenderEntity; return d ? d.defense : null; }
  // Your player and the role it is playing.
  get localPlayer() { return this.roster.local || this.roster.players[0]; }
  get humanRole() { return this.localPlayer.role || 'offense'; }
  // The CPU's offense bot (dev), for tests/keys.
  get offenseBot() { const b = this.roster.players.find((p) => p.bot && p.role === 'offense') || this.roster.players.find((p) => p.bot); return b ? b.bot : null; }

  // After every possession reset (screen black): route input by player
  // identity, start the CPU's possession, point the debug views at the new
  // matchup and put the camera on the new possession.
  _onPossessionReset() {
    const R = this.roster;
    if (ISO.GAMEFLOW.devControlBallHandler) {
      // dev: your keys follow the ball handler; everyone else is CPU
      for (const p of R.players) p.setControlSource(p.id === this.possession.ballHandlerPlayerId ? ISO.CONTROL.LOCAL : ISO.CONTROL.CPU);
      for (const p of R.players) if (p.controlSource === ISO.CONTROL.CPU && !p.bot) { p.bot = new ISO.OffenseTestBot({ player: p.offense, input: p.virtual, camera: this.cameraController.camera, defender: null }); p.bot.managed = true; }
    }
    for (const p of R.players) {
      if (p.defense) p.defense.setControl(p.controlSource === ISO.CONTROL.LOCAL ? 'human' : 'cpu');
      if (p.bot && p.role === 'offense' && p.controlSource === ISO.CONTROL.CPU) {
        p.bot.player = p.offense;
        p.bot.defender = R.defendersOf(p)[0] ? R.defendersOf(p)[0].defense : null;
        p.bot.startPossession();
      }
    }
    if (this.offenseDebug) this.offenseDebug.p = this.player;
    if (this.defenseDebug && this.defender) this.defenseDebug.d = this.defender;
    if (this.ui) this.ui.setRole(this.humanRole);
    this._frameCamera(0);
    this.cameraController.snap();
  }

  // One simulation step (everything except rendering).
  step(dt) {
    const R = this.roster, P = this.possession;
    this.events.tick(dt);
    P.applyFreeze();                       // input off outside live play
    const offense = R.players.filter((p) => p.role === 'offense');
    const defense = R.players.filter((p) => p.role === 'defense');
    // Intent: your keys go to YOUR player, whatever role it plays; the CPU
    // writes the same kind of intent.
    for (const p of defense) if (p.controlSource === ISO.CONTROL.LOCAL) this._readDefenseInput(p);
    this._readBotKeys();
    for (const p of offense) if (p.bot && p.controlSource === ISO.CONTROL.CPU && P.inputEnabled) p.bot.update(dt);
    // Simulation: defenders move, ball handlers move (contact right after),
    // then defenders pose (hands/blocks/contest) before the ball steps.
    for (const p of defense) p.defense.update(dt);
    for (const p of offense) p.offense.update(dt);
    for (const p of defense) p.defense.updateVisual(dt);
    this.ball.update(dt);
    if (this.debugPassTarget) this.debugPassTarget.update(dt);
    this.hoop.net.update(dt, this.ball);
    this._frameCamera(dt);
    this.cameraController.update(dt);
    // The shot's one result, then what it means for possession.
    this.scoring.update(dt);
    P.update(dt);
    // The shot meter is for your own shots; results show for everyone's.
    const mine = this.localPlayer.role === 'offense' ? this.localPlayer.offense : null;
    this.ui.update(dt, {
      shooting: mine ? mine.shooting : null,
      passing: mine ? mine.passing : null,
      scoring: this.scoring,
      possession: P,
      camera: this.cameraController.camera,
      anchor: mine ? mine.position : this.player.position,
    });
    if (this.defenseDebug && this.defender) this.defenseDebug.update();
    if (this.offenseDebug) this.offenseDebug.update();
    if (this.possessionDebug) this.possessionDebug.update();
  }

  // Camera: frames the possession. On offense (you have the ball): the ball
  // handler pulled toward their defender and the rim. On defense: both
  // players, weighted toward you. Its angle never changes, so WASD keeps
  // meaning the same thing on either end.
  _frameCamera(dt) {
    const h = this.player, d = this.defender, me = this.localPlayer;
    if (me.role === 'defense' && d) {
      this._focus.lerpVectors(h.position, me.defense.position, 0.55);
      this.cameraController.setFocus(this._focus);
    } else {
      const L = h.locomotion;
      this.cameraController.frame(h.position, d ? d.position : null, L.attack || 0, L.orientation ? L.orientation.beaten : false, dt);
    }
  }

  // Your keys -> your defender's input intent (the same plain intent a remote
  // player would send): move axes, run, jump/contest (Space), hands up (F).
  _readDefenseInput(p) {
    const I = p.input, hi = p.defense.humanInput;
    const a = I.getMoveAxes();
    hi.x = a.x; hi.y = a.y;
    hi.sprint = I.isSprinting();
    if (I.consumePress('shoot')) hi.jump = true;
    hi.handsUp = I.isDown('pass');
  }

  // Number keys pick the CPU offense's test pattern (8 = rotate again).
  _readBotKeys() {
    for (let m = 0; m <= 8; m++) {
      if (!this.input.consumePress('bot' + m)) continue;
      for (const p of this.roster.players) if (p.bot) p.bot.setMode(m);
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.game = new ISO.Game(document.getElementById('game'));
});
