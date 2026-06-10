import { verifyPaystackReference } from './paymentMethodService';

export function getPaystackPublicKey() {
  return process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY;
}

export function buildPaystackAuthorizationHtml({ email, publicKey }) {
  const payload = JSON.stringify({
    key: publicKey,
    email,
    amount: 100,
    currency: 'ZAR',
  });

  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://js.paystack.co/v1/inline.js"></script>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #f8fafc;
        color: #18181b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .wrap {
        align-items: center;
        display: flex;
        min-height: 100vh;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }
      .panel {
        background: #fff;
        border: 1px solid #e4e4e7;
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
        max-width: 420px;
        padding: 24px;
      }
      .title {
        font-size: 18px;
        font-weight: 800;
        margin: 0 0 8px;
      }
      .copy {
        color: #71717a;
        font-size: 14px;
        line-height: 1.5;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="panel">
        <p class="title">Opening Paystack</p>
        <p class="copy">We charge R1 to securely authorize your card, then refund it after verification.</p>
      </div>
    </div>
    <script>
      function send(type, payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} }));
      }

      function openPaystack() {
        if (!window.PaystackPop) {
          send('error', { message: 'Failed to load Paystack script' });
          return;
        }

        var config = ${payload};
        var handler = window.PaystackPop.setup({
          key: config.key,
          email: config.email,
          amount: config.amount,
          currency: config.currency,
          callback: function(response) {
            send('success', response);
          },
          onClose: function() {
            send('close');
          }
        });

        handler.openIframe();
      }

      if (document.readyState === 'complete') {
        openPaystack();
      } else {
        window.addEventListener('load', openPaystack);
      }
    </script>
  </body>
</html>`;
}

export async function verifyCardAuthorization(reference, options = {}) {
  return verifyPaystackReference(reference, options);
}
