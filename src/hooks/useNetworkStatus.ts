import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { BACKEND_URL } from '../config/backend';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [hasGoodInternet, setHasGoodInternet] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const state = await NetInfo.fetch();
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        setHasGoodInternet(false);
        setIsChecking(false);
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`${BACKEND_URL}/attendance_today.php`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'ngrok-skip-browser-warning': 'true' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const isOk = res.status >= 200 && res.status < 300;
      setHasGoodInternet(isOk);
      setIsChecking(false);
      return isOk;
    } catch {
      setHasGoodInternet(false);
      setIsChecking(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        setHasGoodInternet(false);
      } else {
        checkStatus();
      }
    });

    checkStatus();

    return () => unsubscribe();
  }, [checkStatus]);

  return { isConnected, hasGoodInternet, isChecking, checkStatus };
}
