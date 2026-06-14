# ⚡ Attendance Scanner — Samsung A7 Tab Lite Optimization Plan

## The Hardware Gap

| Spec | Samsung S10+ (test device) | Samsung A7 Tab Lite (production) |
|------|---------------------------|--------------------------------|
| **CPU** | Snapdragon 855 / Exynos 9820 (flagship) | MediaTek Helio P22T (entry-level) |
| **RAM** | 6–12 GB | 2–4 GB |
| **CPU multi-core** | ~3500 (Geekbench) | ~900 (Geekbench) |
| **Expected slowdown** | Baseline | **~3–4× slower** |

> [!CAUTION]
> Your current pipeline takes ~3–4.5s on the S10+. On the A7 Tab Lite, expect **~8–12 seconds** without optimization. That's unusable for attendance.

---

## What's Already Good ✅

Based on the actual codebase, you've already done several things right:

| What | Status | Where |
|------|--------|-------|
| XNNPACK execution provider | ✅ Already enabled | [model.ts L25-32](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/faceEngine/model.ts) — `['xnnpack', 'cpu']` |
| Graph optimizations | ✅ Already enabled | [model.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/faceEngine/model.ts) — `graphOptimizationLevel: 'all'` |
| Memory arena | ✅ Already enabled | [model.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/faceEngine/model.ts) — `enableCpuMemArena: true` |
| Session singleton | ✅ Already cached | [model.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/faceEngine/model.ts) |
| Camera quality priority | ✅ Set to 'speed' | [useAttendance.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/screens/attendance/useAttendance.ts) |
| `rgbaBufferToCHWTensor` | ✅ Already exists | [preprocess.ts L44-76](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/faceEngine/preprocess.ts) |
| MMKV caching | ✅ Optimal | Synchronous, fastest RN storage |
| Smart early-exit on shot 1 | ✅ Already implemented | [useAttendance.ts L1246-1257](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/screens/attendance/useAttendance.ts) |

---

## The Actual Pipeline (Where Time Goes)

Here's what `captureEmbeddingFromPhoto()` does on the **primary path (Tier 1)**:

```
takePhoto() → 1920×1080 JPEG on disk
      ↓
RNImage.getSize() → resolve dimensions
      ↓
Calculate face box + adaptive padding (2.0× far, 1.6× close)
      ↓
ImageManipulator.manipulateAsync()
  → crop face region to square
  → resize to 112×112
  → encode as JPEG (compress 0.95)
  → return base64 string                              ← native, relatively fast
      ↓
prepareEmbeddingInput(base64)
  → base64ToPixels(base64)
    → atob() → Uint8Array
    → jpeg.decode(binary) ← 🔴 PURE JS JPEG DECODER   ← BOTTLENECK #1
  → preprocessFace(rgba)
    → RGBA → CHW Float32 normalization
      ↓
getEmbedding(tensor) via ONNX
  → XNNPACK inference                                  ← BOTTLENECK #2 (on slow CPU)
      ↓
cosineSimilarity + multi-angle comparison
```

> [!IMPORTANT]
> **The core problem**: ImageManipulator crops and resizes natively (fast!), then **encodes the result as JPEG base64**. Then `jpeg-js` **decodes that JPEG again in pure JavaScript** just to get pixel data for the tensor. This JPEG encode → JS decode round-trip is the biggest bottleneck.

---

## Estimated Time on A7 Tab Lite (BEFORE Optimization)

| Step | S10+ Time | A7 Lite (~3.5× slower) |
|------|-----------|----------------------|
| Camera capture (`takePhoto`) | ~200ms | ~300ms |
| `RNImage.getSize()` | ~20ms | ~30ms |
| ImageManipulator crop+resize | ~300ms | ~900ms |
| `jpeg-js` decode (pure JS) | ~400ms | ~1400ms |
| CHW tensor construction | ~30ms | ~100ms |
| ONNX inference (XNNPACK) | ~800ms | ~2800ms |
| Cosine similarity + comparison | <5ms | <10ms |
| **Single shot total** | **~1750ms** | **~5540ms** |
| **With 2nd attempt + 200ms delay** | **~3700ms** | **~11280ms** |

---

## Phase 1: Quick Wins (Code Changes Only)

