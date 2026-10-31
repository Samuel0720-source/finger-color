export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream.getVideoTracks()[0];
}

export function stopCamera(videoEl) {
  const stream = videoEl.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  videoEl.srcObject = null;
}

// A laptop or selfie camera faces the user, so show it like a mirror.
// Phones report 'environment' for the back camera; laptops often report nothing at all.
export function isFrontCamera(track) {
  const settings = track.getSettings ? track.getSettings() : {};
  return settings.facingMode !== 'environment';
}

export async function tryLockCamera(track) {
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  const wanted = {};
  if (caps.exposureMode && caps.exposureMode.includes('manual')) {
    wanted.exposureMode = 'manual';
  }
  if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes('manual')) {
    wanted.whiteBalanceMode = 'manual';
  }
  if (Object.keys(wanted).length === 0) {
    return 'Camera ready. This camera adjusts its own brightness, so keep the light steady.';
  }
  try {
    await track.applyConstraints({ advanced: [wanted] });
    return 'Camera ready. Brightness and color balance are locked.';
  } catch {
    return 'Camera ready. Brightness could not be locked, so keep the light steady.';
  }
}
