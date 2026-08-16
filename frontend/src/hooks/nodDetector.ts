/**
 * Turns a stream of "how far below neutral is the nose right now" samples
 * into discrete nod events.
 *
 * Input signal: for each video frame we compute
 *     signal = (noseTip.y - eyeMidpoint.y) / interocularDistance
 * using MediaPipe face landmarks (see useNodDetection.ts). This is scale
 * invariant (doesn't matter how close the musician is to the camera) and,
 * because it's a *relative* offset between two points on the rigid face,
 * it barely moves when the head simply translates up/down -- it mainly
 * responds to pitch (tipping the chin down and back up), which is what a
 * nod actually is. That means we don't need the person to hold perfectly
 * still, and we don't need an explicit calibration step.
 *
 * State machine:
 *   IDLE    -- signal near the (slowly adapting) baseline.
 *   DOWN    -- signal rose above threshold (chin dipping); we're timing
 *              whether it comes back down in time to count as a nod
 *              rather than the musician just looking down at the page.
 *   COOLDOWN-- a nod just fired; ignore new gestures briefly so one nod
 *              doesn't flip five pages.
 */

export interface NodDetectorConfig {
  /** How far above baseline (in normalized units) counts as "chin dropped".
   * Lower = more sensitive, more accidental triggers. */
  downThreshold: number;
  /** Signal must fall back below this fraction of the peak-above-baseline
   * to count as "returned", confirming a nod rather than a sustained
   * head-down posture (e.g. reading a low note). */
  returnFraction: number;
  /** A gesture that takes longer than this to return is treated as the
   * musician just looking down, not a nod. */
  maxGestureMs: number;
  /** Minimum time the signal must stay elevated before we'll accept a
   * return-to-baseline as a nod -- filters out camera/landmark jitter. */
  minDownMs: number;
  /** How long to ignore new gestures after a confirmed nod. */
  cooldownMs: number;
  /** Exponential smoothing factor (0-1) for the slow-moving baseline that
   * tracks the musician's natural resting head position. */
  baselineAlpha: number;
}

export const DEFAULT_NOD_CONFIG: NodDetectorConfig = {
  downThreshold: 0.085,
  returnFraction: 0.4,
  maxGestureMs: 900,
  minDownMs: 90,
  cooldownMs: 1400,
  baselineAlpha: 0.02,
};

/** Scales the sensitive thresholds; 0 = least sensitive, 1 = most sensitive. */
export function configForSensitivity(sensitivity: number): NodDetectorConfig {
  const clamped = Math.min(1, Math.max(0, sensitivity));
  return {
    ...DEFAULT_NOD_CONFIG,
    // 0.13 (needs a big, deliberate nod) down to 0.055 (hair-trigger)
    downThreshold: 0.13 - clamped * 0.075,
  };
}

type State = "idle" | "down" | "cooldown";

export class NodDetector {
  private state: State = "idle";
  private baseline: number | null = null;
  private downStartedAt = 0;
  private peakDelta = 0;
  private cooldownUntil = 0;

  constructor(private config: NodDetectorConfig = DEFAULT_NOD_CONFIG) {}

  setConfig(config: NodDetectorConfig) {
    this.config = config;
  }

  reset() {
    this.state = "idle";
    this.baseline = null;
    this.downStartedAt = 0;
    this.peakDelta = 0;
    this.cooldownUntil = 0;
  }

  /** Feed one frame's signal in. Returns true exactly on the frame a nod is confirmed. */
  update(signal: number, timestampMs: number): boolean {
    if (this.baseline === null) {
      this.baseline = signal;
      return false;
    }

    if (this.state === "cooldown") {
      if (timestampMs >= this.cooldownUntil) {
        this.state = "idle";
      } else {
        // still drift the baseline gently so we don't snap back into a
        // false "down" reading the instant cooldown ends
        this.baseline += (signal - this.baseline) * this.config.baselineAlpha;
        return false;
      }
    }

    const delta = signal - this.baseline;
    const { downThreshold, returnFraction, maxGestureMs, minDownMs, cooldownMs, baselineAlpha } =
      this.config;

    if (this.state === "idle") {
      if (delta > downThreshold) {
        this.state = "down";
        this.downStartedAt = timestampMs;
        this.peakDelta = delta;
      } else {
        // no gesture happening -- slowly track natural posture drift
        this.baseline += (signal - this.baseline) * baselineAlpha;
      }
      return false;
    }

    // state === "down"
    this.peakDelta = Math.max(this.peakDelta, delta);
    const elapsed = timestampMs - this.downStartedAt;

    if (elapsed > maxGestureMs) {
      // took too long -- this is a posture change, not a nod. Adopt the
      // new head position as the baseline so we don't stay "primed".
      this.state = "idle";
      this.baseline = signal;
      return false;
    }

    if (delta < this.peakDelta * returnFraction && elapsed >= minDownMs) {
      // confirmed nod: rose above threshold, then returned, within the window
      this.state = "cooldown";
      this.cooldownUntil = timestampMs + cooldownMs;
      this.baseline = signal;
      return true;
    }

    return false;
  }
}
