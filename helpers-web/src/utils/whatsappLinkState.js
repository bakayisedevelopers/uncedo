const SIGNUP_STORAGE_KEY = 'uncedo_pending_wa_signup_v1';
const ACCOUNT_LINK_STORAGE_KEY = 'uncedo_pending_wa_link_v1';
const PENDING_TTL_MS = 60 * 60 * 1000;

function readStorage(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - Number(parsed.capturedAtMs || 0) > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ ...value, capturedAtMs: Date.now() }));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function removeStorage(key) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

export function capturePendingWhatsAppSignup() {
  if (typeof window === 'undefined') return { token: '', phone: '', mode: '' };
  const rawHash = window.location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(rawHash);
  const searchParams = new URLSearchParams(window.location.search);

  const hashToken = String(hashParams.get('wa_signup_token') || searchParams.get('wa_signup_token') || '').trim();
  const hashPhone = String(hashParams.get('wa_phone') || searchParams.get('wa_phone') || '').trim();
  const hashMode = String(hashParams.get('wa_mode') || searchParams.get('wa_mode') || '').trim().toLowerCase();

  if (hashToken) {
    const next = { token: hashToken, phone: hashPhone, mode: hashMode };
    writeStorage(SIGNUP_STORAGE_KEY, next);
    return next;
  }

  const stored = readStorage(SIGNUP_STORAGE_KEY);
  if (stored?.token) {
    return {
      token: String(stored.token || '').trim(),
      phone: String(stored.phone || '').trim(),
      mode: String(stored.mode || '').trim().toLowerCase(),
    };
  }

  return { token: '', phone: '', mode: '' };
}

export function clearPendingWhatsAppSignup() {
  removeStorage(SIGNUP_STORAGE_KEY);
  if (typeof window !== 'undefined' && window.location.hash.includes('wa_signup_token')) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

export function capturePendingWhatsAppAccountLink() {
  if (typeof window === 'undefined') return '';
  const rawHash = window.location.hash.replace(/^#/, '');
  const hashToken = new URLSearchParams(rawHash).get('wa_link_token') || '';
  const queryToken = new URLSearchParams(window.location.search).get('token') || '';
  const direct = String(hashToken || queryToken || '').trim();
  if (direct) {
    writeStorage(ACCOUNT_LINK_STORAGE_KEY, { token: direct });
    return direct;
  }
  const stored = readStorage(ACCOUNT_LINK_STORAGE_KEY);
  return String(stored?.token || '').trim();
}

export function clearPendingWhatsAppAccountLink() {
  removeStorage(ACCOUNT_LINK_STORAGE_KEY);
  if (typeof window !== 'undefined' && (window.location.hash.includes('wa_link_token') || window.location.search.includes('token='))) {
    window.history.replaceState(null, '', window.location.pathname);
  }
}
