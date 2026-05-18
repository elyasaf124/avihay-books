const { withMainApplication } = require('@expo/config-plugins');

module.exports = function withForceRTL(config) {
  return withMainApplication(config, async (config) => {
    let mainApplication = config.modResults.contents;

    // We want to add the import for I18nUtil
    if (!mainApplication.includes('import com.facebook.react.modules.i18nmanager.I18nUtil')) {
      mainApplication = mainApplication.replace(
        'import com.facebook.react.ReactApplication',
        'import com.facebook.react.ReactApplication\nimport com.facebook.react.modules.i18nmanager.I18nUtil'
      );
    }

    // We want to inject the forceRTL calls into onCreate()
    const onCreateSignature = 'super.onCreate()';
    const forceRTLCode = `
    // ── Force RTL at native level BEFORE React Native loads ──
    val sharedI18n = I18nUtil.getInstance()
    sharedI18n.allowRTL(this, true)
    sharedI18n.forceRTL(this, true)
`;

    if (!mainApplication.includes('sharedI18n.forceRTL(this, true)')) {
      mainApplication = mainApplication.replace(
        onCreateSignature,
        `${onCreateSignature}\n${forceRTLCode}`
      );
    }

    config.modResults.contents = mainApplication;
    return config;
  });
};
