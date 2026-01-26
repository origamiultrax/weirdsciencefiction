import * as THREE from "three";

export function createSceneRig() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b8b8b8");

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  camera.position.set(55, 38, 55);

  const lights = new THREE.Group();

  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  lights.add(sun);

  lights.add(new THREE.HemisphereLight(0xbfd6ff, 0x8b6f54, 0.55));
  lights.add(new THREE.AmbientLight(0xffffff, 0.12));

  return { scene, camera, lights, sun };
}
