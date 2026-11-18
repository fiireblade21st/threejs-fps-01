// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, scores, kill feed,
// buy menu, plant bar and the overlay panels. It never touches the simulation; main.js
// pushes numbers in and reads callbacks out. In ?shot= capture mode, banners and the
// hit marker stay up: a real-time timeout would clear them before the frozen frame.
const SHOT_MODE = new URLSearchParams(window.location.search).has('shot');
const COPY = {
  start: {
    title: 'EMBER YARD',
    copy: 'Round-based tactical FPS. Plant the charge at A or B — or eliminate the Wardens. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBER YARD',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const healthFill = el('health-fill');
  const healthValue = el('health-value');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const roundValue = el('round-value');
  const scoreEmber = el('score-ember');
  const scoreWarden = el('score-warden');
  const killfeed = el('killfeed');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyMenu = el('buy-menu');
  const buyList = el('buy-list');
  const buyMoney = el('buy-money');
  const plantBar = el('plant-bar');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const prompt = el('prompt');
  const vignette = el('vignette');
  const flashOverlay = el('flash-overlay');
  const hitmarker = el('hitmarker');
  const crosshair = el('crosshair');
  const chargeTag = el('charge-tag');
  const phaseTag = el('phase-tag');

  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      if (v === lastHealth) return;
      lastHealth = v;
      healthFill.style.width = `${v}%`;
      healthFill.style.background = v > 50 ? 'var(--health)' : v > 25 ? 'var(--accent)' : 'var(--danger)';
      healthValue.textContent = String(v);
    },
    setAmmo(mag, reserve, name) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      if (name) weaponName.textContent = name;
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const text = formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', phase === 'live' && seconds < 15);
      phaseTag.textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND LIVE' : '';
    },
    setScores(ember, warden, round) {
      const key = `${ember}-${warden}-${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreEmber.textContent = String(ember);
      scoreWarden.textContent = String(warden);
      roundValue.textContent = `ROUND ${round}`;
    },
    setCharge(carrying) {
      chargeTag.hidden = !carrying;
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--spread', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitmarker._t);
      if (!SHOT_MODE) hitmarker._t = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      clearTimeout(vignette._t);
      vignette._t = setTimeout(() => vignette.classList.remove('on'), 220);
    },
    flashBlind(strength) {
      flashOverlay.style.opacity = String(Math.min(1, strength));
      clearTimeout(flashOverlay._t);
      flashOverlay._t = setTimeout(() => { flashOverlay.style.opacity = '0'; }, 900);
    },
    killfeed(killer, victim, headshot, weapon) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      const killerSpan = document.createElement('span');
      killerSpan.className = killer.team === 'ember' ? 'feed-ember' : 'feed-warden';
      killerSpan.textContent = killer.name;
      const weaponSpan = document.createElement('span');
      weaponSpan.className = 'feed-weapon';
      weaponSpan.textContent = headshot ? ` ⌖ ${weapon}` : ` ${weapon}`;
      const victimSpan = document.createElement('span');
      victimSpan.className = victim.team === 'ember' ? 'feed-ember' : 'feed-warden';
      victimSpan.textContent = victim.name;
      line.append(killerSpan, weaponSpan, victimSpan);
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(titleText, subText, kind) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText || '';
      banner.className = `show ${kind || ''}`;
      clearTimeout(bannerTimer);
      if (!SHOT_MODE) bannerTimer = setTimeout(() => banner.classList.remove('show'), 3200);
    },
    hideBanner() {
      banner.classList.remove('show');
    },
    showBuyMenu(items, money, owned) {
      buyList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'buy-row';
        const ownedTag = item.kind === 'weapon' && owned.weapons[item.id] ? 'OWNED' : '';
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-note">${item.note}</span><span class="buy-price">${ownedTag || '$' + item.price}</span>`;
        row.classList.toggle('unaffordable', !ownedTag && money < item.price);
        buyList.appendChild(row);
      }
      buyMoney.textContent = `$${money}`;
      buyMenu.hidden = false;
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    setPlant(ratio, label) {
      if (ratio === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(ratio * 100)}%`;
      plantLabel.textContent = label || '';
    },
    showPrompt(text) {
      prompt.innerHTML = text;
      prompt.hidden = false;
    },
    hidePrompt() {
      prompt.hidden = true;
    },
    showOverlay(mode, data) {
      if (mode === 'end') {
        title.textContent = data.title;
        copy.textContent = data.copy;
        play.textContent = data.action;
      } else {
        const text = COPY[mode] || COPY.start;
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
