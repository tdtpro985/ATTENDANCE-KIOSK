const { useState, useEffect } = require('react');

function useCameraPermission() {
  const [hasPermission, setHasPermission] = useState(false);
  return {
    hasPermission,
    requestPermission: async () => { setHasPermission(false); return false; },
  };
}

function useMicrophonePermission() {
  return { hasPermission: false, requestPermission: async () => false };
}

const Camera = () => null;
Camera.getCameraPermissionStatus = async () => 'not-determined';
Camera.requestCameraPermission = async () => 'denied';

module.exports = { Camera, useCameraPermission, useMicrophonePermission };
