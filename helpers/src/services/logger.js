export function logInfo(scope, message, context = {}) {
  if (__DEV__) {
    const prefix = scope ? `[helpers:${scope}]` : '[helpers]';
    console.log(prefix, message, context);
  }
}

export function logError(scope, error) {
  const prefix = scope ? `[helpers:${scope}]` : '[helpers]';
  console.error(prefix, error);
}
