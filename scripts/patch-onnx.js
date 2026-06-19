const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(__dirname, '..', 'node_modules', 'onnxruntime-react-native', 'android', 'build.gradle');

if (!fs.existsSync(buildGradlePath)) {
  console.warn('[patch-onnx] build.gradle not found, skipping.');
  process.exit(0);
}

let content = fs.readFileSync(buildGradlePath, 'utf8');

if (!content.includes('VersionNumber')) {
  console.log('[patch-onnx] Already patched or no VersionNumber found, skipping.');
  process.exit(0);
}

// Remove import line
content = content.replace(/\s*import org\.gradle\.util\.VersionNumber\n/, '\n');

// Replace the VersionNumber if-block with unconditional extractLibs calls
content = content.replace(
  /if\s*\(VersionNumber\.parse\(([^)]+)\)[^)]*\)\s*>=\s*VersionNumber\.parse\([^)]+\)\s*\)\s*\{([\s\S]*?)\}/,
  (match, p1, inner) => {
    return inner.trim();
  }
);

fs.writeFileSync(buildGradlePath, content, 'utf8');
console.log('[patch-onnx] Successfully patched onnxruntime build.gradle for Gradle 9.');
