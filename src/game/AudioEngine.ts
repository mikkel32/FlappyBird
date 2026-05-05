export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxVolume = 0.5;
  private musicVolume = 0.2;
  private isMuted = false;

  public init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolumes(sfx: number, music: number) {
    this.sfxVolume = sfx / 100;
    this.musicVolume = music / 100;
  }

  public playFlap() {
    if (!this.ctx || this.sfxVolume === 0 || this.isMuted) return;
    this.playTone(150, 'triangle', 0.1, 0.1, -100);
  }

  public playScore() {
    if (!this.ctx || this.sfxVolume === 0 || this.isMuted) return;
    this.playTone(800, 'sine', 0.1, 0.1, 0);
    setTimeout(() => {
      this.playTone(1200, 'sine', 0.15, 0.1, 0);
    }, 100);
  }

  public playCrash() {
    if (!this.ctx || this.sfxVolume === 0 || this.isMuted) return;
    this.playTone(150, 'sawtooth', 0.3, 0.3, -50);
    setTimeout(() => {
      this.playTone(100, 'square', 0.4, 0.3, -50);
    }, 100);
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    vol: number,
    freqSlide: number = 0
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (freqSlide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, freq + freqSlide),
        this.ctx.currentTime + duration
      );
    }

    gainNode.gain.setValueAtTime(vol * this.sfxVolume, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
}

export const audioContext = new AudioEngine();
