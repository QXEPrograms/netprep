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
    this.hoop.net.update(dt);
    this.cameraController.update(dt);
    this.renderer.render(this.scene, this.cameraController.camera);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.game = new ISO.Game(document.getElementById('game'));
});
