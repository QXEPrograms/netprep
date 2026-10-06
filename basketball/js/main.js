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
    this.player = new ISO.PlayerController({
      input: this.input,
      camera: this.cameraController.camera,
      startPosition: new THREE.Vector3(0, 0, 8.5), // top of the key
      startFacing: Math.PI,                         // facing the basket
    });
    this.scene.add(this.player.object);
    this.cameraController.setFocus(this.player.position);
    this.cameraController.snap();

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
    this.hoop.net.update(dt);
    this.cameraController.setFocus(this.player.position);
    this.cameraController.update(dt);
    this.renderer.render(this.scene, this.cameraController.camera);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.game = new ISO.Game(document.getElementById('game'));
});
