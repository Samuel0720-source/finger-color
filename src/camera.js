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
    return 'Camera lock not supported (using grey card correction)';
  }
  try {
    await track.applyConstraints({ advanced: [wanted] });
    return 'Camera lock OK: ' + Object.keys(wanted).join(', ');
  } catch (e) {
    return 'Camera lock failed: ' + e.message;
  }
}