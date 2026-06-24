// Metro Cache Buster: 999123
const PRODUCTION_IP = '192.168.10.221';
const IP_ADDRESS = __DEV__
  ? (process.env.EXPO_PUBLIC_BACKEND_IP || PRODUCTION_IP)
  : PRODUCTION_IP;
export const BACKEND_URL = `http://${IP_ADDRESS}:8080`;
console.log('[Backend Config] URL resolved to:', BACKEND_URL, __DEV__ ? '(DEV)' : '(RELEASE)');
