// Manual sanity check for the nod detector's state machine, run with plain
// node against synthetic signals (no camera / TS build needed). This is not
// part of the shipped app -- it's a quick way to validate thresholds.
// Run: node nodDetector.test-manual.mjs

class NodDetector {
  constructor(config) {
    this.config = config;
    this.state = "idle";
    this.baseline = null;
    this.downStartedAt = 0;
    this.peakDelta = 0;
    this.cooldownUntil = 0;
  }
  update(signal, t) {
    if (this.baseline === null) {
      this.baseline = signal;
      return false;
    }
    if (this.state === "cooldown") {
      if (t >= this.cooldownUntil) this.state = "idle";
      else {
        this.baseline += (signal - this.baseline) * this.config.baselineAlpha;
        return false;
      }
    }
    const delta = signal - this.baseline;
    const { downThreshold, returnFraction, maxGestureMs, minDownMs, cooldownMs, baselineAlpha } = this.config;
    if (this.state === "idle") {
      if (delta > downThreshold) {
        this.state = "down";
        this.downStartedAt = t;
        this.peakDelta = delta;
      } else {
        this.baseline += (signal - this.baseline) * baselineAlpha;
      }
      return false;
    }
    this.peakDelta = Math.max(this.peakDelta, delta);
    const elapsed = t - this.downStartedAt;
    if (elapsed > maxGestureMs) {
      this.state = "idle";
      this.baseline = signal;
      return false;
    }
    if (delta < this.peakDelta * returnFraction && elapsed >= minDownMs) {
      this.state = "cooldown";
      this.cooldownUntil = t + cooldownMs;
      this.baseline = signal;
      return true;
    }
    return false;
  }
}

const CONFIG = {
  downThreshold: 0.085,
  returnFraction: 0.4,
  maxGestureMs: 900,
  minDownMs: 90,
  cooldownMs: 1400,
  baselineAlpha: 0.02,
};

function run(name, samples, expectedNods) {
  const d = new NodDetector({ ...CONFIG });
  let fired = 0;
  const firedAt = [];
  for (const [signal, t] of samples) {
    if (d.update(signal, t)) {
      fired++;
      firedAt.push(t);
    }
  }
  const pass = fired === expectedNods;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: expected ${expectedNods} nod(s), got ${fired} at [${firedAt.join(", ")}]ms`);
}

// helper: neutral baseline noise
function noise(base, t, amp = 0.006) {
  return base + Math.sin(t * 0.017) * amp + (Math.random() - 0.5) * amp;
}

// --- Scenario 1: single deliberate nod (down over 150ms, up over 150ms) ---
{
  const samples = [];
  let t = 0;
  for (; t < 500; t += 33) samples.push([noise(0, t), t]); // idle/neutral
  const nodStart = t;
  for (; t < nodStart + 180; t += 33) {
    const progress = (t - nodStart) / 180;
    samples.push([progress * 0.16, t]); // chin dropping
  }
  const peakT = t;
  for (; t < peakT + 180; t += 33) {
    const progress = (t - peakT) / 180;
    samples.push([0.16 * (1 - progress), t]); // chin returning
  }
  for (; t < peakT + 2000; t += 33) samples.push([noise(0, t), t]); // settle
  run("single deliberate nod", samples, 1);
}

// --- Scenario 2: musician just tilts head down to read a low note and holds it (no nod) ---
{
  const samples = [];
  let t = 0;
  for (; t < 500; t += 33) samples.push([noise(0, t), t]);
  const dipStart = t;
  for (; t < dipStart + 200; t += 33) {
    const progress = (t - dipStart) / 200;
    samples.push([progress * 0.11, t]);
  }
  // HOLD the down position for a long time (reading), well past maxGestureMs
  for (; t < dipStart + 3000; t += 33) samples.push([noise(0.11, t), t]);
  run("sustained head-down posture (should NOT fire)", samples, 0);
}

// --- Scenario 3: small jitter / natural micro-movements while reading (no nod) ---
{
  const samples = [];
  for (let t = 0; t < 4000; t += 33) samples.push([noise(0, t, 0.02), t]);
  run("natural jitter while reading (should NOT fire)", samples, 0);
}

// --- Scenario 4: two nods in a row with a gap (e.g. flipping two pages) ---
{
  const samples = [];
  let t = 0;
  const doNod = (start) => {
    for (let tt = start; tt < start + 180; tt += 33) {
      samples.push([((tt - start) / 180) * 0.16, tt]);
    }
    for (let tt = start + 180; tt < start + 360; tt += 33) {
      samples.push([0.16 * (1 - (tt - start - 180) / 180), tt]);
    }
  };
  for (; t < 500; t += 33) samples.push([noise(0, t), t]);
  doNod(500);
  t = 900;
  for (; t < 3000; t += 33) samples.push([noise(0, t), t]); // gap, well past cooldown (1400ms)
  doNod(3000);
  t = 3400;
  for (; t < 5000; t += 33) samples.push([noise(0, t), t]);
  run("two distinct nods (should fire exactly twice)", samples, 2);
}

// --- Scenario 5: slow gradual lean toward the camera over time (posture drift, no nod) ---
{
  const samples = [];
  for (let t = 0; t < 6000; t += 33) {
    const drift = (t / 6000) * 0.1; // slow drift over 6s, well below nod speed
    samples.push([noise(drift, t), t]);
  }
  run("slow postural drift (should NOT fire)", samples, 0);
}
