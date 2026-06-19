const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(__dirname, '..', 'node_modules', 'onnxruntime-react-native', 'android', 'build.gradle');

if (!fs.existsSync(buildGradlePath)) {
  console.warn('[patch-onnx] build.gradle not found, skipping.');
  process.exit(0);
}

let content = fs.readFileSync(buildGradlePath, 'utf8');

// Check if already cleanly patched
if (!content.includes('VersionNumber') && !content.includes('if (true // patched')) {
  console.log('[patch-onnx] Already clean, skipping.');
  process.exit(0);
}

// Fix broken patch from before
content = content.replace(
  /  if \(true \/\/ patched for Gradle 9\n    extractLibs "com\.facebook\.fbjni:fbjni:\+:headers"\n    extractLibs "com\.facebook\.fbjni:fbjni:\+"\n  \}/,
  '  extractLibs "com.facebook.fbjni:fbjni:+:headers"\n  extractLibs "com.facebook.fbjni:fbjni:+"'
);

// Remove VersionNumber import
content = content.replace(/^import org\.gradle\.util\.VersionNumber\r?\n/m, '');

// Replace VersionNumber if-block with unconditional lines
content = content.replace(
  /if\s*\(\s*VersionNumber\.parse[\s\S]*?\)\s*\{([\s\S]*?)\n\s*\}/m,
  (match, inner) => inner.trim()
);

fs.writeFileSync(buildGradlePath, content, 'utf8');
console.log('[patch-onnx] Successfully patched onnxruntime build.gradle.');
