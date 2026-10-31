import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let landmarker = null;

export async function loadHandModel() {
  const vision = await FilesetResolver.forVisionTasks('/wasm');
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  try {
    landmarker = await HandLandmarker.createFromOptions(vision, options('GPU'));
  } catch {
    // Some phones and older laptops have no usable GPU in the browser. The CPU is slower but works.
    landmarker = await HandLandmarker.createFromOptions(vision, options('CPU'));
  }
}

// [tip landmark, joint just below the tip]
const FINGERS = {
  thumb: [4, 3],
  index: [8, 7],
  middle: [12, 11],
  ring: [16, 15],
  pinky: [20, 19],
};

// Runs the hand model ONCE for this video frame.
// MediaPipe needs a new, larger timestamp on every call, so never call this twice for the same frame.
//   image: 21 points, x and y as a fraction of the picture (0 to 1). Use for drawing and color boxes.
//   world: 21 points in meters around the hand's center. Use for angles and distances (no stretching).
export function detectHand(videoEl, timeMs) {
  if (!landmarker) return null;
  const result = landmarker.detectForVideo(videoEl, timeMs);
  if (!result.landmarks || result.landmarks.length === 0) return null;
  return { image: result.landmarks[0], world: result.worldLandmarks[0] };
}

// Color sampling boxes (in pixels) for each fingertip and the palm.
export function fingertipSpots(pts, w, h) {
  const spots = {};
  for (const [name, [tipIdx, jointIdx]] of Object.entries(FINGERS)) {
    const tip = pts[tipIdx];
    const joint = pts[jointIdx];
    const dx = (tip.x - joint.x) * w;
    const dy = (tip.y - joint.y) * h;
    spots[name] = {
      x: ((tip.x + joint.x) / 2) * w,
      y: ((tip.y + joint.y) / 2) * h,
      size: Math.max(6, Math.round(Math.hypot(dx, dy) * 0.6)),
    };
  }

  const wrist = pts[0];
  const knuckle = pts[9];
  spots.palm = {
    x: ((wrist.x + knuckle.x) / 2) * w,
    y: ((wrist.y + knuckle.y) / 2) * h,
    size: 30,
  };
  return spots;
}
