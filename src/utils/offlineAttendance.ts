import AsyncStorage from '@react-native-async-storage/async-storage';

export const OFFLINE_MODE_KEY = 'settings_offline_mode_enabled';
export const OFFLINE_ATTENDANCE_QUEUE_KEY = 'offline_attendance_queue';

export type AttendanceAction = 'clock_in' | 'clock_out';
export type OfflineAttendanceStatus = 'pending' | 'failed';

export type OfflineAttendanceItem = {
  id: string;
  userId: string;
  username: string;
  name?: string | null;
  action: AttendanceAction;
  date: string;
  time: string;
  createdAt: string;
  status: OfflineAttendanceStatus;
  errorMessage?: string | null;
};

export async function getOfflineAttendanceQueue(): Promise<OfflineAttendanceItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_ATTENDANCE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveOfflineAttendanceQueue(items: OfflineAttendanceItem[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_ATTENDANCE_QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueOfflineAttendance(
  input: Omit<OfflineAttendanceItem, 'id' | 'createdAt' | 'status' | 'errorMessage'>
): Promise<OfflineAttendanceItem> {
  const now = new Date().toISOString();
  const item: OfflineAttendanceItem = {
    ...input,
    id: `offline_${input.userId}_${input.action}_${now}`,
    createdAt: now,
    status: 'pending',
    errorMessage: null,
  };

  const queue = await getOfflineAttendanceQueue();
  queue.unshift(item);
  await saveOfflineAttendanceQueue(queue);
  return item;
}

export async function markOfflineAttendanceFailed(id: string, message: string): Promise<void> {
  const queue = await getOfflineAttendanceQueue();
  const next = queue.map((item) =>
    item.id === id
      ? {
          ...item,
          status: 'failed' as const,
          errorMessage: message,
        }
      : item
  );
  await saveOfflineAttendanceQueue(next);
}

export async function markOfflineAttendancePending(id: string): Promise<void> {
  const queue = await getOfflineAttendanceQueue();
  const next = queue.map((item) =>
    item.id === id
      ? {
          ...item,
          status: 'pending' as const,
          errorMessage: null,
        }
      : item
  );
  await saveOfflineAttendanceQueue(next);
}

export async function removeOfflineAttendanceItem(id: string): Promise<void> {
  const queue = await getOfflineAttendanceQueue();
  await saveOfflineAttendanceQueue(queue.filter((item) => item.id !== id));
}
