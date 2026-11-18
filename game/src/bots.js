// Bots: 4v4 teammates and opponents with a real loop — perceive, decide, move, fight.
// Attackers push a site (the carrier plants), defenders hold positions and rotate to the
// plant. Bots follow the waypoint graph, see through line of sight, hear nearby gunfire,
// strafe while firing, and plant or defuse the charge.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';

const EMBER_NAMES = ['Ash', 'Cinder', 'Flint'];
const WARDEN_NAMES = ['Bastion', 'Heron', 'Lock', 'Vise'];
const BOT_SPEED = 3.9;
const EYE_HEIGHT = 1.5;
const REACTION = [0.42, 0.75];
const BURST = [3, 5];

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RADIUS = 0.34;
const HEIGHT = 1.72;

function buildBotMesh(team) {
  const group = new THREE.Group();
  const teamColor = team === 'ember' ? PALETTE.ember : PALETTE.warden;
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.85 });
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.15 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const visorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#101318'), roughness: 0.25, metalness: 0.6 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.2), dark);
  legL.position.set(-0.11, 0.375, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), teamMat);
  torso.position.y = 1.09;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.34), dark);
  vest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), skinMat);
  head.position.y = 1.58;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), teamMat);
  helmet.position.y = 1.72;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.05), visorMat);
  visor.position.set(0, 1.6, -0.15);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.22, 1.15, -0.28);
  group.add(legL, legR, torso, vest, head, helmet, visor, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return { group, torso, head, legL, legR, gun };
}

