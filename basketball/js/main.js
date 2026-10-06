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
    // ?defenseplayer: you control the defender; a dev test bot drives the
    // ball handler through a virtual input (controls depend on your role).
    this.humanRole = ISO.DEFENSE.enabled && ISO.DEFENSE.playerControlsDefense ? 'defense' : 'offense';
    this.offenseInput = this.humanRole === 'defense' ? new ISO.VirtualInput() : this.input;
    // Hoop collisions + made-basket detection for the free ball.
    this.hoopPhysics = new ISO.HoopPhysics();
    // The net is driven by the ball itself; rim hits add a shake.
    this.hoopPhysics.onRimHit = (strength, normal) => this.hoop.net.kick(Math.min(4, strength), normal);
    if (ISO.CONFIG.debugPhysics) this.scene.add(this.hoopPhysics.buildDebug());

    this.ball = new ISO.Basketball();
    this.ball.world = this.hoopPhysics;
    this.ball.addTo(this.scene);
    this.player = new ISO.PlayerController({
      input: this.offenseInput,
      camera: this.cameraController.camera,
      ball: this.ball,
      startPosition: new THREE.Vector3(0, 0, 8.5), // top of the key
      startFacing: Math.PI,                         // facing the basket
    });
    this.scene.add(this.player.object);

    // CPU defender (?nodefense to practice alone). Contact is resolved right
    // after the ball handler moves, before the ball is placed.
    if (ISO.DEFENSE.enabled) {
      this.defender = new ISO.DefenderController({
        opponent: this.player,
        ball: this.ball,
        camera: this.cameraController.camera,
        startPosition: new THREE.Vector3(0, 0, 7.1),
        startFacing: 0,
      });
      this.scene.add(this.defender.object);
      this.player.afterMove = (dt) => this.defender.resolveContact(dt);
      // The ball handler's primary matchup (orientation/stance context only;
      // it never moves the ball handler).
      this.player.locomotion.matchup = this.defender;
      this.defender.blocks.events = this.events;
      // Shots read the contest at their release (deterministic from player state).
      const contest = (type) => this.defender.contest.atReleaseValue(type);
      this.player.shooting.contestProvider = contest;
      this.player.finishing.contestProvider = contest;
      if (this.humanRole === 'defense') {
        this.defender.setControl('human');
        this.offenseBot = new ISO.OffenseTestBot({ player: this.player, input: this.offenseInput, camera: this.cameraController.camera, defender: this.defender });
      }
      if (ISO.CONFIG.debugPhysics) this.defenseDebug = new ISO.DefenseDebug(this.scene, this.defender, document.getElementById('hud'));
    }

    // No teammates yet, so passing has no target in normal play. In debug mode
    // (?debug) a marker on the wing catches passes and throws them back.
    if (ISO.CONFIG.debugPhysics) {
      this.debugPassTarget = new ISO.DebugPassTarget({
        position: new THREE.Vector3(-5.2, 1.25, 7.2),
        getReceiver: () => new THREE.Vector3(this.player.position.x, 1.2, this.player.position.z),
      });
      this.player.passing.addTarget(this.debugPassTarget);
      this.scene.add(this.debugPassTarget.object);
    }
    this.ball.update(0);
    this.cameraController.setFocus(this.player.position);
    this.cameraController.snap();

    this.scoring = new ISO.ScoringSystem({
      shooting: this.player.shooting,
      shooters: [this.player.shooting, this.player.finishing],
      hoop: this.hoopPhysics,
      ball: this.ball,
      events: this.events,
    });
    this.ui = new ISO.UI(document.getElementById('hud'), { role: this.humanRole });
    if (ISO.CONFIG.debugPhysics) this.offenseDebug = new ISO.OffenseDebug(this.scene, this.player, document.getElementById('hud'));
    this.events.on('blockOccurred', (e) => this.ui.showBlock(e));

    this._focus = new THREE.Vector3();
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

  // One simulation step (everything except rendering).
  step(dt) {
    this.events.tick(dt);
    if (this.humanRole === 'defense') this._readDefenseInput();
    if (this.offenseBot) this.offenseBot.update(dt);
    if (this.defender) this.defender.update(dt);
    this.player.update(dt);
    if (this.defender) this.defender.updateVisual(dt);
    this.ball.update(dt);
    if (this.debugPassTarget) this.debugPassTarget.update(dt);
    this.hoop.net.update(dt, this.ball);
    // Defending: keep both players in view, weighted toward you.
    if (this.humanRole === 'defense') this._focus.lerpVectors(this.player.position, this.defender.position, 0.55);
    if (this.humanRole === 'defense') this.cameraController.setFocus(this._focus);
    else {
      const L = this.player.locomotion;
      this.cameraController.frame(this.player.position, this.defender ? this.defender.position : null,
        L.attack || 0, L.orientation ? L.orientation.beaten : false, dt);
    }
    this.cameraController.update(dt);
    this.scoring.update(dt);
    this.ui.update(dt, {
      shooting: this.player.shooting,
      passing: this.player.passing,
      scoring: this.scoring,
      camera: this.cameraController.camera,
      anchor: this.player.position,
    });
    if (this.defenseDebug) this.defenseDebug.update();
    if (this.offenseDebug) this.offenseDebug.update();
  }

  // Your keys -> the defender's input intent (the same plain intent a remote
  // player would send): move axes, run, jump/contest (Space), hands up (F).
  _readDefenseInput() {
    const I = this.input, hi = this.defender.humanInput;
    const a = I.getMoveAxes();
    hi.x = a.x; hi.y = a.y;
    hi.sprint = I.isSprinting();
    if (I.consumePress('shoot')) hi.jump = true;
    hi.handsUp = I.isDown('pass');
    for (let m = 0; m <= 7; m++) if (I.consumePress('bot' + m)) this.offenseBot.setMode(m);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.game = new ISO.Game(document.getElementById('game'));
});
