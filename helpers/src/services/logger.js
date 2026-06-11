export function logError(scope, error) {
  const prefix = scope ? `[helpers:${scope}]` : '[helpers]';
  console.error(prefix, error);
}
