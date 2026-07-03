const ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEBUG_LOGS === 'true';

function format(scope) {
  return `[parakleo:${scope}]`;
}

export function debugLog(scope, message, payload) {
  if (!ENABLED) return;
  if (payload === undefined) {
    console.log(format(scope), message);
    return;
  }
  console.log(format(scope), message, payload);
}

export function debugWarn(scope, message, payload) {
  if (!ENABLED) return;
  if (payload === undefined) {
    console.warn(format(scope), message);
    return;
  }
  console.warn(format(scope), message, payload);
}

export function debugError(scope, message, payload) {
  if (!ENABLED) return;
  if (payload === undefined) {
    console.error(format(scope), message);
    return;
  }
  console.error(format(scope), message, payload);
}
