// Haptic + audio feedback on confirmed sale
export function saleFeedback() {
  // Vibrate: short–pause–short pattern (ms)
  if ('vibrate' in navigator) {
    navigator.vibrate([60, 40, 60]);
  }

  // Ding: two-tone chime via Web Audio API
  try {
    const ctx = new AudioContext();

    function playTone(freq: number, startAt: number, duration: number, gain: number) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, ctx.currentTime + startAt);
      env.gain.linearRampToValueAtTime(gain, ctx.currentTime + startAt + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + duration);
    }

    playTone(880, 0,    0.18, 0.4);   // A5 — first note
    playTone(1320, 0.15, 0.3, 0.35);  // E6 — second note (higher)

    // Close context after sounds finish to free resources
    setTimeout(() => ctx.close(), 600);
  } catch {
    // AudioContext not supported — silently ignore
  }
}
