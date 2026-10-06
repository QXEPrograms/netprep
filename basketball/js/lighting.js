// Lighting: soft sky fill, one shadow-casting key light over the court,
// and a warm pool of light over the paint.
ISO.Lighting = (function () {
  function build(scene) {
    const C = ISO.CONFIG.court;
    const courtCenter = new THREE.Vector3(0, 0, C.halfLength / 2);

    const hemi = new THREE.HemisphereLight(0xcfdcff, 0x2a1d12, 0.75);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff3e2, 2.2);
    key.position.set(5, 18, 11);
    key.target.position.copy(courtCenter);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12;
    sc.near = 2; sc.far = 45;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    scene.add(key, key.target);

    // Cool rim light from the far side for separation on the hoop and stands
    const rimLight = new THREE.DirectionalLight(0x9fc2ff, 0.55);
    rimLight.position.set(-8, 10, -6);
    scene.add(rimLight);

    // Spot over the paint (no shadows, cheap)
    const spot = new THREE.SpotLight(0xffe2b8, 40, 22, Math.PI / 5, 0.6, 1.6);
    spot.position.set(0, 11, 4.5);
    spot.target.position.set(0, 0, 3.5);
    scene.add(spot, spot.target);

    return { hemi, key, rimLight, spot };
  }

  return { build };
})();
