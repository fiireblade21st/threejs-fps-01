// EMBER YARD — a round-based tactical FPS in three.js (single player vs bots).
//
// Design notes (what this game is, for the reader):
// - Two teams, 4v4: Ember attacks, Wardens defend. Short rounds, first to 5 wins.
// - The objective is a charge: Ember plants it at site A (Furnace) or B (Depot) by
//   holding E; it detonates after 35 s unless a Warden defuses it (hold E, 5 s).
//   A round also ends when a team is eliminated, or on the timer when no charge is planted.
// - Money between rounds ($800 start, $300 a kill, $3,250 a round win, $1,900 a loss)
//   buys weapons in the buy menu (B): SMG, rifle, sniper, frag and flash grenades.
// - Gunplay: hitscan with headshot damage, recoil and spread that punish firing on the
//   move, crouching, jumping, and collision with the map, so stopping to aim pays.
// - Bots follow a waypoint graph, hold sites, rotate to gunfire and to the plant, react
//   to what they see and hear, strafe while firing, and plant or defuse the charge.
// - The map is an original foundry yard at dusk: three lanes, a furnace hall with two
//   doorways, a catwalk, a raised depot platform, containers, crates and pipes.
// - Sound is synthesised with WebAudio; textures are drawn on canvas. No files, no network.
//
// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS, GRENADE_DEFS } from './weapons.js';
import { createBotManager } from './bots.js';
import { createEconomy, BUY_MENU, KILL_REWARD, ROUND_WIN_REWARD, ROUND_LOSS_REWARD, PLANT_REWARD, DEFUSE_REWARD } from './economy.js';
import { createRounds, PLANT_SECONDS, WIN_ROUNDS } from './rounds.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

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
const random = mulberry32(seed * 7919 + 13);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const economy = createEconomy();
const player = createPlayer(world.colliders);
const rig = createWeaponRig(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 140;

const body = player.state;
const playerState = { name: 'You', team: 'ember', health: 100, alive: true, position: body.position };

// The charge: carried by the player, by a bot, planted, or dropped on the ground.
const charge = { holder: 'player', bot: null, pos: null };
const chargeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 0.22, 0.4),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 0.7, roughness: 0.4 }),
);
chargeMesh.visible = false;
scene.add(chargeMesh);
const chargeLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 8, 1.8);
scene.add(chargeLight);

const grenades = [];
let elapsed = 0;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let shake = 0;
let blindUntil = 0;
let plantProgress = 0;
let scoped = false;
let buyOpen = false;
let keptWeapon = null;
let matchOver = false;
const direction = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

function aliveOnTeam(team) {
  let count = playerState.alive && playerState.team === team ? 1 : 0;
  count += botManager.aliveCount(team);
  return count;
}

const rounds = createRounds({
  onPhase(phase, match) {
    if (phase === 'buy') {
      respawnAll();
      hud.setScores(match.scores.ember, match.scores.warden, match.round);
      hud.setTimer(match.timer, 'buy');
      hud.showBanner(`ROUND ${match.round}`, 'Buy your weapons — press B', '');
      openBuyMenu();
    } else if (phase === 'live') {
      hud.hideBuyMenu();
      buyOpen = false;
      hud.showBanner(`ROUND ${match.round}`, 'Go — plant the charge or eliminate the Wardens', '');
    }
  },
  onRoundEnd(winner, reason, match) {
    const playerWon = winner === 'ember';
    economy.award(playerWon ? ROUND_WIN_REWARD : ROUND_LOSS_REWARD);
    keptWeapon = playerState.alive ? { id: rig.state.def.id, mag: rig.state.mag, reserve: rig.state.reserve } : null;
    hud.setMoney(economy.money);
    hud.setScores(match.scores.ember, match.scores.warden, match.round);
    if (match.phase === 'matchEnd') {
      matchOver = true;
      const won = match.scores.ember > match.scores.warden;
      hud.showBanner(won ? 'EMBER WINS THE MATCH' : 'WARDENS WIN THE MATCH', `${match.scores.ember} — ${match.scores.warden} · ${reason}`, won ? 'win' : 'lose');
      if (won) audio.roundWin();
      else audio.roundLose();
      hud.showOverlay('end', {
        title: won ? 'Ember wins the match' : 'Wardens win the match',
        copy: `Final score ${match.scores.ember} — ${match.scores.warden}. ${reason}.`,
        action: 'Play again',
      });
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      hud.showBanner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason, playerWon ? 'win' : 'lose');
      if (playerWon) audio.roundWin();
      else audio.roundLose();
    }
  },
  onPlant(site) {
    hud.showBanner(`CHARGE PLANTED — SITE ${site}`, 'Defend it until it detonates', 'win');
    audio.plantBeep(true);
    botManager.setCarrier(null);
    charge.holder = null;
    charge.bot = null;
  },
  onExplode(site) {
    const center = world.sites[site].center;
    tmpV.set(center.x, 0.4, center.z);
    effects.explosion(tmpV);
    audio.explosion();
    shake = 1;
    if (playerState.alive) {
      const d = playerState.position.distanceTo(tmpV);
      if (d < 12) damagePlayer(Math.round(120 - d * 8), null, 'torso');
    }
  },
});

