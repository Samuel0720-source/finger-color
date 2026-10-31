// Angle at b made by the points a-b-c, in degrees. 180 = straight, smaller = bent.
export function jointAngle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const len = Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z);
  if (len === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / len));
  return (Math.acos(cos) * 180) / Math.PI;
}

// [knuckle, PIP joint, next joint] for each finger (MediaPipe point numbers)
export const PIP = {
  index: [5, 6, 7],
  middle: [9, 10, 11],
  ring: [13, 14, 15],
  pinky: [17, 18, 19],
};

export function pipAngles(world) {
  const out = {};
  for (const [name, [a, b, c]] of Object.entries(PIP)) {
    out[name] = jointAngle(world[a], world[b], world[c]);
  }
  return out;
}
