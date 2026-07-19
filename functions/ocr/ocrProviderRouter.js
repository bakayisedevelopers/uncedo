function getProviderMode() {
  return 'legacy_vision';
}

async function runOcrProviderRouter({ legacyVisionRunner = null } = {}) {
  if (typeof legacyVisionRunner !== 'function') {
    return {
      result: {
        success: false,
        extractedText: '',
        text: '',
        textLength: 0,
        extractionMethod: 'ocr',
        provider: 'google-vision',
        extractionQuality: 'failed',
      },
      route: 'legacy_vision',
      reason: 'no_legacy_runner',
    };
  }

  const legacy = await legacyVisionRunner();
  return {
    result: {
      ...legacy,
      provider: legacy?.provider || 'google-vision',
    },
    route: 'legacy_vision',
    reason: 'academic_brain_backend_vision',
  };
}

module.exports = {
  runOcrProviderRouter,
  getProviderMode,
};
