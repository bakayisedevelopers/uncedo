import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, MapPin, MessageSquare, Navigation, Phone, Send, Shield, Zap } from 'lucide-react';
import {
  sendHelperRequestMessage,
  subscribeToActiveServiceRequest,
  subscribeToRequestMessages,
  updateHelperServiceRequestApi,
} from '../services/helperDataService';

export function RequestDetailPage({ user, requestId, onNavigate }) {
  const [request, setRequest] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    if (!requestId) return;
    const unsubReq = subscribeToActiveServiceRequest(requestId, (req) => {
      setRequest(req);
      setLoading(false);
    });
    const unsubMsgs = subscribeToRequestMessages(requestId, setMessages);
    return () => {
      unsubReq?.();
      unsubMsgs?.();
    };
  }, [requestId]);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStatusTransition = async (nextStatus) => {
    setActionBusy(true);
    try {
      await updateHelperServiceRequestApi({
        requestId,
        action: 'transition',
        status: nextStatus,
      });
    } catch (err) {
      alert(err?.message || 'Unable to update job status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelRequest = async () => {
    const reason = prompt('Reason for canceling this request:');
    if (!reason) return;
    setActionBusy(true);
    try {
      await updateHelperServiceRequestApi({
        requestId,
        action: 'cancel',
        reason,
      });
      onNavigate('/workspace');
    } catch (err) {
      alert(err?.message || 'Unable to cancel job.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    try {
      await sendHelperRequestMessage({ requestId, text });
    } catch (err) {
      alert(err?.message || 'Unable to send message.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <p className="text-sm text-ink-500">Loading service request workspace…</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 space-y-4">
        <h2 className="text-lg font-bold">Request not found</h2>
        <button
          onClick={() => onNavigate('/workspace')}
          className="px-6 py-3 bg-tealbrand-700 text-white rounded-xl text-xs font-bold"
        >
          Return to Workspace
        </button>
      </div>
    );
  }

  const status = String(request.status || '').toLowerCase();
  const address = request.requestPayload?.address || 'Customer location specified';
  const lat = request.location?.latitude || request.requestPayload?.location?.latitude;
  const lon = request.location?.longitude || request.requestPayload?.location?.longitude;
  const mapsUrl = lat && lon ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 pb-20">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('/workspace')}
            className="p-2 rounded-xl bg-well text-ink-700 hover:bg-border transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold tracking-tight">{request.serviceSummary || request.subject || 'Service Job'}</h1>
            <p className="text-xs text-ink-500">Status: <span className="font-semibold uppercase text-tealbrand-700">{status}</span></p>
          </div>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-tealbrand-700 hover:bg-tealbrand-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Navigation className="w-4 h-4" />
          Open Navigation
        </a>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 grid lg:grid-cols-2 gap-8 items-start">
        {/* Left Column: Job Details & Trip Controls */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">Job Scope & Address</h2>
            <div>
              <h3 className="text-lg font-bold">{request.subject || request.serviceSummary || 'Service Session'}</h3>
              <p className="text-sm text-ink-600 mt-1">📍 {address}</p>
            </div>
            <div className="pt-4 border-t border-border flex items-center justify-between text-sm">
              <span className="text-ink-500">Total Payout</span>
              <span className="font-mono font-bold text-lg text-tealbrand-700">
                R{Number(request.pricingSnapshot?.total ?? request.pricingSnapshot?.finalAmount ?? 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Workflow Action Buttons */}
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">Trip Progression</h2>
            <div className="grid grid-cols-2 gap-3">
              {['accepted', 'en_route'].includes(status) && (
                <button
                  onClick={() => handleStatusTransition('driving')}
                  disabled={actionBusy}
                  className="py-3 px-4 bg-tealbrand-700 hover:bg-tealbrand-800 text-white font-bold rounded-xl text-xs shadow-sm transition-colors col-span-2"
                >
                  Start Driving (On the Way)
                </button>
              )}
              {['driving', 'en_route'].includes(status) && (
                <button
                  onClick={() => handleStatusTransition('arrived')}
                  disabled={actionBusy}
                  className="py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors col-span-2"
                >
                  Mark Arrived at Customer Location
                </button>
              )}
              {['arrived', 'driving'].includes(status) && (
                <button
                  onClick={() => handleStatusTransition('work_started')}
                  disabled={actionBusy}
                  className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors col-span-2"
                >
                  Start Work (Job in Progress)
                </button>
              )}
              {status === 'work_started' && (
                <button
                  onClick={() => handleStatusTransition('completed')}
                  disabled={actionBusy}
                  className="py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-sm transition-colors col-span-2"
                >
                  Complete Service Job
                </button>
              )}
            </div>
            {['accepted', 'driving', 'arrived'].includes(status) && (
              <button
                onClick={handleCancelRequest}
                disabled={actionBusy}
                className="w-full py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
              >
                Cancel Service Session
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Agent-Style Customer Chat */}
        <div className="bg-white rounded-2xl border border-border shadow-sm flex flex-col h-[600px]">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-tealbrand-700" />
              <h2 className="text-sm font-bold">Customer Chat (WhatsApp Bridge)</h2>
            </div>
            <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full">
              Live Connected
            </span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-well/40">
            {messages.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-xs text-ink-400">No messages yet. Send a message to coordinate with the customer on WhatsApp.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isHelper = msg.senderRole === 'helper';
                return (
                  <div key={msg.id} className={`flex ${isHelper ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs shadow-sm ${
                      isHelper ? 'bg-tealbrand-700 text-white rounded-br-none' : 'bg-white text-ink-900 border border-border rounded-bl-none'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                      <div className={`mt-1 flex items-center gap-1 text-[10px] ${isHelper ? 'text-tealbrand-100 justify-end' : 'text-ink-400'}`}>
                        <span>{new Date(msg.createdAtMs || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isHelper && <span>· {msg.deliveryStatus || 'sent'}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatScrollRef} />
          </div>

          {/* Quick Reply Chips */}
          <div className="px-4 py-2 border-t border-border bg-white flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => sendHelperRequestMessage({ requestId, text: "I'm on my way to your location now." })}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-well text-ink-700 hover:bg-border whitespace-nowrap"
            >
              🚗 On my way
            </button>
            <button
              onClick={() => sendHelperRequestMessage({ requestId, text: "I have arrived outside your location." })}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-well text-ink-700 hover:bg-border whitespace-nowrap"
            >
              📍 I have arrived
            </button>
            <button
              onClick={() => sendHelperRequestMessage({ requestId, text: "Running 5 minutes behind due to traffic." })}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-well text-ink-700 hover:bg-border whitespace-nowrap"
            >
              ⏱️ 5 mins behind
            </button>
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-border bg-white flex items-center gap-3">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message to customer WhatsApp…"
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-xs focus:outline-none focus:border-tealbrand-700"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-tealbrand-700 hover:bg-tealbrand-800 disabled:opacity-50 text-white shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
