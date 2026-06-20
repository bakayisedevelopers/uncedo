import { getFirebaseClients } from '../firebase/config';

const PAYSTACK_SCRIPT_URL = 'https://js.paystack.co/v1/inline.js';
const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
const VERIFY_PAYSTACK_ENDPOINT = import.meta.env.VITE_VERIFY_PAYSTACK_ENDPOINT || '/verify-paystack';

let paystackLoaded = false;
let paystackPromise = null;

function loadPaystackScript() {
  if (paystackLoaded) {
    return Promise.resolve();
  }

  if (paystackPromise) {
    return paystackPromise;
  }

  paystackPromise = new Promise((resolve, reject) => {
    if (window.PaystackPop) {
      paystackLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = PAYSTACK_SCRIPT_URL;
    script.onload = () => {
      paystackLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Paystack script'));
    };
    document.head.appendChild(script);
  });

  return paystackPromise;
}

export async function initializeCardAuthorization({ email, onSuccess, onClose }) {
  if (!PAYSTACK_PUBLIC_KEY) {
    throw new Error('Paystack public key not configured');
  }

  await loadPaystackScript();

  const handler = window.PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email,
    amount: 100,
    currency: 'ZAR',
    callback: (response) => {
      onSuccess?.(response);
    },
    onClose: () => {
      onClose?.();
    },
  });

  handler.openIframe();
}

export async function verifyCardAuthorization(reference, options = {}) {
  const clients = await getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();

  if (!idToken) {
    throw new Error('You must be signed in before adding a card.');
  }

  const payloadBody = {
    reference,
    ...(options.nickname ? { nickname: options.nickname } : {}),
    ...(options.userId ? { userId: options.userId } : {}),
  };

  const response = await fetch(VERIFY_PAYSTACK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payloadBody),
  });

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Unable to verify your card authorization right now.');
  }

  return payload;
}
