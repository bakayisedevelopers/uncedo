import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Headphones, RotateCw, Send, ShieldAlert } from 'lucide-react';
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
  const [historyMessages, setHistoryMessages] = useState([]);
  const [historyCursor, setHistoryCursor] = useState('');
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [ticketDetails, setTicketDetails] = useState(null);
  const [assistantFailures, setAssistantFailures] = useState([]);
  const [assistantFailuresBusy, setAssistantFailuresBusy] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState('');
  const selected = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) || null, [tickets, selectedId]);
  const displayedMessages = useMemo(() => {
    const byId = new Map();
    for (const message of [...historyMessages, ...messages]) byId.set(message.id, message);
    return [...byId.values()].sort((left, right) => Number(left.createdAtMs || 0) - Number(right.createdAtMs || 0));
  }, [historyMessages, messages]);

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
    setHistoryMessages([]); setHistoryCursor(''); setHistoryHasMore(false); setTicketDetails(null);
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
      clients.httpsCallable(clients.functions, 'markWhatsAppSupportTicketRead')({ ticketId: selectedId }).catch(() => {});
      clients.httpsCallable(clients.functions, 'getWhatsAppSupportTicketDetails')({ ticketId: selectedId })
        .then((result) => { if (active) setTicketDetails(result.data || null); })
        .catch(() => {});
    }).catch(() => setNotice('Unable to load this ticket conversation.'));
    return () => { active = false; unsubscribe(); };
  }, [selectedId]);

  async function assignToMe() {
    if (!selected) return;
    setBusy(true); setNotice('');
    try {
      const clients = await getFirebaseClients();
      await clients.httpsCallable(clients.functions, 'assignWhatsAppSupportTicket')({ ticketId: selected.id });
      setNotice('Ticket assigned to you.');
    } catch (error) { setNotice(error?.message || 'Unable to assign this ticket.'); }
    finally { setBusy(false); }
  }

  async function loadConversationHistory() {
    if (!selected?.identityId || historyBusy) return;
    setHistoryBusy(true); setNotice('');
    try {
      const clients = await getFirebaseClients();
      const result = await clients.httpsCallable(clients.functions, 'getWhatsAppConversationHistory')({
        identityId: selected.identityId,
        pageSize: 50,
        cursor: historyCursor,
      });
      const payload = result.data || {};
      setHistoryMessages((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of payload.messages || []) byId.set(item.id, { ...item, fromHistory: true });
        return [...byId.values()].sort((left, right) => Number(left.createdAtMs || 0) - Number(right.createdAtMs || 0));
      });
      setHistoryCursor(String(payload.nextCursor || ''));
      setHistoryHasMore(payload.hasMore === true);
    } catch (error) { setNotice(error?.message || 'Unable to load conversation history.'); }
    finally { setHistoryBusy(false); }
  }

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

  async function loadAssistantFailures() {
    if (assistantFailuresBusy) return;
    setAssistantFailuresBusy(true);
    setNotice('');
    try {
      const clients = await getFirebaseClients();
      const result = await clients.httpsCallable(clients.functions, 'listWhatsAppAssistantFailures')({});
      setAssistantFailures(Array.isArray(result.data?.jobs) ? result.data.jobs : []);
    } catch (error) {
      setNotice(error?.message || 'Unable to load assistant diagnostics.');
    } finally {
      setAssistantFailuresBusy(false);
    }
  }

  async function retryAssistantJob(job) {
    if (!job?.jobId || job.manualRecoveryAvailable !== true || retryingJobId) return;
    setRetryingJobId(job.jobId);
    setNotice('');
    try {
      const clients = await getFirebaseClients();
      const result = await clients.httpsCallable(clients.functions, 'retryWhatsAppAssistantJob')({ jobId: job.jobId });
      setNotice(result.data?.queued ? 'Safe classifier retry queued.' : result.data?.duplicate ? 'A safe retry was already queued.' : 'The assistant job was not queued.');
      await loadAssistantFailures();
    } catch (error) {
      setNotice(error?.message || 'Unable to queue a safe assistant retry.');
    } finally {
      setRetryingJobId('');
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
              <p className="mt-2 flex items-center gap-2 truncate text-xs text-ink-300"><span>{ticket.role || 'customer'}{ticket.requestId ? ` · Request ${ticket.requestId}` : ''}</span>{Number(ticket.unreadCount || 0) > 0 ? <span className="rounded-full bg-rose-500/20 px-2 py-0.5 font-bold text-rose-200">{Math.min(99, Number(ticket.unreadCount))} unread</span> : null}</p>
            </button>
          ))}
          {!tickets.length ? <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-ink-300">No support tickets yet.</p> : null}
        </div>
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-amber-300" />Assistant failures</div>
            <button type="button" onClick={loadAssistantFailures} disabled={assistantFailuresBusy} className="rounded-lg border border-white/15 p-2 text-ink-200 disabled:opacity-50" aria-label="Refresh assistant failures"><RotateCw className={`h-4 w-4 ${assistantFailuresBusy ? 'animate-spin' : ''}`} /></button>
          </div>
          <p className="mt-2 text-xs text-ink-400">Only safe failures before tool execution or message sending can be retried here.</p>
          <div className="mt-3 space-y-2">
            {assistantFailures.map((job) => (
              <div key={job.jobId} className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="truncate text-xs font-bold">{job.errorCode || 'Assistant failure'} · {job.phase || 'unknown phase'}</p>
                <p className="mt-1 text-[11px] text-ink-400">Attempt {job.attemptCount || 0}{job.updatedAtMs ? ` · ${new Date(job.updatedAtMs).toLocaleString()}` : ''}</p>
                {job.manualRecoveryAvailable ? <button type="button" onClick={() => retryAssistantJob(job)} disabled={Boolean(retryingJobId)} className="mt-2 rounded-lg border border-amber-300/20 px-2 py-1 text-xs font-bold text-amber-200 disabled:opacity-50">{retryingJobId === job.jobId ? 'Queueing…' : 'Retry safe classifier step'}</button> : <p className="mt-2 text-[11px] text-ink-400">Manual retry unavailable; inspect before taking action.</p>}
              </div>
            ))}
            {!assistantFailures.length && !assistantFailuresBusy ? <p className="text-xs text-ink-400">Load the latest failed jobs when an investigation is needed.</p> : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-[70vh] flex-col rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow">
        {selected ? <>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-soft">Ticket {selected.id}</p><h2 className="mt-1 text-xl font-bold">{selected.subject || 'Support request'}</h2><p className="mt-1 text-xs text-ink-300">{selected.requestId ? `Request ${selected.requestId}` : 'General support'} · {selected.role || 'customer'}{selected.assignedAdminUid ? ` · Assigned to ${selected.assignedAdminUid}` : ''}</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={assignToMe} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-50">Assign to me</button><button type="button" disabled={busy || ['resolved', 'closed'].includes(selected.status)} onClick={() => changeStatus('resolved')} className="rounded-xl border border-emerald-300/20 px-3 py-2 text-sm font-bold text-emerald-200 disabled:opacity-50">Return to AI</button><select aria-label="Ticket status" disabled={busy} value={selected.status || 'open'} onChange={(event) => changeStatus(event.target.value)} className="rounded-xl border border-white/15 bg-ink-900 px-3 py-2 text-sm text-white">
              {TICKET_STATES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </select></div>
          </div>
          <div className="grid gap-2 border-b border-white/10 py-3 text-xs text-ink-300 sm:grid-cols-2"><p>Participant: <span className="font-bold text-white">{ticketDetails?.participant?.name || selected.linkedUid || selected.principalId || 'Guest WhatsApp user'}</span> · {ticketDetails?.participant?.role || selected.role || 'unknown'}{ticketDetails?.participant?.whatsappMasked ? ` · WhatsApp ${ticketDetails.participant.whatsappMasked}` : ''}</p><p>Linked account: <span className="font-bold text-white">{ticketDetails?.participant?.linked ? ticketDetails.participant.uid : 'not linked'}</span></p>{ticketDetails?.aiSummary ? <p className="sm:col-span-2">AI escalation summary: <span className="text-white">{ticketDetails.aiSummary}</span></p> : null}</div>
          <div className="flex justify-end border-b border-white/10 py-2">
            <button type="button" onClick={loadConversationHistory} disabled={historyBusy || !selected.identityId || (historyMessages.length > 0 && !historyHasMore)} className="text-xs font-bold text-brand-soft underline disabled:opacity-50">{historyBusy ? 'Loading history…' : historyMessages.length ? 'Load more conversation history' : 'Load conversation history'}</button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto py-5">
            {displayedMessages.map((message) => {
              const mediaLink = mediaLinks[message.id];
              const mediaLinkExpired = Number(mediaLink?.expiresAtMs || 0) <= Date.now();
              return <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.senderType === 'admin' ? 'ml-auto bg-brand/20 text-white' : 'bg-black/20 text-ink-100'}`}><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-300">{message.senderType === 'admin' ? 'Support team' : 'Customer / helper'}</p><p className="whitespace-pre-wrap">{message.text || `[${message.type || 'attachment'}]`}</p>{message.media?.assetId ? mediaLink && !mediaLinkExpired ? <a className="mt-2 inline-block text-xs font-bold text-brand-soft underline" href={mediaLink.url} target="_blank" rel="noreferrer">Open attachment (temporary link)</a> : <button className="mt-2 block text-xs font-bold text-brand-soft underline" type="button" onClick={() => loadAttachment(message)}>Load secure attachment</button> : null}{message.deliveryStatus === 'outcome_unknown' ? <p className="mt-2 text-xs text-amber-300">Delivery outcome unknown; do not resend without checking.</p> : null}</div>;
            })}
            {!displayedMessages.length ? <p className="text-sm text-ink-300">No messages are attached yet.</p> : null}
            {historyMessages.length && !historyHasMore ? <p className="text-center text-[11px] text-ink-400">All available conversation history is loaded.</p> : null}
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
