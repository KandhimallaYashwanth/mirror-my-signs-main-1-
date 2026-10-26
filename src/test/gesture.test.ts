import { describe, expect, it } from "vitest";
import {
  displayGesture,
  countFingers,
  getExtendedFingers,
  resolveGestureFrame,
  AntiFlickerFilter,
  GESTURE_LABELS,
  type GestureFrame,
} from "@/lib/gesture";
import { Stabilizer } from "@/lib/recognition";
import type { Landmark } from "@/lib/recognition";

/** Helper to generate a basic 21-point hand landmark array with customizable finger states. */
function createMockHand(extended: [boolean, boolean, boolean, boolean, boolean]): Landmark[] {
  // 0: wrist
  const lm: Landmark[] = [{ x: 0.5, y: 0.9, z: 0 }];

  // 1-4: Thumb (CMC: 1, MCP: 2, IP: 3, Tip: 4)
  if (extended[0]) {
    // Thumb spread wide to the left
    lm.push({ x: 0.45, y: 0.8, z: 0 }); // 1
    lm.push({ x: 0.38, y: 0.72, z: 0 }); // 2
    lm.push({ x: 0.28, y: 0.65, z: 0 }); // 3
    lm.push({ x: 0.15, y: 0.58, z: 0 }); // 4 (tip spread far away)
  } else {
    // Thumb curled across palm towards index MCP
    lm.push({ x: 0.48, y: 0.82, z: 0 }); // 1
    lm.push({ x: 0.46, y: 0.75, z: 0 }); // 2
    lm.push({ x: 0.45, y: 0.7, z: 0 }); // 3
    lm.push({ x: 0.46, y: 0.68, z: 0 }); // 4 (curled close to palm)
  }

  // Fingers configuration: [mcp_x, base_y]
  const fingerBases = [
    { x: 0.42, y: 0.6 }, // Index (5-8)
    { x: 0.5, y: 0.58 }, // Middle (9-12)
    { x: 0.58, y: 0.6 }, // Ring (13-16)
    { x: 0.65, y: 0.64 }, // Pinky (17-20)
  ];

  for (let f = 0; f < 4; f++) {
    const isExt = extended[f + 1];
    const base = fingerBases[f];
    // MCP
    lm.push({ x: base.x, y: base.y, z: 0 });
    if (isExt) {
      // Extended straight up (y decreases upwards in screen coordinates)
      lm.push({ x: base.x, y: base.y - 0.1, z: 0 }); // PIP
      lm.push({ x: base.x, y: base.y - 0.18, z: 0 }); // DIP
      lm.push({ x: base.x, y: base.y - 0.26, z: 0 }); // TIP (far from wrist)
    } else {
      // Curled downward towards palm/wrist
      lm.push({ x: base.x, y: base.y - 0.08, z: 0 }); // PIP (at knuckle apex)
      lm.push({ x: base.x, y: base.y - 0.04, z: 0.05 }); // DIP
      lm.push({ x: base.x, y: base.y + 0.02, z: 0.05 }); // TIP (curled into palm)
    }
  }

  return lm;
}

describe("Pretrained gesture labels", () => {
  it("formats all 7 official MediaPipe pretrained categories correctly", () => {
    expect(displayGesture("Closed_Fist")).toBe("Closed fist");
    expect(displayGesture("Open_Palm")).toBe("Open palm");
    expect(displayGesture("Pointing_Up")).toBe("Pointing up");
    expect(displayGesture("Thumb_Down")).toBe("Thumb down");
    expect(displayGesture("Thumb_Up")).toBe("Thumb up");
    expect(displayGesture("Victory")).toBe("Victory");
    expect(displayGesture("ILoveYou")).toBe("I love you");
  });

  it("handles None, Unrecognized, and empty values as Unknown", () => {
    expect(displayGesture("None")).toBe("Unknown");
    expect(displayGesture("Unrecognized")).toBe("Unknown");
    expect(displayGesture("")).toBe("Unknown");
  });

  it("formats underscore strings into readable titles", () => {
    expect(displayGesture("custom_gesture_name")).toBe("custom gesture name");
  });
});

describe("Finger counting from landmarks", () => {
  it("counts 0 fingers for closed fist (all fingers curled)", () => {
    const fist = createMockHand([false, false, false, false, false]);
    expect(countFingers(fist)).toBe(0);
    expect(getExtendedFingers(fist)).toEqual([false, false, false, false, false]);
  });

  it("counts 1 finger for pointing up (index extended)", () => {
    const point = createMockHand([false, true, false, false, false]);
    expect(countFingers(point)).toBe(1);
    expect(getExtendedFingers(point)).toEqual([false, true, false, false, false]);
  });

  it("counts 2 fingers for victory/peace sign (index + middle extended)", () => {
    const victory = createMockHand([false, true, true, false, false]);
    expect(countFingers(victory)).toBe(2);
    expect(getExtendedFingers(victory)).toEqual([false, true, true, false, false]);
  });

  it("counts 3 fingers (index + middle + ring extended)", () => {
    const three = createMockHand([false, true, true, true, false]);
    expect(countFingers(three)).toBe(3);
    expect(getExtendedFingers(three)).toEqual([false, true, true, true, false]);
  });

  it("counts 4 fingers (index + middle + ring + pinky, thumb curled)", () => {
    const four = createMockHand([false, true, true, true, true]);
    expect(countFingers(four)).toBe(4);
    expect(getExtendedFingers(four)).toEqual([false, true, true, true, true]);
  });

  it("counts 5 fingers for open palm (all 5 extended)", () => {
    const openPalm = createMockHand([true, true, true, true, true]);
    expect(countFingers(openPalm)).toBe(5);
    expect(getExtendedFingers(openPalm)).toEqual([true, true, true, true, true]);
  });

  it("returns -1 for incomplete or null landmarks without crashing", () => {
    expect(countFingers([])).toBe(-1);
    expect(countFingers(null as unknown as Landmark[])).toBe(-1);
    expect(countFingers([{ x: 0, y: 0, z: 0 }])).toBe(-1);
  });
});

