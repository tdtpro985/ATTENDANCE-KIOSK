import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera, CameraProps } from 'react-native-vision-camera';
import * as ScreenOrientation from 'expo-screen-orientation';
import AnimatedReanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { styles } from './styles';
import type { ResolvedUser } from './types';
import type { FaceEngine } from '../settings/features/FaceRecogEngineFeature';
import type { CameraVisionFaceTelemetry, FaceScanStage } from './types';

type Props = {
  device: CameraProps['device'];
  cameraRef: React.RefObject<Camera | null>;
  frameProcessor: any;
  flashAnim: Animated.Value;
  scanLineAnim: Animated.Value;
  formattedTime: string;
  formattedDate: string;
  isVerifying: boolean;
  isCapturingHardware: boolean;
  isClockingOut: boolean;
  touchlessEnabled: boolean;
  offlineModeEnabled: boolean;
  livenessEnabled: boolean;
  faceEngine: FaceEngine;
  scanStage: FaceScanStage;
  cameraVisionFaceDetected: boolean;
  cameraVisionReadiness: number;
  cameraVisionFaceBox: { left: number; top: number; width: number; height: number } | null;
  cameraVisionFaceTelemetry: CameraVisionFaceTelemetry | null;
  successAnimationTick: number;
  pendingSyncCount: number;
  faceCountdown: number;
  clockInTime: string;
  selectedUser: ResolvedUser | null;
  accentColor: string;
  livenessMessage: string;
  onBack: () => void;
  onOpenOffline: () => void;
  onAttendance: () => void;
};

