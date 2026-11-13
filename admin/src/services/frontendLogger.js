import { getFirebaseClients } from '../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const MAX_BUFFER = 50;
let logBuffer = [];
let isFlushing = false;

// Keep original console references to prevent infinite recursion
const originalLog = typeof console !== 'undefined' ? console.log.bind(console) : () => {};
const originalWarn = typeof console !== 'undefined' ? console.warn.bind(console) : () => {};
const originalError = typeof console !== 'undefined' ? console.error.bind(console) : () => {};

async function flushLogs() {
  if (isFlushing || logBuffer.length === 0) return;
  isFlushing = true;

  try {
    const clients = await getFirebaseClients();
    if (!clients || !clients.db) {
      isFlushing = false;
      return;
    }

    const batchToFlush = logBuffer.splice(0, MAX_BUFFER);
    const logsCol = collection(clients.db, 'adminFrontendLogs');

    for (const item of batchToFlush) {
      try {
        await addDoc(logsCol, {
          ...item,
          timestamp: serverTimestamp(),
          clientTimestamp: new Date().toISOString(),
        });
      } catch (err) {
        // Silently catch write errors
      }
    }
  } catch (e) {
    // Ignore initialization errors
  } finally {
    isFlushing = false;
    if (logBuffer.length > 0) {
      setTimeout(flushLogs, 2000);
    }
  }
}

export function logFrontend(level, ...args) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  const entry = {
    level,
    message,
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };

  logBuffer.push(entry);
  if (logBuffer.length >= 10 || level === 'error') {
    flushLogs();
  }

  // Output using original console methods to prevent infinite loop
  if (level === 'error') {
    originalError(...args);
  } else if (level === 'warn') {
    originalWarn(...args);
  } else {
    originalLog(...args);
  }
}

export function initFrontendLogger() {
  if (typeof window === 'undefined') return;

  console.log = (...args) => {
    logFrontend('info', ...args);
  };
  console.warn = (...args) => {
    logFrontend('warn', ...args);
  };
  console.error = (...args) => {
    logFrontend('error', ...args);
  };

  // Periodic flush
  setInterval(flushLogs, 10000);
}
