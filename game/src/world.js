// EMBER YARD: a decommissioned foundry yard at dusk, built for a round-based tactical
// shooter. Two sites (A Furnace west, B Depot east), three lanes (west, mid, east), a
// furnace hall in the middle, and cover everywhere a fight should happen. Every box is a
// collider for players and bots and a surface a bullet stops on. Textures are drawn on
// canvas at load time: no files, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, size, base, dots, alpha) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i += 1) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha * Math.random()})` : `rgba(0,0,0,${alpha * Math.random() * 1.6})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function makeTextures() {
  const asphalt = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#34383f', 2600, 0.16);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      let x = Math.random() * s;
      let y = Math.random() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j += 1) {
        x += (Math.random() - 0.5) * 60;
        y += (Math.random() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, 10, 8);
  const concrete = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#3a3f4a', 1800, 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(Math.random() * s, Math.random() * s, 30 + Math.random() * 60, 8 + Math.random() * 20);
  }, 4, 2);
  const container = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8a4a28';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, 0, 5, s);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 8, 0, 3, s);
    }
    speckle(ctx, s, 'rgba(0,0,0,0)', 500, 0.2);
  }, 3, 1);
  const hazard = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#c08a2d';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1b1e2e';
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, s);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  }, 6, 1);
  return { asphalt, concrete, container, hazard };
}