const botManager = createBotManager({
  scene,
  world,
  effects,
  audio,
  seed: seed * 31 + 7,
  events: {
    getPlayer() {
      return playerState;
    },
    getTime() {
      return elapsed;
    },
    isLive() {
      return rounds.match.phase === 'live';
    },
    getPlant() {
      return rounds.match.plant;
    },
    getCharge() {
      return charge;
    },
    takeCharge(bot) {
      charge.holder = 'bot';
      charge.bot = bot;
      botManager.setCarrier(bot);
      charge.pos = null;
    },
    dropCharge(pos) {
      charge.holder = 'ground';
      charge.bot = null;
      charge.pos = pos.clone();
      charge.pos.y = 0.15;
    },
    plantSite(site, bot) {
      rounds.plant(site, bot);
    },
    defuseSite() {
      rounds.defuse();
    },
    damagePlayer(amount, attacker, part) {
      damagePlayer(amount, attacker, part);
    },
    damageBot(bot, amount, part, attacker) {
      if (botManager.damageBot(bot, amount, part, attacker)) {
        onKill(attacker, bot, part);
      }
    },
  },
});

function respawnAll() {
  // Player respawns at the Ember spawn with the kept weapon or the sidearm.
  body.position.copy(world.spawns.ember[0]);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  playerState.health = 100;
  playerState.alive = true;
  if (keptWeapon && economy.owned.weapons[keptWeapon.id]) {
    rig.equip(WEAPONS[keptWeapon.id], { mag: keptWeapon.mag, reserve: keptWeapon.reserve });
  } else {
    rig.equip(WEAPONS.pistol);
  }
  economy.owned.grenades = { frag: 0, flash: 0 };
  botManager.spawnAll();
  charge.holder = 'player';
  charge.bot = null;
  charge.pos = null;
  plantProgress = 0;
  blindUntil = 0;
  scoped = false;
  setScoped(false);
  hud.setHealth(100);
  hud.setCharge(true);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.def.name);
  hud.setMoney(economy.money);
  hud.setPlant(null);
  hud.hidePrompt();
  syncCamera();
}