export default function FaceScanView({
  device,
  cameraRef,
  frameProcessor,
  flashAnim,
  scanLineAnim,
  formattedTime,
  formattedDate,
  isVerifying,
  isCapturingHardware,
  isClockingOut,
  touchlessEnabled,
  offlineModeEnabled,
  livenessEnabled,
  faceEngine,
  scanStage,
  cameraVisionFaceDetected,
  cameraVisionReadiness,
  cameraVisionFaceBox,
  cameraVisionFaceTelemetry,
  successAnimationTick,
  pendingSyncCount,
  faceCountdown,
  clockInTime,
  selectedUser,
  accentColor,
  livenessMessage,
  onBack,
  onOpenOffline,
  onAttendance,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;

  // Track the actual device orientation via Expo to apply manual rotation fixes on Android
  const [orientation, setOrientation] = useState<ScreenOrientation.Orientation>(
    ScreenOrientation.Orientation.PORTRAIT_UP
  );

  useEffect(() => {
    let subscription: ScreenOrientation.Subscription;
    ScreenOrientation.getOrientationAsync().then(setOrientation);
    subscription = ScreenOrientation.addOrientationChangeListener((evt) => {
      setOrientation(evt.orientationInfo.orientation);
    });
    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  const successScale = useState(() => new Animated.Value(0.75))[0];
  useEffect(() => {
    if (scanStage !== 'success') return;
    successScale.setValue(0.75);
    Animated.sequence([
      Animated.spring(successScale, { toValue: 1.15, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.spring(successScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
    ]).start();
  }, [scanStage, successAnimationTick, successScale]);

  // Determine if we need to apply a manual rotation fix for Android + FrameProcessor
  const requiresAndroidRotationFix = Platform.OS === 'android' && (livenessEnabled || faceEngine === 'camera_vision');
  
  // Calculate scale to prevent squishing when applying CSS rotation to a non-square container
  const cameraContainerWidth = isLandscape ? width * 0.6 : width;
  const cameraContainerHeight = height;
  const scaleRatio = Math.max(
    cameraContainerWidth / cameraContainerHeight,
    cameraContainerHeight / cameraContainerWidth
  );
  
  let cameraTransform: any[] = [];
  if (requiresAndroidRotationFix) {
    if (orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT) {
      cameraTransform = [{ rotate: '90deg' }, { scale: scaleRatio }];
    } else if (orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT) {
      cameraTransform = [{ rotate: '-90deg' }, { scale: scaleRatio }];
    } else if (orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN) {
      cameraTransform = [{ rotate: '180deg' }];
    }
  }

  const isCameraVisionMode = faceEngine === 'camera_vision';
  const detectionPercent = Math.max(0, Math.min(100, Math.round(cameraVisionReadiness)));

  // Fallback normalized box (0..1) and pixel fallback derived from window size
  const fallbackFaceBoxNormalized = { left: 0.42, top: 0.08, width: 0.36, height: 0.5 };
  const fallbackFaceBoxPx = {
    left: Math.round(width * fallbackFaceBoxNormalized.left),
    top: Math.round(height * fallbackFaceBoxNormalized.top),
    width: Math.round(width * fallbackFaceBoxNormalized.width),
    height: Math.round(height * fallbackFaceBoxNormalized.height),
  };

  const animatedFaceBoxLeft = useSharedValue(fallbackFaceBoxPx.left);
  const animatedFaceBoxTop = useSharedValue(fallbackFaceBoxPx.top);
  const animatedFaceBoxWidth = useSharedValue(fallbackFaceBoxPx.width);
  const animatedFaceBoxHeight = useSharedValue(fallbackFaceBoxPx.height);

  useEffect(() => {
    const animation = { duration: 100 };
    if (!cameraVisionFaceBox) {
      animatedFaceBoxLeft.value = withTiming(fallbackFaceBoxPx.left, animation);
      animatedFaceBoxTop.value = withTiming(fallbackFaceBoxPx.top, animation);
      animatedFaceBoxWidth.value = withTiming(fallbackFaceBoxPx.width, animation);
      animatedFaceBoxHeight.value = withTiming(fallbackFaceBoxPx.height, animation);
      return;
    }

    let nextPx: { left: number; top: number; width: number; height: number };
    // If cameraVisionFaceBox is normalized (values <= 1), map to screen pixels
    if (cameraVisionFaceBox.width <= 1 && cameraVisionFaceBox.height <= 1) {
      nextPx = {
        left: Math.round(cameraVisionFaceBox.left * width),
        top: Math.round(cameraVisionFaceBox.top * height),
        width: Math.round(cameraVisionFaceBox.width * width),
        height: Math.round(cameraVisionFaceBox.height * height),
      };
    } else {
      // Already in pixel coordinates
      nextPx = {
        left: cameraVisionFaceBox.left,
        top: cameraVisionFaceBox.top,
        width: cameraVisionFaceBox.width,
        height: cameraVisionFaceBox.height,
      };
    }

    animatedFaceBoxLeft.value = withTiming(nextPx.left, animation);
    animatedFaceBoxTop.value = withTiming(nextPx.top, animation);
    animatedFaceBoxWidth.value = withTiming(nextPx.width, animation);
    animatedFaceBoxHeight.value = withTiming(nextPx.height, animation);
  }, [cameraVisionFaceBox, animatedFaceBoxLeft, animatedFaceBoxTop, animatedFaceBoxWidth, animatedFaceBoxHeight, width, height]);

  const animatedFaceBoxStyle = useAnimatedStyle(() => ({
    left: animatedFaceBoxLeft.value,
    top: animatedFaceBoxTop.value,
    width: animatedFaceBoxWidth.value,
    height: animatedFaceBoxHeight.value,
  }));

  const eyeStatusLabel = (() => {
    switch (cameraVisionFaceTelemetry?.eyeStatus) {
      case 'open':
        return 'Open';
      case 'closed':
        return 'Closed';
      case 'mixed':
        return 'Blinking';
      default:
        return 'Unknown';
    }
  })();
  const formatAngle = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${Math.round(value)}°` : '--';
  const yawLabel = formatAngle(cameraVisionFaceTelemetry?.yaw);
  const pitchLabel = formatAngle(cameraVisionFaceTelemetry?.pitch);

  const showProcessingSpinner =
    isCapturingHardware ||
    isVerifying ||
    scanStage === 'capturing' ||
    scanStage === 'verifying' ||
    scanStage === 'recording';
  const showDetectionOverlay =
    isCameraVisionMode &&
    cameraVisionFaceDetected &&
    !!cameraVisionFaceBox &&
    !showProcessingSpinner &&
    scanStage !== 'success';
  const detectionLabel = cameraVisionFaceDetected ? `TRACKING ${detectionPercent}%` : 'SEARCHING...';

  const instructionText = (() => {
    if (scanStage === 'success') return 'FACE VERIFIED';
    if (showProcessingSpinner) return isClockingOut ? 'PROCESSING LOGOUT...' : 'VERIFYING IDENTITY...';
    if (isCameraVisionMode && scanStage === 'detecting') {
      return cameraVisionFaceDetected ? `FACE READY ${detectionPercent}%` : 'SEARCHING FOR FACE...';
    }
    if (faceCountdown > 0 && touchlessEnabled) return `GET READY... ${faceCountdown}`;
    return 'LOOK AT THE CAMERA';
  })();

  const hintText = (() => {
    if (scanStage === 'success') return 'Success';
    if (showProcessingSpinner) return 'Please wait...';
    if (isCameraVisionMode && scanStage === 'detecting') {
      return cameraVisionFaceDetected ? 'Hold steady for automatic capture' : 'Center your face in the frame';
    }
    if (faceCountdown > 0) return 'Position your face';
    return livenessMessage;
  })();

  // Portrait mode (phones) — full-screen camera with compact profile bar
  if (!isLandscape) {
    return (
      <View style={styles.portraitFaceContainer}>
        <Camera
          ref={cameraRef}
          style={[styles.fullScreenCamera, { transform: cameraTransform }]}
          device={device}
          isActive={true}
          photo={true}
          frameProcessor={frameProcessor}
          androidPreviewViewType="texture-view"
          outputOrientation="device"
          resizeMode="cover"
        />
        <Animated.View style={[styles.snapFlash, { opacity: flashAnim }]} pointerEvents="none" />
        <View style={styles.cameraTintLight} pointerEvents="none" />

        <SafeAreaView style={styles.overlaySafeArea} edges={['top', 'left', 'right', 'bottom']}>
          <View>
            <View style={styles.newHeader}>
              <View style={styles.headerLeft}>
                <TouchableOpacity onPress={onBack} style={styles.headerIconButton}>
                  <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={onOpenOffline} style={[styles.headerIconButton, { marginLeft: 10 }]}>
                  <MaterialCommunityIcons name="history" size={22} color="#fff" />
                  {pendingSyncCount > 0 && <View style={styles.headerSyncBadge} />}
                </TouchableOpacity>
              </View>
              <View style={styles.headerCenter}>
                <Text style={styles.topTime}>{formattedTime}</Text>
                <Text style={styles.topDate}>{formattedDate}</Text>
              </View>
              <View style={styles.headerRight}>
                <View
                  style={[styles.miniOfflineBadge, offlineModeEnabled && styles.miniOfflineBadgeActive]}
                >
                  <MaterialCommunityIcons name={offlineModeEnabled ? 'cloud-off' : 'cloud-check'} size={18} color="#fff" />
                  <Text style={styles.miniOfflineText}>{offlineModeEnabled ? 'OFFLINE' : 'ONLINE'}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.portraitProfileBar, { backgroundColor: accentColor }]}>
              {selectedUser?.profile_picture ? (
                <Image source={{ uri: selectedUser.profile_picture }} style={styles.portraitProfileImage} />
              ) : (
                <View style={styles.portraitProfilePlaceholder}>
                  <MaterialCommunityIcons name="account" size={28} color="#fff" />
                </View>
              )}
              <View style={styles.portraitProfileInfo}>
                <Text style={styles.portraitProfileName} numberOfLines={1}>
                  {selectedUser?.name || selectedUser?.username || 'Employee'}
                </Text>
                <Text style={styles.portraitProfileRole} numberOfLines={1}>
                  {selectedUser?.role || 'Staff'} • {selectedUser?.department || 'Dept'}
                </Text>
              </View>
              {isClockingOut && clockInTime ? (
                <View style={styles.clockInTimeContainer}>
                  <MaterialCommunityIcons name="clock-outline" size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={[styles.clockInTimeText, { fontSize: 12 }]}>{clockInTime}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.scannerOverlayContainer}>
            <View style={styles.faceScannerArea}>
              <View style={styles.faceFrame}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
                {!isVerifying && !isCapturingHardware && (
                  <Animated.View
                    style={[
                      styles.scanLine,
                      {
                        transform: [{
                          translateY: scanLineAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 240],
                          }),
                        }],
                      },
                    ]}
                  />
                )}
                {scanStage === 'success' ? (
                  <Animated.View style={[styles.successIconWrap, { transform: [{ scale: successScale }] }]}>
                    <MaterialCommunityIcons name="check-circle" size={118} color="#4ade80" />
                  </Animated.View>
                ) : showProcessingSpinner ? (
                  <ActivityIndicator size={80} color="#F27121" style={styles.faceIconBackground} />
                ) : (faceCountdown > 0 && touchlessEnabled) ? (
                  <Text style={styles.countdownText}>{faceCountdown}</Text>
                ) : (
                  <MaterialCommunityIcons name="face-recognition" size={120} color="rgba(255,255,255,0.2)" style={styles.faceIconBackground} />
                )}
              </View>
              {showDetectionOverlay && (
                <View style={styles.fullScreenDetectionOverlay} pointerEvents="none">
                  <AnimatedReanimated.View
                    style={[
                      styles.detectionFaceBox,
                      cameraVisionFaceDetected && styles.detectionFaceBoxActive,
                      animatedFaceBoxStyle,
                    ]}
                  />
                  <View style={[styles.detectionBadge, { position: 'absolute', top: 12, left: 12 }]}>
                    <Text style={styles.detectionBadgeText}>{detectionLabel}</Text>
                  </View>
                  <View style={[styles.detectionStatusCard, { position: 'absolute', top: 12, right: 12 }]}>
                    <Text style={styles.detectionStatusText}>Yaw: {yawLabel}</Text>
                    <Text style={styles.detectionStatusText}>Pitch: {pitchLabel}</Text>
                    <Text style={styles.detectionStatusText}>Eyes: {eyeStatusLabel}</Text>
                  </View>
                </View>
              )}
              <Text style={styles.scanInstructionText}>
                {instructionText}
              </Text>
              <Text style={styles.faceHintText}>
                {hintText}
              </Text>
            </View>
          </View>

          <View style={styles.portraitFooter}>
            {showProcessingSpinner ? (
              <View style={styles.verifyingPill}>
                <ActivityIndicator size="small" color="#F27121" />
                <Text style={styles.verifyingPillText}>
                  {scanStage === 'capturing' ? 'Capturing...' : isClockingOut ? 'Processing Logout...' : 'Verifying Identity...'}
                </Text>
              </View>
            ) : (
              !touchlessEnabled && (
                <View style={styles.footerButtons}>
                  <TouchableOpacity
                    style={[styles.mainActionButton, { backgroundColor: isClockingOut ? '#C0392B' : accentColor }]}
                    onPress={onAttendance}
                    disabled={isVerifying || isCapturingHardware}
                  >
                    <Text style={styles.mainActionButtonText}>
                      {isClockingOut ? 'CONFIRM CLOCK OUT' : 'CONFIRM CLOCK IN'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Landscape mode (tablets) — 40/60 split screen
  return (
    <View style={styles.splitScreenContainer}>
      <View style={[styles.leftPanel, { backgroundColor: accentColor }]}>
        <SafeAreaView style={styles.panelSafeArea} edges={['top', 'left', 'bottom']}>
          <View style={styles.leftPanelHeader}>
            <TouchableOpacity onPress={onBack} style={styles.headerIconButtonLight}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={accentColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onOpenOffline} style={[styles.headerIconButtonLight, { marginLeft: 10 }]}>
              <MaterialCommunityIcons name="history" size={22} color={accentColor} />
              {pendingSyncCount > 0 && <View style={styles.headerSyncBadge} />}
            </TouchableOpacity>
          </View>

          <View style={styles.profileInfoContainer}>
            <View style={styles.profileImageContainer}>
              {selectedUser?.profile_picture ? (
                <Image source={{ uri: selectedUser.profile_picture }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <MaterialCommunityIcons name="account" size={100} color={accentColor} />
                </View>
              )}
              {!isVerifying && !isCapturingHardware && (
                <View style={styles.verifiedBadge}>
                  <MaterialCommunityIcons name="check-circle" size={32} color="#4ade80" />
                </View>
              )}
            </View>
            <Text style={styles.profileName}>{selectedUser?.name || selectedUser?.username || 'Employee'}</Text>
            <Text style={styles.profileRole}>{selectedUser?.role || 'Staff Member'}</Text>
            <Text style={styles.profileDept}>{selectedUser?.department || 'Department'}</Text>
            {isClockingOut && clockInTime ? (
              <View style={styles.clockInTimeContainer}>
                <MaterialCommunityIcons name="clock-outline" size={18} color="rgba(255,255,255,0.8)" />
                <Text style={styles.clockInTimeText}>Clocked In at: {clockInTime}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.leftPanelFooter}>
            {showProcessingSpinner ? (
              <View style={styles.verifyingPillLeft}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={[styles.verifyingPillTextLeft, { color: accentColor }]}>
                  {scanStage === 'capturing' ? 'Capturing...' : isClockingOut ? 'Processing Logout...' : 'Verifying Identity...'}
                </Text>
              </View>
            ) : (
              !touchlessEnabled && (
                <TouchableOpacity
                  style={[styles.mainActionButtonLeft, { backgroundColor: isClockingOut ? '#C0392B' : '#fff' }]}
                  onPress={onAttendance}
                  disabled={isVerifying || isCapturingHardware}
                >
                  <Text style={[styles.mainActionButtonTextLeft, { color: isClockingOut ? '#fff' : accentColor }]}>
                    {isClockingOut ? 'CONFIRM CLOCK OUT' : 'CONFIRM CLOCK IN'}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.rightPanel}>
        <Camera
          ref={cameraRef}
          style={[styles.fullScreenCamera, { transform: cameraTransform }]}
          device={device}
          isActive={true}
          photo={true}
          frameProcessor={frameProcessor}
          androidPreviewViewType="texture-view"
          outputOrientation="device"
          resizeMode="cover"
        />
        <Animated.View style={[styles.snapFlash, { opacity: flashAnim }]} pointerEvents="none" />
        <View style={styles.cameraTintLight} pointerEvents="none" />

        <SafeAreaView style={styles.cameraSafeArea} edges={['top', 'right', 'bottom']}>
          <View style={styles.rightPanelHeader}>
            <View style={styles.headerCenterRight}>
              <Text style={styles.topTimeRight}>{formattedTime}</Text>
              <Text style={styles.topDateRight}>{formattedDate}</Text>
            </View>
            <View
              style={[styles.miniOfflineBadge, offlineModeEnabled && styles.miniOfflineBadgeActive]}
            >
              <MaterialCommunityIcons name={offlineModeEnabled ? 'cloud-off' : 'cloud-check'} size={18} color="#fff" />
              <Text style={styles.miniOfflineText}>{offlineModeEnabled ? 'OFFLINE' : 'ONLINE'}</Text>
            </View>
          </View>

          <View style={styles.faceScannerAreaRight}>
            <View style={styles.faceFrame}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
              {!isVerifying && !isCapturingHardware && (
                <Animated.View
                  style={[
                    styles.scanLine,
                    {
                      transform: [{
                        translateY: scanLineAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 240],
                        }),
                      }],
                    },
                  ]}
                />
              )}
              {scanStage === 'success' ? (
                <Animated.View style={[styles.successIconWrap, { transform: [{ scale: successScale }] }]}>
                  <MaterialCommunityIcons name="check-circle" size={118} color="#4ade80" />
                </Animated.View>
              ) : showProcessingSpinner ? (
                <ActivityIndicator size={80} color="#F27121" style={styles.faceIconBackground} />
              ) : (faceCountdown > 0 && touchlessEnabled) ? (
                <Text style={styles.countdownText}>{faceCountdown}</Text>
              ) : (
                <MaterialCommunityIcons name="face-recognition" size={120} color="rgba(255,255,255,0.2)" style={styles.faceIconBackground} />
              )}
            </View>
            {showDetectionOverlay && (
              <View style={styles.fullScreenDetectionOverlay} pointerEvents="none">
                <AnimatedReanimated.View
                  style={[
                    styles.detectionFaceBox,
                    cameraVisionFaceDetected && styles.detectionFaceBoxActive,
                    animatedFaceBoxStyle,
                  ]}
                />
                <View style={[styles.detectionBadge, { position: 'absolute', top: 12, left: 12 }]}>
                  <Text style={styles.detectionBadgeText}>{detectionLabel}</Text>
                </View>
                <View style={[styles.detectionStatusCard, { position: 'absolute', top: 12, right: 12 }]}>
                  <Text style={styles.detectionStatusText}>Yaw: {yawLabel}</Text>
                  <Text style={styles.detectionStatusText}>Pitch: {pitchLabel}</Text>
                  <Text style={styles.detectionStatusText}>Eyes: {eyeStatusLabel}</Text>
                </View>
              </View>
            )}
            <Text style={styles.scanInstructionTextRight}>
              {instructionText}
            </Text>
            <Text style={styles.faceHintTextRight}>
              {hintText}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}
