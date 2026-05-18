# Face Recognition Model

This directory contains the MobileFaceNet TFLite model file used for on-device face embedding generation.

- **Filename:** `mobilefacenet.tflite`
- **Model:** MobileFaceNet (from [FaceRecognitionAuth](https://github.com/MCarlomagno/FaceRecognitionAuth))
- **Input:** 112×112×3 RGB image, normalized to [0, 1]
- **Output:** 192-dimensional embedding vector
- **Size:** ~5MB
- **Format:** TensorFlow Lite (.tflite)

## Runtime

| Platform | Runtime |
|----------|---------|
| HRIS App (React Native) | `react-native-fast-tflite` |
| Kiosk App (React Native) | `react-native-fast-tflite` |
| Web (Next.js) | `@tensorflow/tfjs` + `@tensorflow/tfjs-tflite` |

## If you need to re-download

```bash
curl -L -o assets/models/mobilefacenet.tflite https://github.com/MCarlomagno/FaceRecognitionAuth/raw/master/assets/mobilefacenet.tflite
```