function onKill(attacker, victim, part) {
  const attackerInfo = attacker === playerState
    ? { name: 'You', team: 'ember' }
    : attacker ? { name: attacker.name, team: attacker.team } : { name: '?', team: 'ember' };
  const victimInfo = victim === playerState
    ? { name: 'You', team: 'ember' }
    : { name: victim.name, team: victim.team };
  const weaponName = attacker === playerState ? rig.state.def.name : attacker && attacker.weapon ? attacker.weapon.name : 'Rifle';
  hud.killfeed(attackerInfo, victimInfo, part === 'head', weaponName);
  if (attacker === playerState) {
    economy.award(KILL_REWARD);
    hud.setMoney(economy.money);
    hud.hitMarker(true, 300);
    audio.kill();
  }
  if (victim === playerState) {
    playerState.alive = false;
    if (charge.holder === 'player') {
      charge.holder = 'ground';
      charge.pos = playerState.position.clone();
      charge.pos.y = 0.15;
      hud.setCharge(false);
    }
    hud.showBanner('ELIMINATED', `Taken down by ${attackerInfo.name}. Your team fights on.`, 'lose');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  checkElimination();
}

function checkElimination() {
  if (rounds.match.phase !== 'live') return;
  const emberAlive = aliveOnTeam('ember');
  const wardenAlive = aliveOnTeam('warden');
  if (wardenAlive === 0) {
    rounds.endRound('ember', 'Warden team eliminated');
  } else if (emberAlive === 0) {
    if (!rounds.match.plant.planted) rounds.endRound('warden', 'Ember team eliminated');
    // With the charge planted, the round plays on until it detonates or is defused.
  }
}

function damagePlayer(amount, attacker, part) {
  if (!playerState.alive || rounds.match.phase !== 'live') return;
  playerState.health -= amount;
  hud.setHealth(playerState.health);
  hud.damageFlash();
  audio.hurt();
  shake = Math.min(1, shake + 0.25);
  if (playerState.health <= 0) {
    playerState.health = 0;
    hud.setHealth(0);
    onKill(attacker || { name: 'Wardens', team: 'warden' }, playerState, part);
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shake > 0) {
    camera.position.x += (random() - 0.5) * shake * 0.12;
    camera.position.y += (random() - 0.5) * shake * 0.12;
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function setScoped(on) {
  scoped = on;
  rig.setScoped(on);
  camera.fov = on ? 34 : 74;
  camera.updateProjectionMatrix();
}

function openBuyMenu() {
  if (rounds.match.phase !== 'buy') return;
  buyOpen = true;
  hud.showBuyMenu(BUY_MENU, economy.money, economy.owned);
}

function closeBuyMenu() {
  buyOpen = false;
  hud.hideBuyMenu();
}

function buyItem(item) {
  if (rounds.match.phase !== 'buy') return;
  if (item.kind === 'weapon') {
    if (economy.owned.weapons[item.id]) {
      rig.equip(WEAPONS[item.id]);
      hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.def.name);
      audio.buy();
      hud.showBuyMenu(BUY_MENU, economy.money, economy.owned);
      return;
    }
    if (economy.buy(item)) {
      rig.equip(WEAPONS[item.id]);
      hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.def.name);
      audio.buy();
    } else {
      audio.dryClick();
    }
  } else if (economy.buy(item)) {
    audio.buy();
  } else {
    audio.dryClick();
  }
  hud.setMoney(economy.money);
  hud.showBuyMenu(BUY_MENU, economy.money, economy.owned);
}

function throwGrenade(kind) {
  if (!playerState.alive || rounds.match.phase !== 'live') return;
  if (!economy.spendGrenade(kind)) {
    audio.dryClick();
    return;
  }
  camera.getWorldDirection(direction);
  const def = GRENADE_DEFS[kind];
  const pos = new THREE.Vector3(camera.position.x + direction.x * 0.5, camera.position.y - 0.1, camera.position.z + direction.z * 0.5);
  const vel = direction.clone().multiplyScalar(16);
  vel.y += 3.5;
  grenades.push({ pos, vel, fuse: def.fuse, kind, owner: playerState });
  audio.buy();
}

function detonateGrenade(g) {
  if (g.kind === 'frag') {
    effects.explosion(g.pos);
    audio.explosion();
    shake = Math.min(1, shake + 0.5);
    const def = GRENADE_DEFS.frag;
    const targets = [];
    if (playerState.alive) targets.push({ pos: playerState.position, isPlayer: true });
    for (const bot of botManager.bots) if (bot.alive) targets.push({ pos: bot.position, isPlayer: false, bot });
    for (const t of targets) {
      const d = Math.hypot(t.pos.x - g.pos.x, t.pos.z - g.pos.z) + Math.abs((t.pos.y + 1) - g.pos.y) * 0.5;
      if (d > def.radius) continue;
      const dmg = Math.round(def.damage * (1 - (d / def.radius) * 0.7));
      if (t.isPlayer) {
        if (g.owner !== playerState) damagePlayer(dmg, null, 'torso');
        else if (d < 2.5) damagePlayer(Math.round(dmg * 0.5), null, 'torso');
      } else if (botManager.damageBot(t.bot, dmg, 'torso', g.owner)) {
        onKill(g.owner, t.bot, 'torso');
      }
    }
  } else {
    effects.muzzleFlash(g.pos);
    audio.flash();
    const def = GRENADE_DEFS.flash;
    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const d = bot.position.distanceTo(g.pos);
      if (d > def.radius) continue;
      tmpV.set(bot.position.x, bot.position.y + 1.5, bot.position.z);
      if (world.segmentBlocked(g.pos, tmpV)) continue;
      botManager.flashBot(bot, elapsed + 2.5 * (1 - d / def.radius) + 0.5);
    }
    if (playerState.alive) {
      const d = camera.position.distanceTo(g.pos);
      if (d < def.radius) {
        camera.getWorldDirection(direction);
        tmpV.copy(g.pos).sub(camera.position).normalize();
        const facing = direction.dot(tmpV);
        if (facing > 0 && !world.segmentBlocked(camera.position, g.pos)) {
          const strength = Math.max(0.35, 1 - d / def.radius);
          hud.flashBlind(strength);
          blindUntil = elapsed + 1.6 * strength;
        }
      }
    }
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    const next = tmpV.copy(g.pos).addScaledVector(g.vel, dt);
    if (next.y < 0.12) {
      next.y = 0.12;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    for (const c of world.colliders) {
      if (next.x > c.min.x && next.x < c.max.x && next.y > c.min.y && next.y < c.max.y && next.z > c.min.z && next.z < c.max.z) {
        g.vel.x *= -0.4;
        g.vel.z *= -0.4;
        next.copy(g.pos);
        break;
      }
    }
    g.pos.copy(next);
    if (g.fuse <= 0) {
      detonateGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function shoot(spread) {
  if (!rig.takeRound()) {
    audio.dryClick();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const shootables = world.shootables.slice();
  for (const bot of botManager.bots) {
    if (!bot.alive) continue;
    shootables.push(bot.torsoMesh, bot.headMesh, bot.legL, bot.legR);
  }
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const muzzle = tmpV2.copy(camera.position).addScaledVector(direction, 0.7);
  muzzle.y -= 0.12;
  effects.tracer(muzzle, hit ? hit.point : tmpV.copy(camera.position).addScaledVector(direction, rig.state.def.range));
  effects.muzzleFlash(muzzle);
  audio.shot(rig.state.def.kind);
  botManager.hearShot(camera.position);
  if (hit) {
    const ud = hit.object.userData;
    if (ud && ud.bot) {
      const part = ud.part;
      const dmg = Math.round(rig.state.def.damage * (part === 'head' ? rig.state.def.headMult : part === 'legs' ? 0.8 : 1));
      hud.hitMarker(false, 90);
      audio.hit();
      if (botManager.damageBot(ud.bot, dmg, part, playerState)) {
        onKill(playerState, ud.bot, part);
      }
    } else {
      effects.impact(hit.point, hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).negate() : direction.clone().negate(), 8);
    }
  }
  rig.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.def.name);
  return true;
}

function step(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 1.6);
  rounds.step(dt);
  if (rounds.match.phase === 'live' || rounds.match.phase === 'buy') {
    if (playerState.alive) player.step(dt, input.state.keys);
    rig.step(dt);
    botManager.step(dt, elapsed);
    stepGrenades(dt);
    effects.step(dt);
    if (charge.holder === 'ground' && charge.pos && playerState.alive) {
      const d = Math.hypot(playerState.position.x - charge.pos.x, playerState.position.z - charge.pos.z);
      if (d < 1.6) {
        charge.holder = 'player';
        charge.pos = null;
        hud.setCharge(true);
      }
    }
    // Planting: hold E inside a site while carrying the charge.
    if (playerState.alive && rounds.match.phase === 'live' && charge.holder === 'player') {
      const site = nearestSite(playerState.position);
      if (site && input.state.keys.has('KeyE')) {
        plantProgress += dt;
        hud.setPlant(plantProgress / PLANT_SECONDS, `PLANTING CHARGE — SITE ${site.id}`);
        if (plantProgress >= PLANT_SECONDS) {
          plantProgress = 0;
          hud.setPlant(null);
          economy.award(PLANT_REWARD);
          hud.setMoney(economy.money);
          hud.setCharge(false);
          rounds.plant(site.id, playerState);
        }
      } else {
        plantProgress = 0;
        hud.setPlant(null);
        if (site) hud.showPrompt('Hold <kbd>E</kbd> to plant the charge');
        else hud.hidePrompt();
      }
    } else {
      plantProgress = 0;
      hud.setPlant(null);
      hud.hidePrompt();
    }
  }
  // Charge marker on the ground.
  if (charge.holder === 'ground' && charge.pos) {
    chargeMesh.visible = true;
    chargeMesh.position.copy(charge.pos);
    chargeMesh.rotation.y += dt * 2;
    chargeLight.position.copy(charge.pos);
    chargeLight.position.y += 0.5;
    chargeLight.intensity = 6;
  } else {
    chargeMesh.visible = false;
    chargeLight.intensity = 0;
  }
  // HUD sync.
  hud.setTimer(rounds.match.timer, rounds.match.phase);
  hud.setScores(rounds.match.scores.ember, rounds.match.scores.warden, rounds.match.round);
  hud.setCrosshairSpread(4 + rig.spread(player.groundSpeed()) * 900 + (scoped ? -3 : 0));
}

function nearestSite(pos) {
  for (const key of ['A', 'B']) {
    const site = world.sites[key];
    if (Math.hypot(pos.x - site.center.x, pos.z - site.center.z) < site.radius) return site;
  }
  return null;
}

function handlePressed() {
  for (const code of input.takePressed()) {
    if (code === 'KeyB') {
      if (rounds.match.phase === 'buy') {
        if (buyOpen) closeBuyMenu();
        else openBuyMenu();
      }
    } else if (code === 'KeyR') {
      if (rig.reload()) audio.reload();
    } else if (code === 'KeyG') {
      throwGrenade('frag');
    } else if (code === 'KeyF') {
      throwGrenade('flash');
    } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4' || code === 'Digit5') {
      if (buyOpen) buyItem(BUY_MENU[Number(code.slice(-1)) - 1]);
      else if (rounds.match.phase === 'live') {
        const idx = Number(code.slice(-1));
        if (idx === 1 && economy.owned.weapons.smg) rig.equip(WEAPONS.smg);
        if (idx === 2 && economy.owned.weapons.rifle) rig.equip(WEAPONS.rifle);
        if (idx === 3 && economy.owned.weapons.sniper) rig.equip(WEAPONS.sniper);
        if (idx === 4 && economy.owned.weapons.pistol) rig.equip(WEAPONS.pistol);
        hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.def.name);
      }
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (elapsed < blindUntil) {
      player.look(look.x * 0.4 + (random() - 0.5) * 2, look.y * 0.4);
    } else {
      player.look(look.x, look.y);
    }
    handlePressed();
    if (input.state.firing && rig.ready() && playerState.alive && rounds.match.phase === 'live' && elapsed >= blindUntil) {
      shoot(rig.spread(player.groundSpeed()));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function setPlayerPose(x, z, yaw, pitch) {
  body.position.set(x, 0, z);
  body.velocity.set(0, 0, 0);
  body.yaw = yaw;
  body.pitch = pitch || 0;
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuyMenu();
  buyOpen = false;
  const match = rounds.match;
  if (name === 'start') {
    match.phase = 'buy';
    match.timer = 11;
    match.round = 1;
    setPlayerPose(-3, 13, 0.12, 0.02);
    economy.reset();
    rig.equip(WEAPONS.pistol);
    hud.setMoney(800);
    hud.setHealth(100);
    hud.setAmmo(12, 48, 'P9 Sidearm');
    hud.setCharge(true);
    openBuyMenu();
    settle(10);
    aimAt(new THREE.Vector3(0, 1.6, -6));
  } else if (name === 'play') {
    match.phase = 'live';
    match.timer = 62;
    match.round = 1;
    match.scores = { ember: 0, warden: 0 };
    economy.reset();
    economy.award(1650);
    rig.equip(WEAPONS.rifle, { mag: 24, reserve: 90 });
    playerState.health = 78;
    hud.setHealth(78);
    hud.setMoney(economy.money);
    setPlayerPose(-2, 7.5, 0, 0);
    const wardens = botManager.bots.filter((b) => b.team === 'warden');
    const embers = botManager.bots.filter((b) => b.team === 'ember');
    wardens[0].position.set(-3, 0, 1.5);
    wardens[0].yaw = Math.PI;
    wardens[1].position.set(4.5, 0, 0.5);
    wardens[1].yaw = Math.PI;
    embers[0].position.set(-6.5, 0, 5);
    embers[0].yaw = 0.4;
    settle(10);
    aimAt(new THREE.Vector3(-3, 1.2, 1.5));
    shoot(0);
    settle(1);
    hud.hitMarker(false, 60000);
  } else if (name === 'plant') {
    match.phase = 'live';
    match.timer = 38;
    match.round = 2;
    match.scores = { ember: 1, warden: 0 };
    economy.reset();
    economy.award(2200);
    rig.equip(WEAPONS.rifle, { mag: 27, reserve: 60 });
    playerState.health = 100;
    hud.setHealth(100);
    hud.setMoney(economy.money);
    setPlayerPose(-11.5, -5.5, 0, 0);
    const wardens = botManager.bots.filter((b) => b.team === 'warden');
    wardens[0].position.set(-16.5, 0, -6.5);
    wardens[0].yaw = -1.8;
    wardens[1].position.set(-10, 0, -12.5);
    wardens[1].yaw = 0.6;
    settle(10);
    aimAt(new THREE.Vector3(-14, 1.2, -9));
    plantProgress = PLANT_SECONDS * 0.7;
    hud.setPlant(0.7, 'PLANTING CHARGE — SITE A');
    hud.showPrompt('Hold E to plant the charge');
  } else {
    // end: round won, one Warden down in view, banner up.
    match.phase = 'end';
    match.timer = 3;
    match.round = 1;
    match.scores = { ember: 1, warden: 0 };
    economy.reset();
    rig.equip(WEAPONS.rifle, { mag: 18, reserve: 90 });
    playerState.health = 64;
    hud.setHealth(64);
    hud.setMoney(3250);
    setPlayerPose(1, 6, 0, 0);
    const wardens = botManager.bots.filter((b) => b.team === 'warden');
    const w = wardens[0];
    w.alive = false;
    w.fall = 1;
    w.position.set(-3, 0, 1.5);
    w.group.position.copy(w.position);
    w.group.rotation.set(-1.5, 0.6, 0);
    settle(10);
    aimAt(new THREE.Vector3(-3, 0.9, 1.5));
    hud.showBanner('ROUND WON', 'Warden team eliminated', 'win');
    hud.setScores(1, 0, 1);
  }
  hud.setTimer(match.timer, match.phase);
  hud.setScores(match.scores.ember, match.scores.warden, match.round);
  hud.setAmmo(rig.state.mag, rig.state.reserve, rig.state.def.name);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('contextmenu', (event) => {
  if (event.target === renderer.domElement) event.preventDefault();
});
window.addEventListener('mousedown', (event) => {
  if (event.button === 2 && input.state.locked && rig.state.def.id === 'sniper' && playerState.alive) {
    setScoped(!scoped);
  }
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (matchOver) {
    matchOver = false;
    rounds.reset();
    economy.reset();
    keptWeapon = null;
    respawnAll();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (rounds.match.phase === 'buy' || rounds.match.phase === 'live') {
    input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (rounds.match.phase === 'buy' && !buyOpen) openBuyMenu();
  } else if (!matchOver) {
    hud.showOverlay(started ? 'paused' : 'start');
    closeBuyMenu();
  }
}

// Initial state: round 1 buy phase, player carries the charge.
respawnAll();
hud.setScores(0, 0, 1);
hud.setTimer(12, 'buy');
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
