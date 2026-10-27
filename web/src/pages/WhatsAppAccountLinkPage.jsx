import { useEffect, useState } from 'react';
import MainLayout from '../layouts/MainLayout';
import { completeWhatsAppAccountLink } from '../services/authService';

export default function WhatsAppAccountLinkPage() {
  const [state, setState] = useState({ status: 'working', message: 'Verifying your one-time WhatsApp link…' });

  useEffect(() => {
    const params = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const token = String(params.get('wa_link_token') || '').trim();
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      setState({ status: 'error', message: 'This link is missing or invalid. Return to your Uncedo WhatsApp chat and request a fresh link.' });
      return undefined;
    }
    let active = true;
    completeWhatsAppAccountLink({ token }).then((result) => {
      if (!active) return;
      setState({ status: 'success', message: 'Your Uncedo account is now linked to this WhatsApp chat. Returning you to Uncedo WhatsApp…' });
      const returnUrl = String(result?.returnUrl || '');
      if (/^https:\/\/wa\.me\/\d{8,15}$/.test(returnUrl)) {
        window.setTimeout(() => window.location.assign(returnUrl), 1400);
      }
    }).catch((error) => {
      if (!active) return;
      setState({ status: 'error', message: error?.message || 'We could not verify this link. Return to your Uncedo WhatsApp chat and request a fresh one.' });
    });
    return () => { active = false; };
  }, []);

  return (
    <MainLayout>
      <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12">
        <section className="app-surface w-full p-7 sm:p-9" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">WhatsApp account linking</p>
          <h1 className="mt-3 text-3xl font-black text-zinc-900">
            {state.status === 'success' ? 'Account connected' : state.status === 'error' ? 'Link not completed' : 'Verifying your link'}
          </h1>
          <p className="mt-4 leading-7 text-zinc-600">{state.message}</p>
          {state.status === 'error' ? <a className="mt-6 inline-flex font-bold text-brand underline" href="https://wa.me/27605239926">Return to Uncedo on WhatsApp</a> : null}
        </section>
      </main>
    </MainLayout>
  );
}
