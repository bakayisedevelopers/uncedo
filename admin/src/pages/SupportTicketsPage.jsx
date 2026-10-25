import { useEffect, useMemo, useState } from 'react';
import { Headphones, Send, ShieldAlert } from 'lucide-react';
import { getFirebaseClients } from '../firebase/config';

const TICKET_STATES = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [mediaLinks, setMediaLinks] = useState({});
  const selected = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) || null, [tickets, selectedId]);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    getFirebaseClients().then((clients) => {
      if (!active || !clients) return;
      const { db, firestoreModule } = clients;
      unsubscribe = firestoreModule.onSnapshot(
        firestoreModule.query(firestoreModule.collection(db, 'supportTickets'), firestoreModule.orderBy('updatedAt', 'desc'), firestoreModule.limit(100)),
        (snapshot) => {
          const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setTickets(rows);
          setSelectedId((current) => current || rows[0]?.id || '');
        },
      );
    }).catch(() => setNotice('Unable to load support tickets.'));
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return undefined; }
    let unsubscribe = () => {};
    let active = true;
    getFirebaseClients().then((clients) => {
      if (!active || !clients) return;
      const { db, firestoreModule } = clients;
      const messagesRef = firestoreModule.collection(db, 'supportTickets', selectedId, 'messages');
      unsubscribe = firestoreModule.onSnapshot(
        firestoreModule.query(messagesRef, firestoreModule.orderBy('createdAtMs', 'asc'), firestoreModule.limit(200)),
        (snapshot) => setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
      );
    }).catch(() => setNotice('Unable to load this ticket conversation.'));
    return () => { active = false; unsubscribe(); };
  }, [selectedId]);

  async function changeStatus(status) {
    if (!selected || !TICKET_STATES.includes(status)) return;
    setBusy(true); setNotice('');
    try {
      const clients = await getFirebaseClients();
      await clients.httpsCallable(clients.functions, 'setWhatsAppSupportTicketState')({ ticketId: selected.id, status });
      setNotice(`Ticket marked ${status.replaceAll('_', ' ')}.`);
    } catch (error) { setNotice(error?.message || 'Unable to update this ticket.'); }
    finally { setBusy(false); }
  }

  async function sendReply(event) {
    event.preventDefault();
    const text = reply.trim();
    if (!selected || !text) return;
    setBusy(true); setNotice('');
    const replyId = globalThis.crypto?.randomUUID?.() || `reply_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      const clients = await getFirebaseClients();
      const result = await clients.httpsCallable(clients.functions, 'replyToWhatsAppSupportTicket')({ ticketId: selected.id, replyId, text });
      setReply('');
      setNotice(result.data?.sent ? 'WhatsApp reply sent.' : 'Reply request already processed.');
    } catch (error) { setNotice(error?.message || 'Unable to send this reply.'); }
    finally { setBusy(false); }
  }

  async function loadAttachment(message) {
    if (!selected || !message?.media?.assetId) return;
    setNotice('');
    try {
      const clients = await getFirebaseClients();
      const result = await clients.httpsCallable(clients.functions, 'getWhatsAppSupportMediaUrl')({
        ticketId: selected.id,
        messageId: message.id,
      });
      setMediaLinks((current) => ({ ...current, [message.id]: result.data }));
    } catch (error) {
      setNotice(error?.message || 'Unable to open this support attachment.');
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-2xl bg-brand/20 p-3 text-brand-soft"><Headphones className="h-5 w-5" /></span>
          <div><h1 className="text-lg font-bold">Support inbox</h1><p className="text-xs text-ink-300">WhatsApp conversations needing people</p></div>
        </div>
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <button key={ticket.id} type="button" onClick={() => setSelectedId(ticket.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === ticket.id ? 'border-brand/60 bg-brand/10' : 'border-white/10 bg-black/10 hover:bg-white/5'}`}>
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{ticket.subject || 'Support request'}</span><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-ink-200">{String(ticket.status || 'open').replaceAll('_', ' ')}</span></div>
              <p className="mt-2 truncate text-xs text-ink-300">{ticket.role || 'customer'}{ticket.requestId ? ` · Request ${ticket.requestId}` : ''}</p>
            </button>
          ))}
          {!tickets.length ? <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-ink-300">No support tickets yet.</p> : null}
        </div>
      </div>

      <div className="flex min-h-[70vh] flex-col rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow">
        {selected ? <>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-soft">Ticket {selected.id}</p><h2 className="mt-1 text-xl font-bold">{selected.subject || 'Support request'}</h2><p className="mt-1 text-xs text-ink-300">{selected.requestId ? `Request ${selected.requestId}` : 'General support'} · {selected.role || 'customer'}</p></div>
            <select aria-label="Ticket status" disabled={busy} value={selected.status || 'open'} onChange={(event) => changeStatus(event.target.value)} className="rounded-xl border border-white/15 bg-ink-900 px-3 py-2 text-sm text-white">
              {TICKET_STATES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </select>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto py-5">
            {messages.map((message) => {
              const mediaLink = mediaLinks[message.id];
              const mediaLinkExpired = Number(mediaLink?.expiresAtMs || 0) <= Date.now();
              return <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.senderType === 'admin' ? 'ml-auto bg-brand/20 text-white' : 'bg-black/20 text-ink-100'}`}><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-300">{message.senderType === 'admin' ? 'Support team' : 'Customer / helper'}</p><p className="whitespace-pre-wrap">{message.text || `[${message.type || 'attachment'}]`}</p>{message.media?.assetId ? mediaLink && !mediaLinkExpired ? <a className="mt-2 inline-block text-xs font-bold text-brand-soft underline" href={mediaLink.url} target="_blank" rel="noreferrer">Open attachment (temporary link)</a> : <button className="mt-2 block text-xs font-bold text-brand-soft underline" type="button" onClick={() => loadAttachment(message)}>Load secure attachment</button> : null}{message.deliveryStatus === 'outcome_unknown' ? <p className="mt-2 text-xs text-amber-300">Delivery outcome unknown; do not resend without checking.</p> : null}</div>;
            })}
            {!messages.length ? <p className="text-sm text-ink-300">No messages are attached yet.</p> : null}
          </div>
          <form onSubmit={sendReply} className="flex gap-2 border-t border-white/10 pt-4">
            <textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={3500} rows={2} placeholder="Reply to the customer or helper…" className="min-w-0 flex-1 resize-y rounded-2xl border border-white/15 bg-ink-900 px-4 py-3 text-sm text-white outline-none focus:border-brand" />
            <button disabled={busy || !reply.trim()} className="self-end rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Send className="mr-2 inline h-4 w-4" />Send</button>
          </form>
        </> : <div className="m-auto max-w-sm text-center text-ink-300"><ShieldAlert className="mx-auto mb-3 h-8 w-8" /><p>Select a support ticket to review.</p></div>}
        {notice ? <p role="status" className="mt-3 text-sm text-brand-soft">{notice}</p> : null}
      </div>
    </section>
  );
}
