const PRODUCTION_IP = '192.168.10.221';
const LOCAL_IP = '192.168.15.63';

const TARGET_IP = LOCAL_IP; 

const IP_ADDRESS = __DEV__
  ? (process.env.EXPO_PUBLIC_BACKEND_IP || TARGET_IP)
  : PRODUCTION_IP;

// NOTE: If your XAMPP uses port 80, remove the ':8080' below. 
// If it uses port 8080, leave it as is!
const BACKEND_PORT = __DEV__ ? 8000 : 8080;
export const BACKEND_URL = `http://${IP_ADDRESS}:${BACKEND_PORT}`;
export const CONNECTION_TYPE = __DEV__ ? 'Local' : 'Hosted';
console.log('[Backend Config] URL resolved to:', BACKEND_URL, __DEV__ ? '(DEV)' : '(RELEASE)');
