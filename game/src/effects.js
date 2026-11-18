// Transient combat visuals: tracers, impact sparks and the plant explosion. All pools are
// fixed-size and reused, so the hot loop allocates nothing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_MAX = 24;
const SPARK_MAX = 320;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_MAX; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(PALETTE.ember),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(SPARK_MAX * 3);
  const sparkVelocities = new Float32Array(SPARK_MAX * 3);
  const sparkLife = new Float32Array(SPARK_MAX);
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.ember),
    size: 0.06,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkCursor = 0;

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 18, 1.6);
  scene.add(flashLight);
  let flashLeft = 0;

  const boomLight = new THREE.PointLight(new THREE.Color('#ff7a2a'), 0, 40, 1.2);
  scene.add(boomLight);
  let boomLeft = 0;

  const boomMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3d'), transparent: true, opacity: 0, depthWrite: false }),
  );
  boomMesh.visible = false;
  scene.add(boomMesh);

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to) {
      const slot = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % TRACER_MAX;
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.visible = true;
      slot.line.material.opacity = 0.85;
      slot.life = 0.09;
    },
    impact(point, normal, count = 10) {
      for (let n = 0; n < count; n += 1) {
        const i = sparkCursor;
        sparkCursor = (sparkCursor + 1) % SPARK_MAX;
        sparkPositions[i * 3] = point.x;
        sparkPositions[i * 3 + 1] = point.y;
        sparkPositions[i * 3 + 2] = point.z;
        tmp.copy(normal).multiplyScalar(1.5 + Math.random() * 2.5);
        tmp.x += (Math.random() - 0.5) * 2.5;
        tmp.y += Math.random() * 2.5;
        tmp.z += (Math.random() - 0.5) * 2.5;
        sparkVelocities[i * 3] = tmp.x;
        sparkVelocities[i * 3 + 1] = tmp.y;
        sparkVelocities[i * 3 + 2] = tmp.z;
        sparkLife[i] = 0.35 + Math.random() * 0.25;
      }
      sparkGeometry.getAttribute('position').needsUpdate = true;
    },
    muzzleFlash(position) {
      flashLight.position.copy(position);
      flashLight.intensity = 14;
      flashLeft = 0.05;
    },
    explosion(position) {
      boomLight.position.copy(position);
      boomLight.position.y += 1.5;
      boomLight.intensity = 400;
      boomLeft = 0.7;
      boomMesh.position.copy(position);
      boomMesh.position.y += 0.8;
      boomMesh.visible = true;
      boomMesh.scale.setScalar(0.5);
      boomMesh.material.opacity = 0.9;
      for (let n = 0; n < 90; n += 1) {
        const i = sparkCursor;
        sparkCursor = (sparkCursor + 1) % SPARK_MAX;
        sparkPositions[i * 3] = position.x;
        sparkPositions[i * 3 + 1] = position.y + 0.6;
        sparkPositions[i * 3 + 2] = position.z;
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 7;
        sparkVelocities[i * 3] = Math.cos(a) * r;
        sparkVelocities[i * 3 + 1] = 2 + Math.random() * 7;
        sparkVelocities[i * 3 + 2] = Math.sin(a) * r;
        sparkLife[i] = 0.6 + Math.random() * 0.7;
      }
      sparkGeometry.getAttribute('position').needsUpdate = true;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.line.material.opacity = Math.max(0, slot.life / 0.09) * 0.85;
        if (slot.life <= 0) slot.line.visible = false;
      }
      let anySpark = false;
      for (let i = 0; i < SPARK_MAX; i += 1) {
        if (sparkLife[i] <= 0) continue;
        anySpark = true;
        sparkLife[i] -= dt;
        sparkVelocities[i * 3 + 1] -= 12 * dt;
        sparkPositions[i * 3] += sparkVelocities[i * 3] * dt;
        sparkPositions[i * 3 + 1] += sparkVelocities[i * 3 + 1] * dt;
        sparkPositions[i * 3 + 2] += sparkVelocities[i * 3 + 2] * dt;
        if (sparkPositions[i * 3 + 1] < 0.02) {
          sparkPositions[i * 3 + 1] = 0.02;
          sparkVelocities[i * 3 + 1] *= -0.3;
        }
      }
      if (anySpark) sparkGeometry.getAttribute('position').needsUpdate = true;
      if (flashLeft > 0) {
        flashLeft -= dt;
        flashLight.intensity = Math.max(0, flashLeft / 0.05) * 14;
      } else {
        flashLight.intensity = 0;
      }
      if (boomLeft > 0) {
        boomLeft -= dt;
        const k = Math.max(0, boomLeft / 0.7);
        boomLight.intensity = k * 400;
        boomMesh.scale.setScalar(0.5 + (1 - k) * 9);
        boomMesh.material.opacity = k * 0.85;
        if (boomLeft <= 0) boomMesh.visible = false;
      } else {
        boomLight.intensity = 0;
      }
    },
  };
}
