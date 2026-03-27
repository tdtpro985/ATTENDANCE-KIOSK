import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '../config/backend';

export const OFFLINE_USER_CACHE_KEY = 'offline_user_cache_v1';

export type CachedOfflineUser = {
  userId: string;
  username: string;
  name?: string | null;
  qrCode?: string | null;
};

type EmployeesPayload = {
  ok?: boolean;
  data?: Array<{
    name?: string | null;
    log_id?: number | string | null;
    accounts?:
      | {
          log_id?: number | string | null;
          username?: string | null;
          qr_code?: string | null;
        }
      | Array<{
          log_id?: number | string | null;
          username?: string | null;
          qr_code?: string | null;
        }>
      | null;
  }>;
};

function normalizeAccount(
  value:
    | {
        log_id?: number | string | null;
        username?: string | null;
        qr_code?: string | null;
      }
    | Array<{
        log_id?: number | string | null;
        username?: string | null;
        qr_code?: string | null;
      }>
    | null
    | undefined
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function parseQrHints(qrData: string) {
  const exact = qrData.trim();
  const logIdMatch = exact.match(/LOG_ID:([0-9]+)/);
  const usernameMatch = exact.match(/USER:([^|]+)/);

  return {
    exact,
    userId: logIdMatch?.[1]?.trim() ?? null,
    username: usernameMatch?.[1]?.trim().toLowerCase() ?? null,
  };
}

export async function getOfflineUserCache(): Promise<CachedOfflineUser[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_USER_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveOfflineUserCache(users: CachedOfflineUser[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_USER_CACHE_KEY, JSON.stringify(users));
}

export async function refreshOfflineUserCache(): Promise<CachedOfflineUser[]> {
  const response = await fetch(`${BACKEND_URL}/employees.php`, {
    headers: {
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  });

  const payload = (await response.json()) as EmployeesPayload;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
    throw new Error('Unable to refresh offline user cache');
  }

  const users = payload.data
    .map((employee): CachedOfflineUser | null => {
      const account = normalizeAccount(employee.accounts);
      const userId = String(account?.log_id ?? employee.log_id ?? '').trim();
      const username = String(account?.username ?? '').trim();

      if (!userId || !username) {
        return null;
      }
      return {
        userId,
        username,
        name: employee.name ?? null,
        qrCode: account?.qr_code?.trim() || null,
      };
    })
    .filter((item): item is CachedOfflineUser => item !== null);

  await saveOfflineUserCache(users);
  return users;
}

export async function resolveOfflineUserFromQr(qrData: string): Promise<CachedOfflineUser | null> {
  const users = await getOfflineUserCache();
  if (!users.length) {
    return null;
  }

  const hints = parseQrHints(qrData);

  const exactMatch = users.find((user) => user.qrCode && user.qrCode.trim() === hints.exact);
  if (exactMatch) {
    return exactMatch;
  }

  if (hints.userId) {
    const byLogId = users.find((user) => user.userId === hints.userId);
    if (byLogId) {
      return byLogId;
    }
  }

  if (hints.username) {
    const byUsername = users.find((user) => user.username.trim().toLowerCase() === hints.username);
    if (byUsername) {
      return byUsername;
    }
  }

  return null;
}
