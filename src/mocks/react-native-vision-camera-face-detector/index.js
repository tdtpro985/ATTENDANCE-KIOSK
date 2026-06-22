function detectFaces(frame) {
  'worklet';
  return [
    {
      bounds: { x: 0.25, y: 0.15, width: 0.5, height: 0.6 },
      leftEyeOpenProbability: 0.85,
      rightEyeOpenProbability: 0.85,
      yawAngle: 0,
      pitchAngle: 0,
      rollAngle: 0,
      faceProbability: 0.98,
    },
  ];
}

function useFaceDetector() {
  return {
    detectFaces: detectFaces,
    stopListeners: () => {},
  };
}

module.exports = { useFaceDetector, detectFaces };
