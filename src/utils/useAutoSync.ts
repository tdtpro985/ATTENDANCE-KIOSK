import { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config/backend';
import { getOfflineAttendanceQueue, syncOfflineQueue } from './offlineAttendance';

/**
 * Hook to handle automatic background syncing of offline attendance records.
 * 
 * Logic:
 * 1. Checks if the offline queue has items.
 * 2. If items exist, pings the backend every 30 seconds to check connectivity.
 * 3. If 2 consecutive pings succeed (1 minute total), triggers syncOfflineQueue().
 * 4. If any ping fails, resets the counter.
 * 5. Sleeps when the queue is empty to save battery.
 */
export function useAutoSync() {
  const [isOnline, setIsOnline] = useState(true);
  const stabilityCounterRef = useRef(0);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkAndSync = async () => {
      try {
        const queue = await getOfflineAttendanceQueue();
        
        // If queue is empty, sleep and check again in 30s (minimal cost)
        if (queue.length === 0) {
          stabilityCounterRef.current = 0;
          setIsOnline(true);
          timeoutId = setTimeout(checkAndSync, 30000);
          return;
        }

        // If we are already syncing, wait
        if (isSyncingRef.current) {
          timeoutId = setTimeout(checkAndSync, 30000);
          return;
        }

        // Ping the backend to check actual connectivity
        const response = await fetch(`${BACKEND_URL}/settings.php`, {
          headers: { Accept: 'application/json', 'ngrok-skip-browser-warning': 'true' },
        });

        if (response.ok) {
          setIsOnline(true);
          stabilityCounterRef.current += 1;

          // If stable for 2 pings (60s), trigger sync
          if (stabilityCounterRef.current >= 2) {
            isSyncingRef.current = true;
            try {
              await syncOfflineQueue();
            } finally {
              isSyncingRef.current = false;
              stabilityCounterRef.current = 0; // Reset after attempt
            }
          }
        } else {
          setIsOnline(false);
          stabilityCounterRef.current = 0;
        }
      } catch (error) {
        setIsOnline(false);
        stabilityCounterRef.current = 0;
      }

      timeoutId = setTimeout(checkAndSync, 30000);
    };

    checkAndSync();

    return () => clearTimeout(timeoutId);
  }, []);

  return { isOnline };
}
