// Procedural sound: every effect is synthesised with WebAudio, no audio files and no
// network. The context only starts after a user gesture; every call guards for that.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration = 0.12, frequency = 1800, gain = 0.5, type = 'lowpass', when = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function tone({ frequency = 440, end = null, duration = 0.1, gain = 0.3, type = 'sine', when = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (end !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'sniper') {
        burst({ duration: 0.22, frequency: 900, gain: 0.7 });
        tone({ frequency: 160, end: 55, duration: 0.22, gain: 0.5, type: 'sawtooth' });
      } else if (kind === 'smg') {
        burst({ duration: 0.07, frequency: 2400, gain: 0.35 });
        tone({ frequency: 220, end: 90, duration: 0.08, gain: 0.25, type: 'square' });
      } else if (kind === 'pistol') {
        burst({ duration: 0.09, frequency: 2000, gain: 0.45 });
        tone({ frequency: 200, end: 80, duration: 0.1, gain: 0.3, type: 'square' });
      } else {
        burst({ duration: 0.12, frequency: 1500, gain: 0.55 });
        tone({ frequency: 180, end: 60, duration: 0.14, gain: 0.4, type: 'sawtooth' });
      }
    },
    distantShot() {
      burst({ duration: 0.1, frequency: 700, gain: 0.16 });
    },
    hit() {
      tone({ frequency: 1250, duration: 0.05, gain: 0.25, type: 'square' });
    },
    kill() {
      tone({ frequency: 880, duration: 0.06, gain: 0.25, type: 'square' });
      tone({ frequency: 1320, duration: 0.09, gain: 0.22, type: 'square', when: 0.06 });
    },
    hurt() {
      tone({ frequency: 140, end: 70, duration: 0.18, gain: 0.4, type: 'sawtooth' });
    },
    reload() {
      tone({ frequency: 900, duration: 0.04, gain: 0.2, type: 'square' });
      tone({ frequency: 600, duration: 0.04, gain: 0.2, type: 'square', when: 0.12 });
      tone({ frequency: 1100, duration: 0.05, gain: 0.22, type: 'square', when: 0.55 });
    },
    dryClick() {
      tone({ frequency: 1500, duration: 0.03, gain: 0.15, type: 'square' });
    },
    buy() {
      tone({ frequency: 660, duration: 0.07, gain: 0.22, type: 'sine' });
      tone({ frequency: 990, duration: 0.1, gain: 0.22, type: 'sine', when: 0.07 });
    },
    plantBeep(final = false) {
      tone({ frequency: final ? 1500 : 1000, duration: final ? 0.3 : 0.08, gain: 0.25, type: 'square' });
    },
    explosion() {
      burst({ duration: 0.9, frequency: 300, gain: 0.9 });
      tone({ frequency: 90, end: 28, duration: 0.9, gain: 0.7, type: 'sine' });
    },
    flash() {
      burst({ duration: 0.4, frequency: 4000, gain: 0.3, type: 'highpass' });
    },
    roundWin() {
      tone({ frequency: 523, duration: 0.12, gain: 0.25, type: 'triangle' });
      tone({ frequency: 659, duration: 0.12, gain: 0.25, type: 'triangle', when: 0.12 });
      tone({ frequency: 784, duration: 0.22, gain: 0.28, type: 'triangle', when: 0.24 });
    },
    roundLose() {
      tone({ frequency: 392, duration: 0.14, gain: 0.22, type: 'triangle' });
      tone({ frequency: 311, duration: 0.22, gain: 0.22, type: 'triangle', when: 0.14 });
    },
  };
}