// Waypoint graph: nodes on the lanes and around cover, edges between neighbours. Bots ask
// for a path with a breadth-first search over this tiny graph.
const WAYPOINTS = [
  [0, 13], [-6, 13], [6, 13],
  [-13, 8], [0, 8], [13, 8],
  [-13, 2], [-7, 2], [0, 2], [7, 2], [13, 2],
  [-13, -4], [-7, -4], [0, -4], [7, -4], [13, -4],
  [-14, -9], [-8, -9], [0, -9], [8, -9], [14, -9],
  [-13, -13], [0, -13], [13, -13],
];
const WAY_EDGES = [
  [0, 1], [0, 2], [0, 4], [1, 3], [2, 5], [3, 4], [4, 5], [3, 6], [4, 8], [5, 10],
  [6, 7], [7, 8], [8, 9], [9, 10], [6, 11], [7, 12], [8, 13], [9, 14], [10, 15],
  [11, 16], [12, 17], [13, 18], [14, 19], [15, 20], [11, 21], [13, 22], [15, 23],
  [16, 17], [17, 18], [18, 19], [19, 20], [16, 21], [18, 22], [20, 23], [21, 22], [22, 23],
  [12, 16], [14, 20], [7, 11], [9, 15],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const textures = makeTextures();

  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: textures.asphalt, roughness: 0.95, metalness: 0.02 }),
    concrete: new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.92, metalness: 0.03 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.55, metalness: 0.5 }),
    rust: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.8, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.7, metalness: 0.3 }),
    ochre: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ochre), roughness: 0.8, metalness: 0.2 }),
    crate: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.9, metalness: 0.05 }),
    container: new THREE.MeshStandardMaterial({ map: textures.container, roughness: 0.75, metalness: 0.35 }),
    hazard: new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.85 }),
    ember: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 0.35 }),
    warden: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.warden), roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(PALETTE.warden), emissiveIntensity: 0.35 }),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat] || mats.concrete);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, mat, segments = 18, rotationZ = 0) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mats[mat] || mats.steel);
    mesh.position.set(x, y, z);
    if (rotationZ) mesh.rotation.z = rotationZ;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    mesh.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and outer walls: 40 x 32 m, 5 m walls, open dusk sky above.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 32), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3(new THREE.Vector3(-20, -0.4, -16), new THREE.Vector3(20, 0, 16)));
  box(40.4, 0.4, 40.4, 0, -0.2, 0, 'concreteDark', false);
  box(0.4, 5, 32.4, -20.2, 2.5, 0, 'concrete');
  box(0.4, 5, 32.4, 20.2, 2.5, 0, 'concrete');
  box(40.4, 5, 0.4, 0, 2.5, -16.2, 'concrete');
  box(40.4, 5, 0.4, 0, 2.5, 16.2, 'concrete');

  // The furnace hall: a long building across mid, with a wide doorway on each side and a
  // central furnace block. It splits mid into two flanks and one long sightline down its face.
  // South wall (z=-5.4) and north wall (z=-1.2) each leave a 4 m doorway at the centre.
  box(7.4, 4.2, 0.6, -5.7, 2.1, -5.4, 'concrete');
  box(7.4, 4.2, 0.6, 5.7, 2.1, -5.4, 'concrete');
  box(7.4, 4.2, 0.6, -5.7, 2.1, -1.2, 'concrete');
  box(7.4, 4.2, 0.6, 5.7, 2.1, -1.2, 'concrete');
  box(0.6, 4.2, 4.8, -9.4, 2.1, -3.3, 'concrete');
  box(0.6, 4.2, 4.8, 9.4, 2.1, -3.3, 'concrete');
  box(19.4, 0.5, 4.8, 0, 4.45, -3.3, 'rust');
  box(2.2, 3.4, 2.2, 0, 1.7, -3.3, 'steel');
  cylinder(0.9, 1.1, 5.2, -6.5, 2.6, -3.4, 'rust');
  cylinder(0.9, 1.1, 5.2, 6.5, 2.6, -3.4, 'rust');
  // A catwalk over the hall's south face, reachable by the crate steps at mid.
  box(6, 0.25, 1.6, 0, 3.0, -4.6, 'steel');
  box(1.1, 1.1, 1.1, -2.4, 0.55, -4.6, 'crate');
  box(1.1, 2.1, 1.1, -2.4, 1.55, -4.6, 'crate');

  // Site A — Furnace (west): container stack, crates, a hazard-marked plant pad.
  box(6, 2.6, 2.4, -17, 1.3, -11, 'container');
  box(6, 2.6, 2.4, -17, 3.9, -11, 'teal');
  box(1.2, 1.2, 1.2, -11.5, 0.6, -6.5, 'crate');
  box(1.2, 1.2, 1.2, -10.3, 0.6, -6.5, 'crate');
  box(1.2, 1.2, 1.2, -10.9, 1.8, -6.5, 'crate');
  cylinder(0.55, 0.55, 1.4, -16.5, 0.7, -5.5, 'rust');
  cylinder(0.55, 0.55, 1.4, -15.3, 0.7, -5.2, 'ochre');
  box(3.2, 0.12, 3.2, -14, 0.06, -9, 'hazard', false);

  // Site B — Depot (east): a raised loading platform with crate steps, barrels, a silo.
  box(7, 1.2, 5, 15.5, 0.6, -11, 'concrete');
  box(1.1, 0.6, 1.1, 11.4, 0.3, -8.6, 'crate');
  box(1.1, 1.2, 1.1, 12.4, 0.6, -9.6, 'crate');
  cylinder(1.4, 1.6, 6.5, 18.2, 3.25, -13.5, 'teal');
  cylinder(0.55, 0.55, 1.4, 12.2, 0.7, -12.8, 'rust');
  cylinder(0.55, 0.55, 1.4, 13.4, 0.7, -13.2, 'ochre');
  box(2.4, 2.4, 2.4, 17.5, 1.2, -6.5, 'container');
  box(3.2, 0.12, 3.2, 14, 0.06, -9, 'hazard', false);

  // Mid cover: crates, a low wall, barrels; the plaza reads at a glance.
  box(3.6, 1.1, 1.2, -4, 0.55, 3, 'crate');
  box(1.2, 1.1, 3.6, 4.5, 0.55, 3, 'crate');
  box(1.2, 1.2, 1.2, 0.5, 0.6, 6.5, 'crate');
  box(1.2, 1.2, 1.2, -0.7, 0.6, 6.5, 'crate');
  box(5, 1.0, 0.6, 0, 0.5, 10.5, 'concrete');
  cylinder(0.55, 0.55, 1.4, -7.5, 0.7, 7.5, 'rust');
  cylinder(0.55, 0.55, 1.4, 7.5, 0.7, 7.5, 'ochre');
  // West and east lane cover.
  box(1.2, 1.1, 3.6, -13.5, 0.55, 4, 'crate');
  box(3.6, 1.1, 1.2, -13.5, 0.55, -1, 'crate');
  box(1.2, 1.1, 3.6, 13.5, 0.55, 4, 'crate');
  box(3.6, 1.1, 1.2, 13.5, 0.55, -1, 'crate');
  box(2.4, 2.4, 2.4, -16, 1.2, 2, 'container');
  box(2.4, 2.4, 2.4, 16, 1.2, 2, 'container');
  // Pipes along the north wall.
  cylinder(0.35, 0.35, 40, 0, 4.4, -15.6, 'steel', 18, Math.PI / 2);
  cylinder(0.22, 0.22, 40, 0, 4.0, -15.6, 'rust', 18, Math.PI / 2);

  // Distant skyline silhouettes beyond the walls, for depth at dusk.
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#12141f') });
  for (let i = 0; i < 14; i += 1) {
    const w = 4 + Math.random() * 8;
    const h = 6 + Math.random() * 14;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), skylineMat);
    const angle = (i / 14) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * 46, h / 2 - 1, Math.sin(angle) * 46);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  }
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3d'), fog: false }),
  );
  sunDisc.position.set(-34, 12, -38);
  sunDisc.lookAt(0, 1, 0);
  scene.add(sunDisc);

  // Site beacons: a glowing ring on the pad and a floating letter, one per site.
  function siteBeacon(x, z, letter, colorName) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.85, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[colorName]), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.14, z);
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PALETTE[colorName];
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(2.2, 2.2, 1);
    sprite.position.set(x, 3.6, z);
    group.add(sprite);
    const light = new THREE.PointLight(new THREE.Color(PALETTE[colorName]), 14, 12, 1.8);
    light.position.set(x, 2.4, z);
    scene.add(light);
    return { ring, sprite, light };
  }
  const beaconA = siteBeacon(-14, -9, 'A', 'ember');
  const beaconB = siteBeacon(14, -9, 'B', 'warden');

  // Light: low amber sun from the west, cool dusk fill, warm hemisphere, and a base
  // ambient so north-facing surfaces never go black.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6a9a'), new THREE.Color('#1b1e2e'), 1.3);
  scene.add(sky);
  scene.add(new THREE.AmbientLight(new THREE.Color('#8a90b0'), 0.35));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 3.0);
  sun.position.set(-18, 10, 14);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a86b8'), 0.9);
  fill.position.set(14, 12, -12);
  scene.add(fill);

  // Segment vs collider test for line of sight: slab method over the world's boxes.
  function segmentBlocked(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    for (const box3 of colliders) {
      let tmin = 0;
      let tmax = 1;
      let blocked = true;
      for (let axis = 0; axis < 3; axis += 1) {
        const o = a.getComponent(axis);
        const d = dir.getComponent(axis);
        const lo = box3.min.getComponent(axis);
        const hi = box3.max.getComponent(axis);
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) { blocked = false; break; }
        } else {
          let t1 = (lo - o) / d;
          let t2 = (hi - o) / d;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { blocked = false; break; }
        }
      }
      if (blocked && tmax > 0.02 && tmin < 0.98) return true;
    }
    return false;
  }

  // Waypoint graph with breadth-first paths.
  const nodes = WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const adjacency = nodes.map(() => []);
  for (const [a, b] of WAY_EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  function nearestNode(p) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - p.x) ** 2 + (nodes[i].z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function findPath(from, to) {
    const start = nearestNode(from);
    const goal = nearestNode(to);
    if (start === goal) return [nodes[goal].clone()];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === goal) break;
      for (const next of adjacency[cur]) {
        if (prev[next] === -1) {
          prev[next] = cur;
          queue.push(next);
        }
      }
    }
    if (prev[goal] === -1) return [nodes[goal].clone()];
    const path = [];
    let cur = goal;
    while (cur !== start) {
      path.unshift(nodes[cur].clone());
      cur = prev[cur];
    }
    return path;
  }

  return {
    colliders,
    shootables,
    group,
    beacons: { A: beaconA, B: beaconB },
    sites: {
      A: { id: 'A', name: 'Furnace', center: new THREE.Vector3(-14, 0, -9), radius: 3.4 },
      B: { id: 'B', name: 'Depot', center: new THREE.Vector3(14, 0, -9), radius: 3.4 },
    },
    spawns: {
      ember: [new THREE.Vector3(-5, 0, 13.5), new THREE.Vector3(-2, 0, 14), new THREE.Vector3(1, 0, 14), new THREE.Vector3(4, 0, 13.5)],
      warden: [new THREE.Vector3(-14, 0, -13.5), new THREE.Vector3(-5, 0, -13.5), new THREE.Vector3(5, 0, -13.5), new THREE.Vector3(14, 0, -13.5)],
    },
    waypoints: { nodes, findPath, nearestNode },
    segmentBlocked,
    bounds: { minX: -19.4, maxX: 19.4, minZ: -15.4, maxZ: 15.4 },
  };
}