**Effort:** 2–3 hours | **Risk:** Low | **Expected savings: ~2000–3000ms on A7 Lite**

### 1A. Lower camera capture resolution from 1920×1080 → 640×480

You capture at 1920×1080 but only need 112×112. A 640×480 capture is still 25× more pixels than needed — plenty of resolution for face crops — but **jpeg-js has to decode 6.7× fewer pixels**.

**Change in** [useAttendance.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/screens/attendance/useAttendance.ts) (camera format config ~L278-281):
```typescript
// BEFORE:
const cameraFormat = useCameraFormat(device, [
  { photoResolution: { width: 1920, height: 1080 } },
  { videoResolution: { width: 1920, height: 1080 } }
]);

// AFTER:
const cameraFormat = useCameraFormat(device, [
  { photoResolution: { width: 640, height: 480 } },
  { videoResolution: { width: 640, height: 480 } }
]);
```

> [!NOTE]
> The face detector (`react-native-vision-camera-face-detector`) works on the camera preview stream, not the photo capture. So lowering photo resolution won't affect face detection quality. The face box coordinates are already mapped from detector space → photo space in your code.

**Estimated savings on A7 Lite:**
- ImageManipulator: ~300ms faster (smaller source image)
- jpeg-js: ~800–1000ms faster (6.7× fewer pixels to decode)
- **Total: ~1100–1300ms saved**

### 1B. Skip jpeg-js by using ImageManipulator's base64 output as PNG (raw pixels)

The core problem is: ImageManipulator produces a 112×112 JPEG base64 → then jpeg-js re-decodes it in pure JS. What if we skip JPEG and get raw pixel data?

**Option A — Use PNG format (lossless, simpler decode):**
```typescript
// In captureEmbeddingFromPhoto, change ImageManipulator call:
const manipResult = await ImageManipulator.manipulateAsync(
  imageToProcess,
  [{ crop: cropAction }, { resize: { width: 112, height: 112 } }],
  { format: ImageManipulator.SaveFormat.PNG, base64: true }  // PNG instead of JPEG
);
```
Then replace `base64ToPixels` with a PNG decoder or use `react-native-image-colors` for raw pixel access.

**Option B — Use the Tier 3 path directly with lower-res capture:**

Since you're already capturing at lower resolution (after 1A), the Tier 3 path becomes much faster:
```typescript
// Instead of ImageManipulator → jpeg-js, do:
// 1. Read the full (now 640×480) photo as base64
const photoBase64 = await RNFS.readFile(photo.path, 'base64');
// 2. Decode with jpeg-js (now only 640×480 instead of 1920×1080)
const binary = Uint8Array.from(atob(photoBase64), c => c.charCodeAt(0));
const decoded = jpeg.decode(binary, { useTArray: true });
// 3. Use rgbaBufferToCHWTensor with the ACTUAL face box (skip ImageManipulator entirely)
const tensor = rgbaBufferToCHWTensor(
  decoded.data, decoded.width, decoded.height,
  { x: faceBox.x, y: faceBox.y, width: faceBox.w, height: faceBox.h }
);
```

This eliminates ImageManipulator entirely and jpeg-js only decodes 640×480 (not 1920×1080 or a redundant 112×112).

**Estimated savings on A7 Lite: ~900ms** (no ImageManipulator + smaller jpeg-js decode)

### 1C. Pre-parse stored embeddings at cache time

Currently `JSON.parse(face_embedding)` runs during verification (L1230-1234). Parse once when caching:

```typescript
// When storing user data in MMKV, pre-parse the embedding:
const userData = { ...user, parsedEmbedding: new Float32Array(JSON.parse(user.face_embedding)) };
```

**Estimated savings: ~50–100ms** per verification

### 1D. Reduce inter-attempt delay

```typescript
// BEFORE (L1262):
if (attempt < 2) await new Promise(r => setTimeout(r, 200));

// AFTER:
if (attempt < 2) await new Promise(r => setTimeout(r, 50));
```

**Savings: 150ms** on failed first attempt

---

## Phase 2: Optimize ONNX Inference

**Effort:** 1–2 hours | **Risk:** Low-Medium | **Expected savings: ~500–1500ms on A7 Lite**

### 2A. Tune XNNPACK thread count

