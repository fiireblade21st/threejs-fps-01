// The economy: money earned each round and spent in the buy menu. One table owns every
// price and every award, so the buy menu and the round rewards can never disagree.
import { WEAPONS, GRENADE_DEFS } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const ROUND_WIN_REWARD = 3250;
export const ROUND_LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;
export const DEFUSE_REWARD = 300;

export const BUY_MENU = [
  { key: '1', id: 'smg', kind: 'weapon', name: WEAPONS.smg.name, price: WEAPONS.smg.price, note: 'Fast, close range' },
  { key: '2', id: 'rifle', kind: 'weapon', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, note: 'Accurate, all-round' },
  { key: '3', id: 'sniper', kind: 'weapon', name: WEAPONS.sniper.name, price: WEAPONS.sniper.price, note: 'One shot, long range' },
  { key: '4', id: 'frag', kind: 'grenade', name: GRENADE_DEFS.frag.name, price: GRENADE_DEFS.frag.price, note: 'Explosive damage' },
  { key: '5', id: 'flash', kind: 'grenade', name: GRENADE_DEFS.flash.name, price: GRENADE_DEFS.flash.price, note: 'Blinds the enemy' },
];

export function createEconomy() {
  let money = START_MONEY;
  const owned = {
    weapons: { pistol: true },
    grenades: { frag: 0, flash: 0 },
  };

  return {
    get money() {
      return money;
    },
    owned,
    reset() {
      money = START_MONEY;
      owned.weapons = { pistol: true };
      owned.grenades = { frag: 0, flash: 0 };
    },
    award(amount) {
      money += amount;
    },
    canAfford(price) {
      return money >= price;
    },
    buy(item) {
      if (money < item.price) return false;
      money -= item.price;
      if (item.kind === 'weapon') owned.weapons[item.id] = true;
      else owned.grenades[item.id] = (owned.grenades[item.id] || 0) + 1;
      return true;
    },
    spendGrenade(id) {
      if ((owned.grenades[id] || 0) <= 0) return false;
      owned.grenades[id] -= 1;
      return true;
    },
  };
}
