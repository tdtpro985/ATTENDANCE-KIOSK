const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'react-native-vision-camera', 'android', 'src', 'main', 'java', 'com', 'mrousavy', 'camera', 'react');

// Fix 1: CameraViewManager.kt - Return type mismatch
const viewManagerPath = path.join(root, 'CameraViewManager.kt');
if (fs.existsSync(viewManagerPath)) {
  let content = fs.readFileSync(viewManagerPath, 'utf8');
  const oldStr = 'override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? =\n    MapBuilder.builder<String, Any>()';
  const newStr = 'override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {\n    return MapBuilder.builder<String, Any>()';
  if (content.includes('MapBuilder.builder<String, Any>()')) {
    // Find the chain end and wrap in block
    content = content.replace(
      /override fun getExportedCustomDirectEventTypeConstants\(\): MutableMap<String, Any>\? =\s*\n(\s*MapBuilder\.builder<String, Any>\(\)[\s\S]*?\.build\(\))/,
      'override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {\n    @Suppress("UNCHECKED_CAST")\n    return $1\n  }'
    );
    fs.writeFileSync(viewManagerPath, content, 'utf8');
    console.log('[patch-vision-camera] Patched CameraViewManager.kt');
  } else {
    console.log('[patch-vision-camera] CameraViewManager.kt - no match, may already be patched');
  }
} else {
  console.warn('[patch-vision-camera] CameraViewManager.kt not found');
}

// Fix 2: CameraViewModule.kt - Unresolved reference 'currentActivity'
const viewModulePath = path.join(root, 'CameraViewModule.kt');
if (fs.existsSync(viewModulePath)) {
  let content = fs.readFileSync(viewModulePath, 'utf8');
  if (content.includes('val activity = currentActivity as?')) {
    content = content.replace(
      'val activity = currentActivity as?',
      'val activity = reactApplicationContext.currentActivity as?'
    );
    fs.writeFileSync(viewModulePath, content, 'utf8');
    console.log('[patch-vision-camera] Patched CameraViewModule.kt');
  } else {
    console.log('[patch-vision-camera] CameraViewModule.kt - no match, may already be patched');
  }
} else {
  console.warn('[patch-vision-camera] CameraViewModule.kt not found');
}

console.log('[patch-vision-camera] Done.');
