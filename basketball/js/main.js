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
    // Hoop collisions + made-basket detection for the free ball.
    this.hoopPhysics = new ISO.HoopPhysics();
    // The net is driven by the ball itself; rim hits add a shake.
    this.hoopPhysics.onRimHit = (strength, normal) => this.hoop.net.kick(Math.min(4, strength), normal);
    if (ISO.CONFIG.debugPhysics) this.scene.add(this.hoopPhysics.buildDebug());

    this.ball = new ISO.Basketball();
    this.ball.world = this.hoopPhysics;
    this.ball.addTo(this.scene);
    this.player = new ISO.PlayerController({
      input: this.input,
      camera: this.cameraController.camera,
      ball: this.ball,
      startPosition: new THREE.Vector3(0, 0, 8.5), // top of the key
      startFacing: Math.PI,                         // facing the basket
    });
    this.scene.add(this.player.object);

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

    this.scoring = new ISO.ScoringSystem({ shooting: this.player.shooting, hoop: this.hoopPhysics, ball: this.ball });
    this.ui = new ISO.UI(document.getElementById('hud'));

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
    this.player.update(dt);
    this.ball.update(dt);
    if (this.debugPassTarget) this.debugPassTarget.update(dt);
    this.hoop.net.update(dt, this.ball);
    this.cameraController.setFocus(this.player.position);
    this.cameraController.update(dt);
    this.scoring.update(dt);
    this.ui.update(dt, {
      shooting: this.player.shooting,
      passing: this.player.passing,
      scoring: this.scoring,
      camera: this.cameraController.camera,
      anchor: this.player.position,
    });
    this.renderer.render(this.scene, this.cameraController.camera);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.game = new ISO.Game(document.getElementById('game'));
});
