// The round machine: buy phase, live round, round end, match end. One place owns the
// phase, the timer, the scores and the charge, and tells main.js what changed through
// events. First to 5 rounds wins the match (at most 9 rounds).
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createRounds(events) {
  const match = {
    phase: 'buy',
    round: 1,
    timer: BUY_SECONDS,
    scores: { ember: 0, warden: 0 },
    plant: { planted: false, site: null, fuse: 0, planter: null },
    lastReason: '',
    winner: null,
  };

  function startRound() {
    match.phase = 'buy';
    match.timer = BUY_SECONDS;
    match.plant = { planted: false, site: null, fuse: 0, planter: null };
    events.onPhase('buy', match);
  }

  function startLive() {
    match.phase = 'live';
    match.timer = ROUND_SECONDS;
    events.onPhase('live', match);
  }

  function endRound(winner, reason) {
    if (match.phase === 'end' || match.phase === 'matchEnd') return;
    match.scores[winner] += 1;
    match.lastReason = reason;
    match.winner = winner;
    match.phase = match.scores[winner] >= WIN_ROUNDS || match.round >= MAX_ROUNDS ? 'matchEnd' : 'end';
    match.timer = match.phase === 'matchEnd' ? 8 : 4;
    events.onRoundEnd(winner, reason, match);
  }

  function nextRound() {
    match.round += 1;
    startRound();
  }

  function plant(site, planter) {
    if (match.phase !== 'live' || match.plant.planted) return false;
    match.plant = { planted: true, site, fuse: FUSE_SECONDS, planter };
    events.onPlant(site, match);
    return true;
  }

  function defuse() {
    if (!match.plant.planted) return false;
    match.plant = { planted: false, site: null, fuse: 0, planter: null };
    endRound('warden', 'Charge defused');
    return true;
  }

  function step(dt) {
    if (match.phase === 'buy') {
      match.timer -= dt;
      if (match.timer <= 0) startLive();
      return;
    }
    if (match.phase === 'live') {
      if (match.plant.planted) {
        match.plant.fuse -= dt;
        match.timer = match.plant.fuse;
        if (match.plant.fuse <= 0) {
          events.onExplode(match.plant.site, match);
          endRound('ember', 'Charge detonated');
          return;
        }
        return;
      }
      match.timer -= dt;
      if (match.timer <= 0) {
        endRound('warden', 'Time expired — site held');
      }
      return;
    }
    if (match.phase === 'end') {
      match.timer -= dt;
      if (match.timer <= 0) nextRound();
      return;
    }
    if (match.phase === 'matchEnd') {
      match.timer -= dt;
    }
  }

  function reset() {
    match.phase = 'buy';
    match.round = 1;
    match.timer = BUY_SECONDS;
    match.scores = { ember: 0, warden: 0 };
    match.plant = { planted: false, site: null, fuse: 0, planter: null };
    match.lastReason = '';
    match.winner = null;
  }

  return { match, step, reset, startRound, startLive, endRound, plant, defuse };
}