export function createBotManager(deps) {
  const { scene, world, effects, audio, events } = deps;
  const rng = mulberry32(deps.seed || 1337);
  const bots = [];
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  function makeBot(team, name, spawnIndex) {
    const parts = buildBotMesh(team);
    const bot = {
      name,
      team,
      spawnIndex,
      group: parts.group,
      torsoMesh: parts.torso,
      headMesh: parts.head,
      legL: parts.legL,
      legR: parts.legR,
      gunMesh: parts.gun,
      position: new THREE.Vector3(),
      yaw: 0,
      health: 100,
      alive: true,
      weapon: WEAPONS.rifle,
      mag: WEAPONS.rifle.mag,
      reserve: 120,
      cooldown: 0,
      reloadLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      reaction: 0,
      state: 'move',
      path: [],
      pathIndex: 0,
      target: null,
      lastSeen: null,
      lastSeenAt: -99,
      hearPos: null,
      hearAt: -99,
      holdPos: null,
      holdUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      walkPhase: rng() * Math.PI * 2,
      fall: 0,
      plantProgress: 0,
      defuseProgress: 0,
      blindUntil: 0,
      site: null,
      isCarrier: false,
      shotsFired: 0,
    };
    parts.torso.userData = { bot, part: 'torso' };
    parts.head.userData = { bot, part: 'head' };
    parts.legL.userData = { bot, part: 'legs' };
    parts.legR.userData = { bot, part: 'legs' };
    scene.add(parts.group);
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    let ember = 0;
    let warden = 0;
    for (const bot of bots) {
      const spawn = bot.team === 'ember'
        ? world.spawns.ember[ember % world.spawns.ember.length]
        : world.spawns.warden[warden % world.spawns.warden.length];
      if (bot.team === 'ember') ember += 1;
      else warden += 1;
      bot.position.copy(spawn);
      bot.yaw = bot.team === 'ember' ? 0 : Math.PI;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.position);
      bot.group.visible = true;
      bot.state = 'move';
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.lastSeen = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.blindUntil = 0;
      bot.isCarrier = false;
      const roll = rng();
      bot.weapon = roll < 0.15 ? WEAPONS.sniper : roll < 0.4 ? WEAPONS.smg : WEAPONS.rifle;
      bot.mag = bot.weapon.mag;
      bot.reserve = bot.weapon.reserve * 2;
      bot.cooldown = 0;
      bot.reloadLeft = 0;
      bot.burstLeft = 0;
    }
  }

  function init() {
    for (const name of EMBER_NAMES) makeBot('ember', name, 0);
    for (const name of WARDEN_NAMES) makeBot('warden', name, 0);
    spawnAll();
  }

  function eyePos(bot, out) {
    return out.set(bot.position.x, bot.position.y + EYE_HEIGHT, bot.position.z);
  }

  function chestPos(bot, out) {
    return out.set(bot.position.x, bot.position.y + 1.15, bot.position.z);
  }

  function canSee(bot, targetPos) {
    eyePos(bot, tmpA);
    tmpB.copy(targetPos);
    return !world.segmentBlocked(tmpA, tmpB);
  }

  function nearestEnemy(bot) {
    let best = null;
    let bestD = Infinity;
    const player = events.getPlayer();
    if (player.alive && player.team !== bot.team) {
      tmpA.set(player.position.x, player.position.y + 1.2, player.position.z);
      const d = tmpA.distanceToSquared(bot.position);
      if (d < bestD && canSee(bot, tmpA)) {
        bestD = d;
        best = { kind: 'player', pos: tmpA.clone(), dist: Math.sqrt(d) };
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team || other === bot) continue;
      chestPos(other, tmpA);
      const d = tmpA.distanceToSquared(bot.position);
      if (d >= bestD) continue;
      if (canSee(bot, tmpA)) {
        bestD = d;
        best = { kind: 'bot', bot: other, pos: tmpA.clone(), dist: Math.sqrt(d) };
      }
    }
    return best;
  }

  function overlaps(x, y, z) {
    const min = new THREE.Vector3(x - RADIUS, y + 0.04, z - RADIUS);
    const max = new THREE.Vector3(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const c of world.colliders) {
      if (min.x < c.max.x && max.x > c.min.x && min.y < c.max.y && max.y > c.min.y && min.z < c.max.z && max.z > c.min.z) return true;
    }
    return false;
  }

  function moveBot(bot, dx, dz, dt) {
    const step = BOT_SPEED * dt;
    const len = Math.hypot(dx, dz) || 1;
    const mx = (dx / len) * step;
    const mz = (dz / len) * step;
    if (!overlaps(bot.position.x + mx, bot.position.y, bot.position.z)) bot.position.x += mx;
    if (!overlaps(bot.position.x, bot.position.y, bot.position.z + mz)) bot.position.z += mz;
    bot.position.x = Math.max(world.bounds.minX, Math.min(world.bounds.maxX, bot.position.x));
    bot.position.z = Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ, bot.position.z));
  }

  function pickObjective(bot, time) {
    const plant = events.getPlant();
    const charge = events.getCharge();
    if (bot.team === 'ember') {
      if (charge.holder === 'ground' && charge.pos) return charge.pos;
      if (plant.planted) {
        bot.site = plant.site;
        return plant.site === 'A' ? world.sites.A.center : world.sites.B.center;
      }
      if (bot.isCarrier) {
        if (!bot.site) bot.site = rng() < 0.5 ? 'A' : 'B';
        return bot.site === 'A' ? world.sites.A.center : world.sites.B.center;
      }
      const carrier = bots.find((b) => b.alive && b.team === 'ember' && b.isCarrier);
      if (carrier) {
        tmpC.copy(carrier.position);
        tmpC.x += (rng() - 0.5) * 4;
        tmpC.z += (rng() - 0.5) * 4;
        return tmpC;
      }
      return bot.site === 'A' ? world.sites.A.center : world.sites.B.center;
    }
    // Wardens: hold near a site, rotate to the plant or to gunfire.
    if (plant.planted) {
      return plant.site === 'A' ? world.sites.A.center : world.sites.B.center;
    }
    if (time - bot.hearAt < 2.5 && bot.hearPos) return bot.hearPos;
    if (!bot.holdPos || time > bot.holdUntil) {
      const spots = [
        new THREE.Vector3(-11, 0, -7), new THREE.Vector3(-6, 0, -10), new THREE.Vector3(0, 0, -6),
        new THREE.Vector3(6, 0, -10), new THREE.Vector3(11, 0, -7), new THREE.Vector3(-13, 0, -2),
        new THREE.Vector3(13, 0, -2), new THREE.Vector3(0, 0, 2),
      ];
      bot.holdPos = spots[Math.floor(rng() * spots.length)];
      bot.holdUntil = time + 14 + rng() * 10;
    }
    return bot.holdPos;
  }

  function botShoot(bot, target, time) {
    if (bot.reloadLeft > 0 || bot.cooldown > 0) return;
    if (bot.mag <= 0) {
      bot.reloadLeft = bot.weapon.reload;
      return;
    }
    bot.mag -= 1;
    bot.cooldown = bot.weapon.gap;
    bot.shotsFired += 1;
    eyePos(bot, tmpA);
    const aim = tmpB.copy(target.pos);
    const dist = tmpA.distanceTo(aim);
    const spread = 0.02 + dist * 0.0016 + (bot.moving ? 0.02 : 0);
    aim.x += (rng() * 2 - 1) * spread * dist;
    aim.y += (rng() * 2 - 1) * spread * dist * 0.7;
    aim.z += (rng() * 2 - 1) * spread * dist;
    const dir = tmpC.copy(aim).sub(tmpA).normalize();
    // Hit test against the target's body spheres.
    let hitPart = null;
    let hitPoint = null;
    if (target.kind === 'player') {
      const p = events.getPlayer();
      hitPoint = raySphere(tmpA, dir, new THREE.Vector3(p.position.x, p.position.y + 1.55, p.position.z), 0.19, dist + 4);
      if (hitPoint) hitPart = 'head';
      else {
        hitPoint = raySphere(tmpA, dir, new THREE.Vector3(p.position.x, p.position.y + 1.05, p.position.z), 0.38, dist + 4);
        if (hitPoint) hitPart = 'torso';
      }
    } else {
      const other = target.bot;
      hitPoint = raySphere(tmpA, dir, new THREE.Vector3(other.position.x, other.position.y + 1.58, other.position.z), 0.2, dist + 4);
      if (hitPoint) hitPart = 'head';
      else {
        hitPoint = raySphere(tmpA, dir, new THREE.Vector3(other.position.x, other.position.y + 1.1, other.position.z), 0.4, dist + 4);
        if (hitPoint) hitPart = 'torso';
      }
    }
    const muzzle = new THREE.Vector3(tmpA.x + dir.x * 0.7, tmpA.y - 0.08, tmpA.z + dir.z * 0.7);
    const end = hitPoint || new THREE.Vector3(tmpA.x + dir.x * bot.weapon.range, tmpA.y + dir.y * bot.weapon.range, tmpA.z + dir.z * bot.weapon.range);
    effects.tracer(muzzle, end);
    effects.muzzleFlash(muzzle);
    audio.distantShot();
    if (hitPart) {
      const dmg = Math.round(bot.weapon.damage * (hitPart === 'head' ? bot.weapon.headMult : 1));
      if (target.kind === 'player') events.damagePlayer(dmg, bot, hitPart);
      else events.damageBot(target.bot, dmg, hitPart, bot);
      if (hitPoint) effects.impact(hitPoint, dir.clone().negate(), 6);
    }
  }

  function raySphere(origin, dir, center, radius, maxDist) {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const oz = center.z - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0) return null;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    const r2 = radius * radius;
    if (d2 > r2) return null;
    const t = tca - Math.sqrt(r2 - d2);
    if (t < 0 || t > maxDist) return null;
    return new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
  }

  function stepBot(bot, dt, time) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.5;
        bot.group.position.y = -bot.fall * 0.1;
      }
      return;
    }
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) {
        const need = bot.weapon.mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
      }
    }
    const blinded = time < bot.blindUntil;
    const plant = events.getPlant();
    bot.moving = false;

    // Perception, staggered by bot index.
    const seen = blinded ? null : nearestEnemy(bot);
    if (seen) {
      if (!bot.target) bot.reaction = REACTION[0] + rng() * (REACTION[1] - REACTION[0]);
      bot.target = seen;
      bot.lastSeen = seen.pos.clone();
      bot.lastSeenAt = time;
    } else if (bot.target && time - bot.lastSeenAt > 1.2) {
      bot.target = null;
    }

    // Plant / defuse duties.
    if (!blinded && events.isLive()) {
      if (bot.team === 'ember' && bot.isCarrier && !plant.planted) {
        const site = bot.site === 'A' ? world.sites.A : world.sites.B;
        const d = Math.hypot(bot.position.x - site.center.x, bot.position.z - site.center.z);
        if (d < site.radius && !bot.target) {
          bot.state = 'plant';
          bot.plantProgress += dt;
          if (bot.plantProgress >= 3) {
            bot.plantProgress = 0;
            events.plantSite(bot.site, bot);
          }
          bot.group.position.copy(bot.position);
          bot.group.rotation.y = bot.yaw;
          return;
        }
        bot.plantProgress = 0;
      }
      if (bot.team === 'warden' && plant.planted) {
        const site = plant.site === 'A' ? world.sites.A : world.sites.B;
        const d = Math.hypot(bot.position.x - site.center.x, bot.position.z - site.center.z);
        if (d < site.radius && !bot.target) {
          bot.state = 'defuse';
          bot.defuseProgress += dt;
          if (bot.defuseProgress >= 5) {
            bot.defuseProgress = 0;
            events.defuseSite(bot);
          }
          bot.group.position.copy(bot.position);
          bot.group.rotation.y = bot.yaw;
          return;
        }
        bot.defuseProgress = 0;
      }
    }

    if (bot.target && !blinded) {
      // Engage: face the target, strafe, fire in bursts.
      bot.state = 'engage';
      const tp = bot.target.pos;
      const dx = tp.x - bot.position.x;
      const dz = tp.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.reaction -= dt;
      if (time > bot.strafeUntil) {
        bot.strafeDir = rng() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.6 + rng() * 0.9;
      }
      const dist = Math.hypot(dx, dz);
      if (dist > 14) {
        moveBot(bot, dx, dz, dt);
        bot.moving = true;
      } else if (dist < 4) {
        moveBot(bot, -dx, -dz, dt);
        bot.moving = true;
      } else {
        const px = -dz * bot.strafeDir;
        const pz = dx * bot.strafeDir;
        moveBot(bot, px, pz, dt);
        bot.moving = true;
      }
      if (bot.reaction <= 0 && bot.burstPause <= 0) {
        if (bot.burstLeft <= 0) bot.burstLeft = BURST[0] + Math.floor(rng() * (BURST[1] - BURST[0] + 1));
        botShoot(bot, bot.target, time);
        bot.burstLeft -= 1;
        if (bot.burstLeft <= 0) bot.burstPause = 0.5 + rng() * 0.7;
      }
    } else {
      // Move along the waypoint path toward the objective.
      bot.state = 'move';
      const charge = events.getCharge();
      if (bot.team === 'ember' && charge.holder === 'ground' && charge.pos) {
        const d = Math.hypot(bot.position.x - charge.pos.x, bot.position.z - charge.pos.z);
        if (d < 1.6) events.takeCharge(bot);
      }
      const dest = pickObjective(bot, time);
      if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
        bot.path = world.waypoints.findPath(bot.position, dest);
        bot.pathIndex = 0;
      }
      const node = bot.path[bot.pathIndex];
      if (node) {
        const dx = node.x - bot.position.x;
        const dz = node.z - bot.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          bot.pathIndex += 1;
        } else {
          moveBot(bot, dx, dz, dt);
          bot.moving = true;
          bot.yaw = Math.atan2(-dx, -dz);
        }
      }
    }

    // Walk cycle and mesh sync.
    if (bot.moving) bot.walkPhase += dt * 9;
    const swing = bot.moving ? Math.sin(bot.walkPhase) * 0.45 : 0;
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    bot.group.position.copy(bot.position);
    bot.group.rotation.y = bot.yaw;
  }

  function hearShot(position) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = bot.position.distanceTo(position);
      if (d < 26) {
        bot.hearPos = position.clone();
        bot.hearAt = events.getTime();
      }
    }
  }

  function damageBot(bot, amount, part, attacker) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      // Flinch: turn toward the attacker.
      if (attacker && attacker.position) {
        const dx = attacker.position.x - bot.position.x;
        const dz = attacker.position.z - bot.position.z;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.target = null;
        bot.lastSeen = attacker.position.clone ? attacker.position.clone() : null;
      }
      return false;
    }
    bot.alive = false;
    bot.health = 0;
    bot.fall = 0;
    bot.target = null;
    if (bot.isCarrier) {
      bot.isCarrier = false;
      events.dropCharge(bot.position);
    }
    return true;
  }

  function flashBot(bot, until) {
    if (bot.alive) bot.blindUntil = Math.max(bot.blindUntil, until);
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  function step(dt, time) {
    for (const bot of bots) stepBot(bot, dt, time);
  }

  init();

  return {
    bots,
    step,
    spawnAll,
    hearShot,
    damageBot,
    flashBot,
    aliveCount,
    eyePos,
    chestPos,
    setCarrier(bot) {
      for (const b of bots) b.isCarrier = false;
      if (bot) bot.isCarrier = true;
    },
    getCarrier() {
      return bots.find((b) => b.alive && b.isCarrier) || null;
    },
  };
}
