import { describe, expect, it } from "vitest";
import type { Landmark } from "@/lib/recognition";
import {
  AntiFlickerFilter,
  countFingers,
  displayGesture,
  getExtendedFingers,
  PRETRAINED_GESTURE_CATEGORIES,
  resolveGestureFrame,
} from "@/lib/gesture";

function p(x: number, y: number): Landmark {
  return { x, y, z: 0 };
}

/** Build a 21-point hand. Fingers 1–4 curl toward their MCP; thumb curls toward the pinky MCP. */
function makeHand(extended: [boolean, boolean, boolean, boolean, boolean]): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => p(0.5, 0.8));
  lm[0] = p(0.5, 1.0);
  lm[1] = p(0.56, 0.9);
  lm[2] = p(0.62, 0.82);
  lm[5] = p(0.58, 0.72);
  lm[9] = p(0.5, 0.7);
  lm[13] = p(0.42, 0.72);
  lm[17] = p(0.34, 0.74);

  const chains: [number, number, number][] = [
    [6, 7, 8],
    [10, 11, 12],
    [14, 15, 16],
    [18, 19, 20],
  ];
  const mcps = [5, 9, 13, 17];
  chains.forEach(([pip, dip, tip], i) => {
    const mcp = mcps[i];
    const mx = lm[mcp].x;
    const my = lm[mcp].y;
    if (extended[i + 1]) {
      lm[pip] = p(mx, my - 0.22);
      lm[dip] = p(mx, my - 0.4);
      lm[tip] = p(mx, my - 0.6);
    } else {
      lm[pip] = p(mx, my - 0.04);
      lm[dip] = p(mx + 0.01, my + 0.01);
      lm[tip] = p(mx + 0.02, my + 0.02);
    }
  });

  if (extended[0]) {
    lm[3] = p(0.78, 0.68);
    lm[4] = p(0.92, 0.55);
  } else {
    lm[3] = p(0.55, 0.78);
    lm[4] = p(0.48, 0.76);
  }
  return lm;
}

describe("displayGesture", () => {
  it("maps pretrained categories and treats None as Unknown", () => {
    expect(PRETRAINED_GESTURE_CATEGORIES).toHaveLength(7);
    expect(displayGesture("Closed_Fist")).toBe("Closed fist");
    expect(displayGesture("Open_Palm")).toBe("Open palm");
    expect(displayGesture("Pointing_Up")).toBe("Pointing up");
    expect(displayGesture("Thumb_Down")).toBe("Thumb down");
    expect(displayGesture("Thumb_Up")).toBe("Thumb up");
    expect(displayGesture("Victory")).toBe("Victory");
    expect(displayGesture("ILoveYou")).toBe("I love you");
    expect(displayGesture("None")).toBe("Unknown");
    expect(displayGesture("Unrecognized")).toBe("Unknown");
    expect(displayGesture("")).toBe("Unknown");
  });
});

describe("countFingers", () => {
  it("returns -1 for incomplete landmarks", () => {
    expect(countFingers([])).toBe(-1);
    expect(countFingers(makeHand([false, false, false, false, false]).slice(0, 10))).toBe(-1);
    expect(getExtendedFingers([])).toBeNull();
  });

  it("counts 0 through 5 independently of the gesture classifier", () => {
    expect(countFingers(makeHand([false, false, false, false, false]))).toBe(0);
    expect(countFingers(makeHand([false, true, false, false, false]))).toBe(1);
    expect(countFingers(makeHand([false, true, true, false, false]))).toBe(2);
    expect(countFingers(makeHand([false, true, true, true, false]))).toBe(3);
    expect(countFingers(makeHand([false, true, true, true, true]))).toBe(4);
    expect(countFingers(makeHand([true, true, true, true, true]))).toBe(5);
  });
});

describe("resolveGestureFrame", () => {
  const fist = makeHand([false, false, false, false, false]);
  const three = makeHand([false, true, true, true, false]);

  it("returns none when no hand is present", () => {
    const r = resolveGestureFrame({ landmarks: [], handedness: [], gestures: [] });
    expect(r.source).toBe("none");
    expect(r.label).toBe("");
  });

  it("uses the pretrained classifier and does not replace it with a finger count", () => {
    const r = resolveGestureFrame(
      {
        landmarks: [fist],
        handedness: ["Right"],
        gestures: [[{ name: "Closed_Fist", score: 0.92 }]],
      },
      0.7,
    );
    expect(r.source).toBe("model");
    expect(r.label).toBe("Closed fist");
    expect(r.confidence).toBe(0.92);
  });

  it("does not override a low-confidence canned gesture with finger counting", () => {
    const r = resolveGestureFrame(
      {
        landmarks: [fist],
        handedness: ["Right"],
        gestures: [[{ name: "Victory", score: 0.4 }]],
      },
      0.7,
    );
    expect(r.source).toBe("unknown");
    expect(r.label).toBe("Unknown");
  });

  it("counts fingers only when the classifier reports None", () => {
    const r = resolveGestureFrame({
      landmarks: [three],
      handedness: ["Left"],
      gestures: [[{ name: "None", score: 0.2 }]],
    });
    expect(r.source).toBe("finger_count");
    expect(r.label).toBe("3 fingers");
    expect(r.fingersCount).toBe(3);
  });

  it("shows Unknown when landmarks are missing", () => {
    const r = resolveGestureFrame({
      landmarks: [[{ x: 0, y: 0, z: 0 }]],
      handedness: ["Right"],
      gestures: [[{ name: "None", score: 0 }]],
    });
    expect(r.source).toBe("unknown");
    expect(r.label).toBe("Unknown");
  });
});

describe("AntiFlickerFilter", () => {
  it("majority-votes labels and bridges a 1-frame dropout", () => {
    const f = new AntiFlickerFilter(5);
    for (let i = 0; i < 5; i++) f.push({ label: "Victory", confidence: 0.9 });
    expect(f.push({ label: "Victory", confidence: 0.91 })?.label).toBe("Victory");
    expect(f.push(null)?.label).toBe("Victory");
    expect(f.push(null)?.label).toBe("Victory");
    expect(f.push(null)).toBeNull();
  });
});
