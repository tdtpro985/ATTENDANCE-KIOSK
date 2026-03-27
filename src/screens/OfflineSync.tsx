import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BACKEND_URL } from '../config/backend';
import {
  getOfflineAttendanceQueue,
  markOfflineAttendanceFailed,
  markOfflineAttendancePending,
  removeOfflineAttendanceItem,
  type OfflineAttendanceItem,
} from '../utils/offlineAttendance';

const APP_VERSION = 'v1.0.39';

type Props = {
  onBack: () => void;
  onOpenScanner: () => void;
};

type TabKey = 'pending' | 'failed';

function getDisplayName(item: OfflineAttendanceItem) {
  return item.name?.trim() || item.username || item.userId;
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function OfflineSync({ onBack, onOpenScanner }: Props) {
  const [items, setItems] = useState<OfflineAttendanceItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const reloadQueue = useCallback(async () => {
    const queue = await getOfflineAttendanceQueue();
    setItems(queue);
  }, []);

  useEffect(() => {
    reloadQueue()
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, [reloadQueue]);

  const pendingItems = useMemo(() => items.filter((item) => item.status === 'pending'), [items]);
  const failedItems = useMemo(() => items.filter((item) => item.status === 'failed'), [items]);
  const displayedItems = activeTab === 'pending' ? pendingItems : failedItems;

  const syncItem = useCallback(async (item: OfflineAttendanceItem) => {
    await markOfflineAttendancePending(item.id);

    const response = await fetch(`${BACKEND_URL}/record_attendance.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ user_id: item.userId, action: item.action }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `Sync failed (${response.status})`);
    }

    await removeOfflineAttendanceItem(item.id);
  }, []);

  const handleSyncNow = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      const queue = await getOfflineAttendanceQueue();
      const candidates = queue.filter((item) => item.status === 'pending' || item.status === 'failed');

      for (const item of candidates) {
        try {
          await syncItem(item);
        } catch (error: any) {
          await markOfflineAttendanceFailed(
            item.id,
            error?.message || 'Connection error. Please check your network settings.'
          );
        }
      }
    } finally {
      await reloadQueue();
      setIsSyncing(false);
    }
  }, [isSyncing, reloadQueue, syncItem]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.topBar} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backArrow}>{'<'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>LIST OFFLINE</Text>
        </View>

        <View style={styles.tabRow}>
          <Pressable style={styles.tabButton} onPress={() => setActiveTab('pending')}>
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>Wait to Sync</Text>
            <View style={[styles.tabUnderline, activeTab === 'pending' && styles.tabUnderlineActive]} />
          </Pressable>

          <Pressable style={styles.tabButton} onPress={() => setActiveTab('failed')}>
            <View style={styles.failedTabLabel}>
              <Text style={[styles.tabText, activeTab === 'failed' && styles.tabTextActive]}>Sync Failed</Text>
              {failedItems.length ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{failedItems.length}</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.tabUnderline, activeTab === 'failed' && styles.tabUnderlineActive]} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#f18a21" />
            </View>
          ) : displayedItems.length ? (
            displayedItems.map((item) => {
              const displayName = getDisplayName(item);
              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={styles.primaryText}>{item.userId}</Text>
                    <Text style={styles.secondaryText}>{displayName}</Text>
                    <Text style={styles.metaText}>
                      Date : {item.date}   Time : {item.time}
                    </Text>
                    <Text style={styles.metaText}>Action : {item.action === 'clock_in' ? 'Clock In' : 'Clock Out'}</Text>
                    <Text style={styles.messageText}>
                      Message :{' '}
                      {item.status === 'failed'
                        ? item.errorMessage || 'Connection error. Please check your network settings.'
                        : 'Saved locally. Waiting to sync.'}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No Data</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onOpenScanner}>
            <Text style={styles.secondaryButtonText}>SHOW QR SCAN</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]} onPress={handleSyncNow} disabled={isSyncing}>
          {isSyncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncButtonText}>SYNC NOW</Text>}
        </Pressable>

        <Text style={styles.versionText}>{APP_VERSION}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef4fb',
  },
  topBar: {
    height: 18,
    backgroundColor: '#f27522',
  },
  container: {
    flex: 1,
    backgroundColor: '#eef4fb',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backArrow: {
    fontSize: 30,
    color: '#334058',
    lineHeight: 32,
  },
  headerTitle: {
    fontSize: 22,
    letterSpacing: 0.4,
    fontWeight: '700',
    color: '#e0b9ac',
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    color: '#8f9aad',
    fontWeight: '500',
    marginBottom: 10,
  },
  tabTextActive: {
    color: '#6b768a',
  },
  failedTabLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0625f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tabUnderline: {
    width: '100%',
    height: 3,
    backgroundColor: '#d5dde8',
  },
  tabUnderlineActive: {
    backgroundColor: '#d89a76',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 18,
  },
  card: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d9e2ee',
    paddingVertical: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#334058',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    marginTop: 4,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cardContent: {
    flex: 1,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6f7a8d',
    marginBottom: 3,
  },
  secondaryText: {
    fontSize: 16,
    color: '#6f7a8d',
    marginBottom: 10,
  },
  metaText: {
    fontSize: 14,
    color: '#7e8899',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#7e8899',
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 20,
    color: '#6f7a8d',
  },
  actionRow: {
    marginBottom: 10,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d8a16d',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    backgroundColor: '#fff7ef',
  },
  secondaryButtonText: {
    color: '#d07d2a',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  syncButton: {
    backgroundColor: '#f39a1f',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    marginBottom: 8,
  },
  syncButtonDisabled: {
    opacity: 0.75,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  versionText: {
    textAlign: 'center',
    color: '#7e8899',
    fontSize: 14,
    marginBottom: 10,
  },
});
