import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BACKEND_URL } from '../config/backend';
import { OFFLINE_MODE_KEY } from '../utils/offlineAttendance';

const TOUCHLESS_SETTING_KEY = 'settings_touchless_enabled';

type Props = {
  onBack: () => void;
};

type SettingRowProps = {
  title: string;
  description?: string;
  extraText?: string[];
  action?: ReactNode;
  danger?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

type BackendSettings = {
  attendance_location?: {
    latitude?: number;
    longitude?: number;
  };
  attendance_interval_minutes?: number;
  updated_at?: string;
};

type DialogMode = 'password' | 'interval' | null;

function formatCoordinate(label: string, value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return `${label} : Not set`;
  }
  return `${label} : ${value.toFixed(7)}`;
}

function SettingRow({ title, description, extraText = [], action, danger = false, onPress, disabled = false }: SettingRowProps) {
  const content = (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
        {extraText.map((item) => (
          <Text key={item} style={styles.rowMeta}>
            {item}
          </Text>
        ))}
      </View>
      {action ? <View style={styles.rowAction}>{action}</View> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={styles.rowPressable}>
        {content}
      </Pressable>
    );
  }

  return content;
}

export default function Settings({ onBack }: Props) {
  const [touchlessEnabled, setTouchlessEnabled] = useState(false);
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTouchless, setIsSavingTouchless] = useState(false);
  const [isSavingOfflineMode, setIsSavingOfflineMode] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isSubmittingDialog, setIsSubmittingDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [intervalInput, setIntervalInput] = useState('');
  const [backendSettings, setBackendSettings] = useState<BackendSettings>({
    attendance_location: {
      latitude: 14.6130261,
      longitude: 120.9937274,
    },
    attendance_interval_minutes: 5,
  });

  const locationLines = useMemo(() => {
    const location = backendSettings.attendance_location || {};
    return [formatCoordinate('Lat', location.latitude), formatCoordinate('Long', location.longitude)];
  }, [backendSettings.attendance_location]);

  const loadSettings = useCallback(async () => {
    try {
      const [settingsEntries, response] = await Promise.all([
        AsyncStorage.multiGet([TOUCHLESS_SETTING_KEY, OFFLINE_MODE_KEY]),
        fetch(`${BACKEND_URL}/settings.php`, {
          headers: {
            Accept: 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
        }),
      ]);

      const localSettings = Object.fromEntries(settingsEntries);
      setTouchlessEnabled(localSettings[TOUCHLESS_SETTING_KEY] === 'true');
      setOfflineModeEnabled(localSettings[OFFLINE_MODE_KEY] === 'true');

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `Settings request failed (${response.status})`);
      }

      setBackendSettings((prev) => ({
        ...prev,
        ...payload.settings,
      }));
      setIntervalInput(String(payload.settings?.attendance_interval_minutes ?? 5));
    } catch (error: any) {
      Alert.alert('Settings', error?.message || 'Failed to load settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleTouchlessChange = useCallback(async (value: boolean) => {
    setTouchlessEnabled(value);
    setIsSavingTouchless(true);
    try {
      await AsyncStorage.setItem(TOUCHLESS_SETTING_KEY, value ? 'true' : 'false');
    } catch {
      setTouchlessEnabled(!value);
      Alert.alert('Touchless', 'Failed to save touchless setting.');
    } finally {
      setIsSavingTouchless(false);
    }
  }, []);

  const handleOfflineModeChange = useCallback(async (value: boolean) => {
    setOfflineModeEnabled(value);
    setIsSavingOfflineMode(true);
    try {
      await AsyncStorage.setItem(OFFLINE_MODE_KEY, value ? 'true' : 'false');
    } catch {
      setOfflineModeEnabled(!value);
      Alert.alert('Offline Mode', 'Failed to save offline mode setting.');
    } finally {
      setIsSavingOfflineMode(false);
    }
  }, []);

  const saveBackendSettings = useCallback(async (body: Record<string, any>) => {
    const response = await fetch(`${BACKEND_URL}/settings.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || `Settings save failed (${response.status})`);
    }

    setBackendSettings((prev) => ({
      ...prev,
      ...payload.settings,
    }));

    return payload;
  }, []);

  const handleSetAttendanceLocation = useCallback(async () => {
    setIsSavingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Location permission is required to set the attendance location.');
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      await saveBackendSettings({
        action: 'set_location',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      Alert.alert('Attendance Location', 'Attendance location updated successfully.');
    } catch (error: any) {
      Alert.alert('Attendance Location', error?.message || 'Failed to update attendance location.');
    } finally {
      setIsSavingLocation(false);
    }
  }, [saveBackendSettings]);

  const openPasswordDialog = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setDialogMode('password');
  }, []);

  const openIntervalDialog = useCallback(() => {
    setIntervalInput(String(backendSettings.attendance_interval_minutes ?? 5));
    setDialogMode('interval');
  }, [backendSettings.attendance_interval_minutes]);

  const closeDialog = useCallback(() => {
    if (isSubmittingDialog) return;
    setDialogMode(null);
    setCurrentPassword('');
    setNewPassword('');
  }, [isSubmittingDialog]);

  const handleDialogSubmit = useCallback(async () => {
    if (!dialogMode) return;

    setIsSubmittingDialog(true);
    try {
      if (dialogMode === 'password') {
        if (!currentPassword.trim() || !newPassword.trim()) {
          throw new Error('Enter both current and new admin password.');
        }

        await saveBackendSettings({
          action: 'change_admin_password',
          current_password: currentPassword,
          new_password: newPassword,
        });
        Alert.alert('Admin Password', 'Admin password updated successfully.');
      }

      if (dialogMode === 'interval') {
        const parsed = Number(intervalInput);
        if (!Number.isInteger(parsed) || parsed < 1) {
          throw new Error('Attendance interval must be a whole number greater than 0.');
        }

        await saveBackendSettings({
          action: 'set_interval',
          interval_minutes: parsed,
        });
        setIntervalInput(String(parsed));
        Alert.alert('Attendance Interval', 'Attendance interval updated successfully.');
      }

      closeDialog();
    } catch (error: any) {
      Alert.alert('Settings', error?.message || 'Failed to save setting.');
    } finally {
      setIsSubmittingDialog(false);
    }
  }, [closeDialog, currentPassword, dialogMode, intervalInput, newPassword, saveBackendSettings]);

  const handleLogout = useCallback(() => {
    Alert.alert('Logout', 'Clear the current stored session and return to the home screen?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.multiRemove(['userId', 'username', 'emp_id']);
            onBack();
          } catch {
            Alert.alert('Logout', 'Failed to clear local session.');
          }
        },
      },
    ]);
  }, [onBack]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#cf8d8f" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backArrow}>{'<'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <SettingRow
            title="Touchless"
            description="Enable take picture without tap button in application"
            action={
              <View style={styles.switchWrap}>
                {isSavingTouchless ? <ActivityIndicator size="small" color="#cf8d8f" /> : null}
                <Switch
                  value={touchlessEnabled}
                  onValueChange={handleTouchlessChange}
                  trackColor={{ false: '#d8dde6', true: '#e9b8b5' }}
                  thumbColor="#f7f8fb"
                  ios_backgroundColor="#d8dde6"
                />
              </View>
            }
          />

          <SettingRow
            title="Offline Mode"
            description="Save verified attendance locally first and insert it into the database only when you press sync"
            action={
              <View style={styles.switchWrap}>
                {isSavingOfflineMode ? <ActivityIndicator size="small" color="#cf8d8f" /> : null}
                <Switch
                  value={offlineModeEnabled}
                  onValueChange={handleOfflineModeChange}
                  trackColor={{ false: '#d8dde6', true: '#e9b8b5' }}
                  thumbColor="#f7f8fb"
                  ios_backgroundColor="#d8dde6"
                />
              </View>
            }
          />

          <SettingRow title="Admin Password" description="Tap here to change Admin Password" onPress={openPasswordDialog} />

          <SettingRow
            title="Attendance Location"
            description={isSavingLocation ? 'Updating attendance location...' : 'Set Attendance Location'}
            extraText={locationLines}
            onPress={handleSetAttendanceLocation}
            disabled={isSavingLocation}
            action={isSavingLocation ? <ActivityIndicator size="small" color="#cf8d8f" /> : null}
          />

          <SettingRow
            title="Attendance Interval"
            description={`Sending attendance data interval in minutes${typeof backendSettings.attendance_interval_minutes === 'number' ? ` (${backendSettings.attendance_interval_minutes} min)` : ''}`}
            onPress={openIntervalDialog}
          />

          <SettingRow title="Logout" danger onPress={handleLogout} />
        </ScrollView>
      </View>

      <Modal visible={dialogMode !== null} transparent animationType="fade" onRequestClose={closeDialog}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{dialogMode === 'password' ? 'Change Admin Password' : 'Attendance Interval'}</Text>

            {dialogMode === 'password' ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Current admin password"
                  placeholderTextColor="#b4bccb"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                />
                <TextInput
                  style={styles.input}
                  placeholder="New admin password"
                  placeholderTextColor="#b4bccb"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
                <Text style={styles.modalHint}>Default admin password: `admin123`</Text>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Minutes"
                  placeholderTextColor="#b4bccb"
                  value={intervalInput}
                  onChangeText={setIntervalInput}
                  keyboardType="number-pad"
                />
                <Text style={styles.modalHint}>Choose how often attendance data should be sent.</Text>
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalButton, styles.modalButtonSecondary]} onPress={closeDialog} disabled={isSubmittingDialog}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleDialogSubmit} disabled={isSubmittingDialog}>
                {isSubmittingDialog ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f8fb',
  },
  container: {
    flex: 1,
    backgroundColor: '#f7f8fb',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#6c7382',
    fontSize: 16,
  },
  header: {
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#f7f8fb',
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backArrow: {
    fontSize: 28,
    color: '#4a5060',
    lineHeight: 30,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '500',
    color: '#273142',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  rowPressable: {
    backgroundColor: '#fbfcfe',
  },
  row: {
    minHeight: 102,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 18,
    backgroundColor: '#fbfcfe',
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5',
  },
  rowDisabled: {
    opacity: 0.72,
  },
  rowTextBlock: {
    flex: 1,
    paddingRight: 16,
  },
  rowTitle: {
    fontSize: 24,
    fontWeight: '500',
    color: '#d38d8a',
    marginBottom: 8,
  },
  rowTitleDanger: {
    marginBottom: 0,
  },
  rowDescription: {
    fontSize: 17,
    color: '#c6ccda',
    lineHeight: 24,
  },
  rowMeta: {
    fontSize: 17,
    color: '#bfc6d6',
    lineHeight: 24,
    marginTop: 4,
  },
  rowAction: {
    marginLeft: 12,
  },
  switchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 39, 55, 0.36)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#273142',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e4e8ef',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#273142',
    marginBottom: 12,
    backgroundColor: '#fafbfd',
  },
  modalHint: {
    color: '#8b93a3',
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 22,
    gap: 10,
  },
  modalButton: {
    minWidth: 96,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#eff2f7',
  },
  modalButtonPrimary: {
    backgroundColor: '#cf8d8f',
  },
  modalButtonSecondaryText: {
    color: '#4e5666',
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