The Helio P22T has 4 performance cores (2.3 GHz) and 4 efficiency cores (1.8 GHz). Explicitly set threads:

**Change in** [model.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/faceEngine/model.ts):
```typescript
session = await InferenceSession.create(cleanPath, {
  executionProviders: Platform.OS === 'ios'
    ? ['coreml', 'xnnpack', 'cpu']
    : ['xnnpack', 'cpu'],
  graphOptimizationLevel: 'all',
  enableCpuMemArena: true,
  enableMemPattern: true,
  intraOpNumThreads: 4,  // ← ADD: use the 4 performance cores
});
```

**Estimated savings: ~300–800ms** on A7 Lite (XNNPACK can better parallelize with explicit thread count)

### 2B. Warm up model with a dummy inference at app startup

If you're not already doing this, run a single dummy inference during the splash screen to "warm up" XNNPACK:

```typescript
// After loadModel():
const warmupTensor = new Float32Array(3 * 112 * 112);
await getEmbedding(warmupTensor); // first inference is always slowest
```

**Estimated savings: ~200–500ms** on first scan

---

## Phase 3: Advanced (If Still Needed)

**Effort:** 1–3 days | **Risk:** Medium-High

### 3A. INT8 Model Quantization

Convert `w600k_mbf.onnx` to INT8 quantized version using ONNX Runtime's quantization tools:

```bash
python -m onnxruntime.quantization.quantize \
  --input w600k_mbf.onnx \
  --output w600k_mbf_int8.onnx \
  --per_channel
```

INT8 inference is typically **2–3× faster** with minimal accuracy loss for face recognition.

**Estimated savings: ~1000–1500ms** on A7 Lite

### 3B. Replace jpeg-js with native JPEG decode

Write a small TurboModule or use an existing native image decoder to skip the JS thread entirely:

```typescript
// Instead of jpeg-js (pure JS), use a native module:
import { decodeJpegNative } from './NativeJpegDecoder';
const rgba = await decodeJpegNative(photoPath); // returns ArrayBuffer directly
```

**Estimated savings: ~1200ms** on A7 Lite

### 3C. Vision Camera Frame Processor

Skip `takePhoto()` entirely — process live camera frames:

```typescript
const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  // Extract pixels directly from frame buffer
  // Run ONNX in native thread
  // Zero file I/O, zero JPEG encode/decode
}, []);
```

**Estimated savings: ~1500ms** (eliminates capture + file I/O + JPEG round-trip)

---

## Expected Results Summary

| Scenario | Single Shot | With 2nd Attempt |
|----------|-------------|-------------------|
| **Current (A7 Lite, no optimization)** | ~5.5s | ~11.3s |
| **After Phase 1** (lower res + skip redundancy) | ~3.0s | ~6.1s |
| **After Phase 2** (ONNX tuning) | ~2.3s | ~4.7s |
| **After Phase 3** (INT8 + native decode) | ~1.0s | ~2.1s |

> [!TIP]
> **Phases 1+2 should get you to ~2.5–3s per scan** on the A7 Tab Lite with only code changes and minor config tweaks. That's usable for attendance.

---

## Implementation Priority

| # | Change | File(s) | Effort | Savings (A7 Lite) |
|---|--------|---------|--------|-------------------|
| 🔴 1 | Lower camera to 640×480 | [useAttendance.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/screens/attendance/useAttendance.ts) | 5 min | ~1100–1300ms |
| 🔴 2 | Bypass ImageManipulator, use `rgbaBufferToCHWTensor` directly with face box on lower-res photo | [useAttendance.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/screens/attendance/useAttendance.ts) | 1–2 hrs | ~900ms |
| 🟡 3 | Add `intraOpNumThreads: 4` | [model.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/faceEngine/model.ts) | 5 min | ~300–800ms |
| 🟡 4 | Warm up model on app start | App init | 15 min | ~200–500ms |
| 🟢 5 | Reduce inter-attempt delay to 50ms | [useAttendance.ts](file:///C:/Users/Keith/HRIS/HRIS-KIOSK/src/screens/attendance/useAttendance.ts) | 2 min | ~150ms |
| 🟢 6 | Pre-parse embeddings at cache time | Cache logic | 30 min | ~50–100ms |
| 🔵 7 | INT8 model quantization | Build tooling | 1 day | ~1000–1500ms |
