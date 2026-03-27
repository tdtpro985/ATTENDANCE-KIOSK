import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BACKEND_URL } from '../config/backend';
import { OFFLINE_MODE_KEY, enqueueOfflineAttendance, getOfflineAttendanceQueue } from '../utils/offlineAttendance';
import { refreshOfflineUserCache, resolveOfflineUserFromQr } from '../utils/offlineUsers';

const { width } = Dimensions.get('window');
const ATTENDANCE_SESSIONS_KEY = 'attendance_active_sessions';
const TOUCHLESS_SETTING_KEY = 'settings_touchless_enabled';

type Props = {
  onBack: () => void;
  onOpenOffline: () => void;
};

type ResolvedUser = {
  userId: string;
  username: string;
  name?: string | null;
};

type StoredAttendanceSession = {
  userId: string;
  username: string;
  name?: string | null;
  clockInTime: string;
  clockInDate: string;
};

export default function ShowQRScan({ onBack, onOpenOffline }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockInTime, setClockInTime] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [qrVerified, setQrVerified] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ResolvedUser | null>(null);
  const [attendanceAction, setAttendanceAction] = useState<'clock_in' | 'clock_out'>('clock_in');
  const [touchlessEnabled, setTouchlessEnabled] = useState(false);
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(false);
  const [isSavingOfflineMode, setIsSavingOfflineMode] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const lastScanRef = useRef<{ data: string | null; ts: number }>({ data: null, ts: 0 });
  const touchlessTriggeredRef = useRef(false);

  const [showResultModal, setShowResultModal] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'info' | 'warning'>('success');
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalHint, setModalHint] = useState('');
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet([TOUCHLESS_SETTING_KEY, OFFLINE_MODE_KEY])
      .then((entries) => {
        if (active) {
          const mapped = Object.fromEntries(entries);
          setTouchlessEnabled(mapped[TOUCHLESS_SETTING_KEY] === 'true');
          setOfflineModeEnabled(mapped[OFFLINE_MODE_KEY] === 'true');
        }
      })
      .catch(() => {
        console.log('[Settings] Failed to load local settings');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toDateString();
  const isClockingOut = attendanceAction === 'clock_out';
  const cameraFrameSize = Math.min(width * (qrVerified ? 0.72 : 0.78), qrVerified ? 310 : 320);

  const showModal = useCallback(
    (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string, hint: string) => {
      setModalType(type);
      setModalTitle(title);
      setModalMessage(message);
      setModalHint(hint);
      setShowResultModal(true);

      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();
    },
    [scaleAnim]
  );

  const closeModal = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowResultModal(false);
      scaleAnim.setValue(0);
    });
  }, [scaleAnim]);

  const handleOfflineModeChange = useCallback(async (value: boolean) => {
    setOfflineModeEnabled(value);
    setIsSavingOfflineMode(true);
    try {
      await AsyncStorage.setItem(OFFLINE_MODE_KEY, value ? 'true' : 'false');
    } catch {
      setOfflineModeEnabled(!value);
      showModal('error', 'Offline Mode', 'Failed to save offline mode setting.', '');
    } finally {
      setIsSavingOfflineMode(false);
    }
  }, [showModal]);

  const refreshPendingSyncCount = useCallback(async () => {
    try {
      const queue = await getOfflineAttendanceQueue();
      setPendingSyncCount(queue.filter((item) => item.status === 'pending').length);
    } catch {
      setPendingSyncCount(0);
    }
  }, []);

  useEffect(() => {
    refreshPendingSyncCount();
  }, [refreshPendingSyncCount]);

  useEffect(() => {
    refreshOfflineUserCache().catch(() => {
      console.log('[Offline] Could not refresh offline user cache');
    });
  }, []);

  const getStoredSession = useCallback(async (userId: string): Promise<StoredAttendanceSession | null> => {
    try {
      const raw = await AsyncStorage.getItem(ATTENDANCE_SESSIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const session = parsed?.[userId];
      if (!session || typeof session !== 'object') return null;
      if (!session.clockInTime || !session.clockInDate) return null;
      return {
        userId,
        username: String(session.username || ''),
        name: session.name ?? null,
        clockInTime: String(session.clockInTime),
        clockInDate: String(session.clockInDate),
      };
    } catch {
      console.log('[Attendance] Failed to read stored sessions');
      return null;
    }
  }, []);

  const saveStoredSession = useCallback(async (session: StoredAttendanceSession) => {
    try {
      const raw = await AsyncStorage.getItem(ATTENDANCE_SESSIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[session.userId] = session;
      await AsyncStorage.setItem(ATTENDANCE_SESSIONS_KEY, JSON.stringify(parsed));
    } catch {
      console.log('[Attendance] Failed to save stored session');
    }
  }, []);

  const clearStoredSession = useCallback(async (userId: string) => {
    try {
      const raw = await AsyncStorage.getItem(ATTENDANCE_SESSIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object' && parsed[userId]) {
        delete parsed[userId];
        await AsyncStorage.setItem(ATTENDANCE_SESSIONS_KEY, JSON.stringify(parsed));
      }
    } catch {
      console.log('[Attendance] Failed to clear stored session');
    }
  }, []);

  const resetAttendanceFlow = useCallback(async () => {
    setQrVerified(false);
    setClockInTime('');
    setWelcomeName(null);
    setSelectedUser(null);
    setAttendanceAction('clock_in');
    lastScanRef.current = { data: null, ts: 0 };
    touchlessTriggeredRef.current = false;
    try {
      await AsyncStorage.multiRemove(['userId', 'username']);
    } catch {
      console.log('Failed to clear selected user from storage');
    }
  }, []);

  const resolveUserFromQr = useCallback(async (qrData: string): Promise<ResolvedUser> => {
    try {
      const response = await fetch(`${BACKEND_URL}/resolve_qr.php?qr=${encodeURIComponent(qrData)}`, {
        headers: {
          Accept: 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      const responseText = await response.text();
      console.log('[QR] Raw response', response.status, responseText?.slice?.(0, 200));

      let payload: any = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('[QR] JSON parse error:', parseError);
        throw new Error(`Server returned invalid response. Status: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(payload?.message || `QR validation failed. Status: ${response.status}`);
      }

      if (!payload?.ok || !payload?.user?.log_id) {
        throw new Error(payload?.message || 'QR not recognized');
      }

      return {
        userId: String(payload.user.log_id),
        username: String(payload.user.username || ''),
        name: payload.user.name ?? null,
      };
    } catch (error) {
      if (!offlineModeEnabled) {
        throw error;
      }

      const cachedUser = await resolveOfflineUserFromQr(qrData);
      if (!cachedUser) {
        throw new Error('Offline mode needs a previously cached employee list for this QR code.');
      }

      return {
        userId: cachedUser.userId,
        username: cachedUser.username,
        name: cachedUser.name ?? null,
      };
    }
  }, [offlineModeEnabled]);

  const handleBarcodeScanned = async (event: any) => {
    if (isVerifying) return;

    const data: string | undefined = event?.data;
    if (!data) return;

    const now = Date.now();
    if (lastScanRef.current.data === data && now - lastScanRef.current.ts < 1500) {
      return;
    }
    lastScanRef.current = { data, ts: now };

    try {
      console.log('[QR] Scanned', data);
      const resolved = await resolveUserFromQr(data);
      const existingSession = await getStoredSession(resolved.userId);

      console.log('[QR] Resolved user', resolved);
      await AsyncStorage.setItem('userId', resolved.userId);
      await AsyncStorage.setItem('username', resolved.username);

      setSelectedUser(resolved);
      setWelcomeName(resolved.name || resolved.username || 'Employee');
      setClockInTime(existingSession?.clockInTime || '');
      setAttendanceAction(existingSession ? 'clock_out' : 'clock_in');
      setQrVerified(true);
      touchlessTriggeredRef.current = false;

      showModal(
        'success',
        'QR Code Verified',
        existingSession
          ? offlineModeEnabled
            ? 'This user already has an active clock-in. Capture the face photo and save the clock out offline.'
            : 'This user already has an active clock-in. Look at the camera and press CLOCK OUT to finish logout.'
          : offlineModeEnabled
          ? 'QR recognized. Capture the face photo and this attendance will be saved to offline sync.'
          : 'Look at the camera and press CLOCK IN to verify your face and record your attendance.',
        'A new QR scan automatically switches to the next user.'
      );
    } catch (e: any) {
      console.log('[QR] Validation error', e);
      setQrVerified(false);
      setSelectedUser(null);
      showModal('error', 'QR Validation Error', e?.message || 'Could not validate QR code.', '');
    }
  };

  const verifyFace = async (photoUri: string) => {
    let userId = null;
    try {
      userId = await AsyncStorage.getItem('userId');
    } catch {
      console.log('Could not get userId from storage');
    }

    if (!userId) {
      throw new Error('User not logged in (missing userId). Please log in again.');
    }

    console.log('[Verify] Sending face to backend', { userId });
    const form = new FormData();
    form.append(
      'photo',
      {
        uri: photoUri,
        name: 'selfie.jpg',
        type: 'image/jpeg',
      } as any
    );
    const requestTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    form.append('clock_time', requestTime);
    form.append('user_id', userId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);
    const response = await fetch(`${BACKEND_URL}/verify.php`, {
      method: 'POST',
      body: form,
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseText = await response.text();
    console.log('[Verify] Raw response', response.status, responseText?.slice?.(0, 200));

    let json: any = {};
    try {
      json = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('[Verify] JSON parse error:', parseError);
      throw new Error(`Server returned invalid response. Status: ${response.status}`);
    }

    if (response.status === 401 && json.message) {
      console.log('[Verify] Face mismatch', json);
      return {
        ok: false,
        verified: false,
        message: json.message,
        hint: json.hint,
        match_score: json.match_score,
        threshold: json.threshold,
      };
    }

    if (!response.ok || !json.ok) {
      console.log('[Verify] Error response', json);
      let errorMsg = json.message || 'Verification failed';
      if (json.detail) errorMsg += `\n\nDetail: ${json.detail}`;
      if (json.hint) errorMsg += `\n\n${json.hint}`;
      throw new Error(errorMsg);
    }

    return json;
  };

  const runVerification = useCallback(async () => {
    if (!cameraRef.current) throw new Error('Camera not ready');
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.5,
      skipProcessing: true,
      base64: false,
    });
    if (!photo?.uri) throw new Error('No image captured');
    if (offlineModeEnabled) {
      return {
        ok: true,
        verified: true,
        offlineCaptured: true,
        message: 'Face photo captured offline.',
        photoUri: photo.uri,
      };
    }

    return verifyFace(photo.uri);
  }, [offlineModeEnabled]);

  const recordAttendance = useCallback(async (action: 'clock_in' | 'clock_out') => {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) return;

    console.log('[Attendance] Recording', { userId, action });
    const res = await fetch(`${BACKEND_URL}/record_attendance.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ user_id: userId, action }),
    });

    const responseText = await res.text();
    console.log('[Attendance] Raw response', res.status, responseText?.slice?.(0, 200));

    let data: any = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      console.warn('[Attendance] record_attendance invalid JSON:', responseText?.slice?.(0, 300) || responseText);
    }

    if (!res.ok || !data.ok) {
      console.warn(
        '[Attendance] record_attendance failed:',
        data.message || res.status,
        data.detail ? `detail=${JSON.stringify(data.detail).slice(0, 300)}` : ''
      );
    }

    return data;
  }, []);

  const storeClockInNotification = useCallback(async (payload: { date?: string; timein?: string }) => {
    try {
      const date = payload?.date ? String(payload.date) : '';
      const timein = payload?.timein ? String(payload.timein) : '';
      if (!date || !timein) return;

      const id = `attendance_in_${date}_${timein}`;
      const timestamp = `${date}T${timein}`;

      const raw = await AsyncStorage.getItem('attendance_clockins');
      const prev: any[] = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(prev) ? prev : [];

      if (!next.some((x) => x && x.id === id)) {
        next.unshift({ id, date, timein, timestamp });
      }

      await AsyncStorage.setItem('attendance_clockins', JSON.stringify(next.slice(0, 20)));
    } catch {
      console.log('[Attendance] Failed to store clock-in notification');
    }
  }, []);

  const handleAttendance = useCallback(async () => {
    if (!qrVerified || !selectedUser) {
      showModal(
        'warning',
        'Scan QR Code First',
        'Please scan your personal QR code before continuing.',
        'The user must scan a QR code and then face-verify for both clock in and clock out.'
      );
      return;
    }

    if (!permission?.granted) {
      showModal('warning', 'Camera Required', 'Please allow camera access to verify your identity.', '');
      return;
    }

    console.log('[Attendance] Starting verification', { action: attendanceAction, userId: selectedUser.userId });
    setIsVerifying(true);

    try {
      const result = await runVerification();
      const action = attendanceAction;

      if (result?.ok === true) {
        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
          now.getDate()
        ).padStart(2, '0')}`;
        const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(
          2,
          '0'
        )}:${String(now.getSeconds()).padStart(2, '0')}`;
        let data: any = null;

        if (offlineModeEnabled) {
          await enqueueOfflineAttendance({
            userId: selectedUser.userId,
            username: selectedUser.username,
            name: selectedUser.name ?? null,
            action,
            date: localDate,
            time: localTime,
          });
          await refreshPendingSyncCount();
        } else {
          data = await recordAttendance(action);
        }

        if (action === 'clock_in') {
          await storeClockInNotification({ date: data?.date || localDate, timein: data?.timein || localTime });
          await saveStoredSession({
            userId: selectedUser.userId,
            username: selectedUser.username,
            name: selectedUser.name ?? null,
            clockInTime: data?.timein || localTime,
            clockInDate: data?.date || localDate,
          });
          if (!offlineModeEnabled && data?.emp_id != null) {
            await AsyncStorage.setItem('emp_id', String(data.emp_id));
          }
        } else {
          await clearStoredSession(selectedUser.userId);
        }

        await resetAttendanceFlow();
        showModal(
          'success',
          offlineModeEnabled
            ? action === 'clock_in'
              ? 'Saved For Sync'
              : 'Clock Out Saved For Sync'
            : action === 'clock_in'
            ? 'Clock In Complete'
            : 'Clock Out Complete',
          offlineModeEnabled
            ? action === 'clock_in'
              ? 'Face captured. This attendance was saved offline. Open LIST OFFLINE and press SYNC NOW when ready.'
              : 'Face captured. This clock out was saved offline. Open LIST OFFLINE and press SYNC NOW when ready.'
            : action === 'clock_in'
            ? result?.message || 'Face verified. Attendance recorded. The scanner is ready for the next user.'
            : result?.message || 'Face verified. Logout recorded. The scanner is ready for the next user.',
          ''
        );
      } else if (result?.verified === false) {
        showModal(
          'error',
          'Verification Failed',
          result?.message || 'Face verification failed.',
          result?.hint || 'Please try again.'
        );
      } else {
        showModal('error', 'Verification Failed', 'Please try again.', '');
      }
    } catch (e: any) {
      console.error('Verification error:', e);
      showModal(
        'error',
        offlineModeEnabled ? 'Offline Mode Error' : 'Connection Error',
        e?.message || 'Please try again.',
        offlineModeEnabled
          ? 'Connect once to refresh employee QR cache if this device has never seen that QR before.'
          : 'Check your internet connection'
      );
    } finally {
      setIsVerifying(false);
    }
  }, [
    attendanceAction,
    clearStoredSession,
    permission?.granted,
    qrVerified,
    recordAttendance,
    resetAttendanceFlow,
    saveStoredSession,
    selectedUser,
    showModal,
    offlineModeEnabled,
    refreshPendingSyncCount,
  ]);

  useEffect(() => {
    if (!qrVerified || !touchlessEnabled || isVerifying || touchlessTriggeredRef.current) {
      return;
    }

    touchlessTriggeredRef.current = true;
    const timer = setTimeout(() => {
      handleAttendance().catch((error) => {
        console.error('Touchless verification error:', error);
        touchlessTriggeredRef.current = false;
      });
    }, 3500);

    return () => clearTimeout(timer);
  }, [handleAttendance, isVerifying, qrVerified, touchlessEnabled]);

  if (isLoading || !permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F27121" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Camera access needed.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backArrow}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.centerStage, qrVerified ? styles.centerStageCompact : styles.centerStageCentered]}>
        <View style={[styles.cameraWrapper, { width: cameraFrameSize, height: cameraFrameSize }]}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="front"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] as any }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <View style={styles.cameraOverlay}>
            {isVerifying ? (
              <View style={styles.verifyingContainer}>
                <ActivityIndicator size="large" color="#F27121" />
                <Text style={styles.verifyingText}>Verifying face...</Text>
              </View>
            ) : (
              <View style={styles.faceFrame} />
            )}
          </View>
        </View>
      </View>

      <View style={[styles.footer, qrVerified && styles.footerCompact]}>
        {qrVerified ? <Text style={styles.welcomeText}>Welcome, {welcomeName ?? 'Employee'}!</Text> : null}

        <View style={styles.offlineToolsCard}>
          <View style={styles.offlineToolsTextBlock}>
            <Text style={styles.offlineToolsTitle}>Offline Mode</Text>
            <Text style={styles.offlineToolsText}>
              {offlineModeEnabled
                ? 'Verified attendance will be saved locally first and synced later.'
                : 'Attendance will be inserted into the database immediately.'}
            </Text>
          </View>
          <View style={styles.offlineControls}>
            {isSavingOfflineMode ? <ActivityIndicator size="small" color="#F27121" /> : null}
            <Switch
              value={offlineModeEnabled}
              onValueChange={handleOfflineModeChange}
              trackColor={{ false: '#d4dce6', true: '#f7bf94' }}
              thumbColor="#ffffff"
              ios_backgroundColor="#d4dce6"
            />
          </View>
        </View>

        <View style={styles.offlineQuickActionRow}>
          <TouchableOpacity style={styles.offlineListButton} onPress={onOpenOffline}>
            <Text style={styles.offlineListButtonText}>LIST OFFLINE</Text>
            {pendingSyncCount > 0 ? (
              <View style={styles.offlineBadge}>
                <Text style={styles.offlineBadgeText}>{pendingSyncCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.requirementSteps}>
          <View style={[styles.stepRow, qrVerified && styles.stepDone]}>
            <Text style={[styles.stepIcon, qrVerified && styles.stepIconDone]}>{qrVerified ? 'OK' : '1'}</Text>
            <Text style={styles.stepText}>QR Code</Text>
          </View>
          <View style={styles.stepRow}>
            {isVerifying ? (
              <ActivityIndicator size="small" color="#F27121" style={styles.stepSpinner} />
            ) : (
              <Text style={styles.stepIcon}>2</Text>
            )}
            <Text style={styles.stepText}>Face Recognition</Text>
          </View>
        </View>

        <View style={styles.footerTimeBlock}>
          {qrVerified ? (
            <View
              style={[
                styles.actionBadge,
                { backgroundColor: isClockingOut ? '#fde9e6' : '#fff0df', borderColor: isClockingOut ? '#d96b5f' : '#F27121' },
              ]}
            >
              <Text style={[styles.actionBadgeText, { color: isClockingOut ? '#b13d32' : '#c76417' }]}>
                {isClockingOut ? 'CLOCK OUT' : 'CLOCK IN'}
              </Text>
            </View>
          ) : null}
          <Text style={styles.footerDate}>{formattedDate}</Text>
          <Text style={styles.footerTime}>{formattedTime}</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.bigButton,
            { backgroundColor: isClockingOut ? '#C0392B' : '#F27121', opacity: isVerifying ? 0.7 : 1 },
          ]}
          onPress={handleAttendance}
          disabled={isVerifying}
        >
          {isVerifying ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>{isClockingOut ? 'CLOCK OUT' : 'CLOCK IN'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showResultModal} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.modalContainer,
              {
                transform: [{ scale: scaleAnim }],
                backgroundColor: '#fff',
              },
            ]}
          >
            <View
              style={[
                styles.modalIconContainer,
                {
                  backgroundColor:
                    modalType === 'success'
                      ? '#d4edda'
                      : modalType === 'warning'
                      ? '#fff3cd'
                      : modalType === 'info'
                      ? '#d1ecf1'
                      : '#f8d7da',
                },
              ]}
            >
              <Text style={styles.modalIcon}>
                {modalType === 'success' ? 'OK' : modalType === 'warning' ? '!' : modalType === 'info' ? 'i' : 'X'}
              </Text>
            </View>

            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Text style={styles.modalMessage}>{modalMessage}</Text>

            {modalHint ? (
              <View style={styles.modalHintContainer}>
                <Text style={styles.modalHintIcon}>i</Text>
                <Text style={styles.modalHint}>{modalHint}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.modalButton,
                {
                  backgroundColor:
                    modalType === 'success'
                      ? '#28a745'
                      : modalType === 'warning'
                      ? '#ffc107'
                      : modalType === 'info'
                      ? '#17a2b8'
                      : '#dc3545',
                },
              ]}
              onPress={closeModal}
            >
              <Text style={styles.modalButtonText}>
                {modalType === 'success' ? 'Great' : modalType === 'warning' ? 'Got it' : modalType === 'info' ? 'OK' : 'Try Again'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  permissionButton: {
    marginTop: 12,
    backgroundColor: '#F27121',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  permissionText: { color: '#fff', fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 },
  backButton: { padding: 10 },
  backArrow: { color: '#1f2a37', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2a37' },
  headerSpacer: { width: 44 },
  centerStage: { flex: 1, minHeight: 0 },
  centerStageCentered: { justifyContent: 'center', alignItems: 'center' },
  centerStageCompact: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 10,
  },
  cameraWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#F27121',
    backgroundColor: '#000',
    alignSelf: 'center',
  },
  camera: { flex: 1 },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  faceFrame: {
    width: '78%',
    height: '78%',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderStyle: 'dashed',
  },
  verifyingContainer: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 20, borderRadius: 10 },
  verifyingText: { color: '#fff', marginTop: 10, fontWeight: '700' },
  footer: {
    padding: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    backgroundColor: '#f7f4f0',
  },
  footerCompact: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  welcomeText: {
    textAlign: 'center',
    color: '#1f2a37',
    fontWeight: '700',
    marginBottom: 10,
  },
  offlineToolsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  offlineToolsTextBlock: {
    flex: 1,
    paddingRight: 14,
  },
  offlineToolsTitle: {
    color: '#1f2a37',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  offlineToolsText: {
    color: '#6b7785',
    fontSize: 13,
    lineHeight: 19,
  },
  offlineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineQuickActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  offlineListButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f0c29c',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  offlineListButtonText: {
    color: '#F27121',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  offlineBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F27121',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 5,
  },
  offlineBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  requirementSteps: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  stepDone: { opacity: 1 },
  stepIcon: {
    fontSize: 12,
    color: '#8b96a3',
    width: 22,
    height: 22,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderWidth: 1,
    borderColor: '#c9d1da',
    borderRadius: 11,
    overflow: 'hidden',
    paddingTop: 2,
  },
  stepIconDone: { color: '#2ecc71', borderColor: '#2ecc71' },
  stepSpinner: { marginRight: 8 },
  stepText: { fontSize: 13, marginLeft: 6, fontWeight: '600', color: '#6f7b89' },
  footerTimeBlock: { alignItems: 'center', marginBottom: 20 },
  actionBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  actionBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerDate: { fontSize: 13, color: '#6f7b89' },
  footerTime: { fontSize: 40, fontWeight: 'bold', color: '#1f2a37' },
  bigButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderRadius: 15,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 25,
    padding: 30,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  modalIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIcon: { fontSize: 32, fontWeight: '800' },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#1f2a37',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 24,
    color: '#5b6674',
  },
  modalHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1ecf1',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  modalHintIcon: { color: '#17a2b8', fontWeight: '800', marginRight: 8 },
  modalHint: {
    fontSize: 14,
    color: '#0c5460',
    marginLeft: 8,
    flex: 1,
  },
  modalButton: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginTop: 10,
    minWidth: 150,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
