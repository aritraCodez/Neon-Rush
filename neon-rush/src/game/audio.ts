export type Sound = 'start' | 'jump' | 'slide' | 'coin' | 'power' | 'hit' | 'over' | 'move' | 'tick' | 'shot' | 'shotgun' | 'laser' | 'enemy-shot' | 'impact' | 'critical' | 'explosion' | 'reload' | 'reload-done' | 'switch' | 'dash' | 'alarm' | 'boss' | 'victory';

class SynthAudio {
  private context: AudioContext | null = null;
  enabled = true;

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional on browsers without Web Audio. */ }
  }

  play(sound: Sound) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const notes: Record<Sound, number[]> = {
      start: [261.6, 329.6, 392, 523.2], jump: [240, 520], slide: [240, 100],
      coin: [1046, 1568], power: [523, 659, 784, 1046], hit: [140, 70],
      over: [330, 247, 165, 82], move: [180], tick: [660],
      shot: [720, 220], shotgun: [180, 75], laser: [1400, 950, 350], 'enemy-shot': [290, 160], impact: [200], critical: [1300, 1700],
      explosion: [90, 55, 35], reload: [170, 260], 'reload-done': [480, 640], switch: [320, 420], dash: [480, 160],
      alarm: [440, 660, 440], boss: [110, 165, 82], victory: [392, 523, 659, 784, 1046],
    };
    notes[sound].forEach((frequency, i) => {
      const ctx = this.context!;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.065;
      oscillator.type = ['over', 'hit', 'explosion', 'shotgun', 'boss'].includes(sound) ? 'sawtooth' : ['shot', 'enemy-shot', 'laser'].includes(sound) ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.8, start + 0.15);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(['move', 'impact', 'enemy-shot'].includes(sound) ? 0.018 : sound === 'shot' ? 0.035 : 0.06, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.19);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
}

export const audio = new SynthAudio();
