function useFaceDetector() {
  return {
    detectFaces: () => ({ faces: [] }),
    stopListeners: () => {},
  };
}

function detectFaces() {
  'worklet';
  return { faces: [] };
}

module.exports = { useFaceDetector, detectFaces };
