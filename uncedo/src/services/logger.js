export function logInfo(scope, message, context = {}) {
  if (__DEV__) {
    console.log(`[${scope}] ${message}`, context);
  }
}

export function logError(scope, error, context = {}) {
  console.warn(`[${scope}]`, error, context);
}