describe("Unified gesture frame resolver", () => {
  it("prioritizes a recognized pretrained gesture when score >= threshold", () => {
    const victoryHand = createMockHand([false, true, true, false, false]);
    const frame: GestureFrame = {
      landmarks: [victoryHand],
      handedness: ["Right"],
      gestures: [[{ name: "Victory", score: 0.92 }]],
    };

    const resolved = resolveGestureFrame(frame, 0.7);
    expect(resolved.label).toBe("Victory");
    expect(resolved.confidence).toBe(0.92);
    expect(resolved.source).toBe("model");
    expect(resolved.fingersCount).toBe(2);
  });

  it("falls back to landmark finger counting when model output is None (e.g. 3 fingers)", () => {
    const threeHand = createMockHand([false, true, true, true, false]);
    const frame: GestureFrame = {
      landmarks: [threeHand],
      handedness: ["Right"],
      gestures: [[{ name: "None", score: 0.88 }]],
    };

    const resolved = resolveGestureFrame(frame, 0.7);
    expect(resolved.label).toBe("3 fingers");
    expect(resolved.source).toBe("finger_count");
    expect(resolved.fingersCount).toBe(3);
  });

  it("falls back to landmark finger counting for 4 fingers", () => {
    const fourHand = createMockHand([false, true, true, true, true]);
    const frame: GestureFrame = {
      landmarks: [fourHand],
      handedness: ["Right"],
      gestures: [[{ name: "None", score: 0.9 }]],
    };

    const resolved = resolveGestureFrame(frame, 0.7);
    expect(resolved.label).toBe("4 fingers");
    expect(resolved.source).toBe("finger_count");
    expect(resolved.fingersCount).toBe(4);
  });

  it("returns none when no hands are in the frame", () => {
    const frame: GestureFrame = {
      landmarks: [],
      handedness: [],
      gestures: [],
    };

    const resolved = resolveGestureFrame(frame);
    expect(resolved.source).toBe("none");
    expect(resolved.label).toBe("");
  });
});

describe("AntiFlickerFilter & Temporal Stabilization", () => {
  it("filters out single-frame classification blips via majority voting", () => {
    const filter = new AntiFlickerFilter(5);

    // Feed sequence of stable Victory frames
    filter.push({ label: "Victory", confidence: 0.9 });
    filter.push({ label: "Victory", confidence: 0.9 });
    filter.push({ label: "Victory", confidence: 0.9 });

    // Single glitch frame: "Unknown"
    const blip = filter.push({ label: "Unknown", confidence: 0.5 });
    // Majority vote maintains "Victory", preventing flicker!
    expect(blip?.label).toBe("Victory");

    // Next frame back to Victory
    const res = filter.push({ label: "Victory", confidence: 0.9 });
    expect(res?.label).toBe("Victory");
  });

  it("bridges 1-2 frame tracking dropouts without clearing immediately", () => {
    const filter = new AntiFlickerFilter(5);

    filter.push({ label: "Open palm", confidence: 0.95 });
    filter.push({ label: "Open palm", confidence: 0.95 });

    // 1 frame missing hand
    const drop1 = filter.push(null);
    expect(drop1?.label).toBe("Open palm");

    // 2nd frame missing hand
    const drop2 = filter.push(null);
    expect(drop2?.label).toBe("Open palm");

    // 3rd frame missing hand: now cleanly transitions to null
    const drop3 = filter.push(null);
    expect(drop3).toBeNull();
  });

  it("Stabilizer emits accepted label only after required hold frames and avoids duplicate emits", () => {
    const stabilizer = new Stabilizer(0.7, 4);

    // Frame 1
    let r = stabilizer.push({ label: "Victory", confidence: 0.85 });
    expect(r.accepted).toBeNull();
    expect(r.progress).toBe(0.25);

    // Frame 2
    r = stabilizer.push({ label: "Victory", confidence: 0.85 });
    expect(r.accepted).toBeNull();
    expect(r.progress).toBe(0.5);

    // Frame 3
    r = stabilizer.push({ label: "Victory", confidence: 0.85 });
    expect(r.accepted).toBeNull();
    expect(r.progress).toBe(0.75);

    // Frame 4: Accepted!
    r = stabilizer.push({ label: "Victory", confidence: 0.85 });
    expect(r.accepted).toBe("Victory");
    expect(r.progress).toBe(1.0);

    // Frame 5-10: Continued holding does NOT re-emit accepted label
    r = stabilizer.push({ label: "Victory", confidence: 0.85 });
    expect(r.accepted).toBeNull();

    r = stabilizer.push({ label: "Victory", confidence: 0.85 });
    expect(r.accepted).toBeNull();
  });
});
