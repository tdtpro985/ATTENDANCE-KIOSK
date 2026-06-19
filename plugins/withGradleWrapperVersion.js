const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withGradleWrapperVersion(config, { version = '8.13' } = {}) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const wrapperPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );
      let contents = fs.readFileSync(wrapperPath, 'utf8');
      contents = contents.replace(
        /distributionUrl=.*gradle-[\d.]+-(bin|all)\.zip/,
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${version}-bin.zip`
      );
      fs.writeFileSync(wrapperPath, contents);
      return config;
    },
  ]);
}

module.exports = withGradleWrapperVersion;
