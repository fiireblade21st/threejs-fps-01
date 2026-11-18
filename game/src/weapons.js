// Weapons: one table owns every number, so balance lives in one place. The view model is a
// small low-poly gun built from boxes, with a muzzle flash quad and a kick animation.
// Spread punishes firing on the move; headshots deal the head multiplier.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 26, headMult: 3.0, mag: 12, reserve: 48, gap: 0.16, reload: 1.4,
    spreadStill: 0.004, spreadMove: 0.03, auto: false, range: 45, zoom: 1,
  },
  smg: {
    id: 'smg', name: 'Rasp-9 SMG', kind: 'smg', price: 1500,
    damage: 24, headMult: 2.6, mag: 32, reserve: 96, gap: 0.075, reload: 1.7,
    spreadStill: 0.008, spreadMove: 0.034, auto: true, range: 38, zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'Kestrel VK Rifle', kind: 'rifle', price: 2700,
    damage: 33, headMult: 3.0, mag: 30, reserve: 90, gap: 0.096, reload: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, auto: true, range: 70, zoom: 1,
  },
  sniper: {
    id: 'sniper', name: 'Longshot DMR', kind: 'sniper', price: 4750,
    damage: 82, headMult: 2.0, mag: 5, reserve: 15, gap: 1.1, reload: 2.6,
    spreadStill: 0.0006, spreadMove: 0.09, auto: false, range: 120, zoom: 2.2,
  },
};

export const GRENADE_DEFS = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, damage: 85, radius: 6.5, fuse: 1.5 },
  flash: { id: 'flash', name: 'Flash Grenade', price: 200, radius: 14, fuse: 1.4 },
};

const VIEW_MODELS = {
  pistol: { receiver: [0.07, 0.09, 0.26], barrel: [0.04, 0.04, 0.16], grip: [0.06, 0.12, 0.07], pos: [0.22, -0.2, -0.4] },
  smg: { receiver: [0.08, 0.1, 0.4], barrel: [0.04, 0.04, 0.26], grip: [0.06, 0.12, 0.07], mag: [0.05, 0.16, 0.07], pos: [0.22, -0.2, -0.42] },
  rifle: { receiver: [0.09, 0.11, 0.46], barrel: [0.045, 0.045, 0.42], grip: [0.07, 0.13, 0.08], mag: [0.06, 0.18, 0.08], stock: [0.075, 0.09, 0.24], pos: [0.24, -0.2, -0.44] },
  sniper: { receiver: [0.08, 0.1, 0.62], barrel: [0.035, 0.035, 0.55], grip: [0.06, 0.12, 0.07], mag: [0.05, 0.12, 0.06], scope: [0.06, 0.06, 0.2], pos: [0.24, -0.2, -0.46] },
};

export function createWeaponRig(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concreteDark), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, metalness: 0.2 });

  let model = null;
  let flash = null;
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 6);
  camera.add(flashLight);

  const state = {
    def: WEAPONS.pistol,
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    scoped: false,
  };

  function buildModel(def) {
    if (model) {
      camera.remove(model);
      model.traverse((child) => {
        if (child.isMesh) child.geometry.dispose();
      });
    }
    if (flash) {
      camera.remove(flash);
      flash.geometry.dispose();
    }
    const spec = VIEW_MODELS[def.id];
    model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), bodyMat);
    model.add(receiver);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), gripMat);
    barrel.position.set(0, 0.02, -spec.receiver[2] / 2 - spec.barrel[2] / 2 + 0.05);
    model.add(barrel);
    if (spec.mag) {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(...spec.mag), gripMat);
      mag.position.set(0, -0.1, -0.02);
      mag.rotation.x = 0.15;
      model.add(mag);
    }
    if (spec.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(...spec.stock), gripMat);
      stock.position.set(0, -0.02, spec.receiver[2] / 2 + spec.stock[2] / 2 - 0.04);
      model.add(stock);
    }
    if (spec.scope) {
      const scope = new THREE.Mesh(new THREE.BoxGeometry(...spec.scope), accentMat);
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
    }
    model.position.set(...spec.pos);
    camera.add(model);

    flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.set(spec.pos[0], spec.pos[1] + 0.02, -1.1);
    flash.visible = false;
    camera.add(flash);
    flashLight.position.set(spec.pos[0], spec.pos[1] + 0.04, -0.7);
  }

  buildModel(state.def);

  function equip(def, ammo) {
    state.def = def;
    state.mag = ammo ? ammo.mag : def.mag;
    state.reserve = ammo ? ammo.reserve : def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.scoped = false;
    buildModel(def);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (model) {
      model.position.z = VIEW_MODELS[state.def.id].pos[2] + state.kick;
      model.rotation.x = state.kick * 2.2;
      if (state.reloadLeft > 0) {
        model.rotation.x = -0.55 * Math.min(1, (state.def.reload - state.reloadLeft) * 2);
      }
    }
    if (flash) {
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
    }
    flashLight.intensity = state.flash > 0 ? 10 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.gap;
      state.flash = 0.06;
      state.kick = state.def.id === 'sniper' ? 0.12 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reload;
      return true;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.2);
      return state.def.spreadStill + moving * state.def.spreadMove;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    setScoped(on) {
      state.scoped = on;
      if (model) model.visible = !on;
    },
  };
}
