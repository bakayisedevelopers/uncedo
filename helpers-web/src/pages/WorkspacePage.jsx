import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Clock, MapPin, MessageSquare, Navigation, Play, Shield, Zap } from 'lucide-react';
import {
  reportHelperAppVisibility,
  respondToServiceRequestOfferApi,
  signOutHelperAccount,
  subscribeToActiveServiceRequest,
  subscribeToPendingHelperOffers,
  subscribeToUserProfile,
  updateWebHelperLiveLocation,
} from '../services/helperDataService';

export function WorkspacePage({ user, onNavigate }) {
  const [profile, setProfile] = useState(user?.profile || {});
  const [offers, setOffers] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [gpsError, setGpsError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const lastPingTimeRef = useRef(0);

  const isOnline = String(profile?.onlineStatus || '').toLowerCase() === 'online';
  const activeRequestId = String(profile?.activeServiceRequestId || '').trim();

  // Subscribe to live helper profile, pending offers, and active request
  useEffect(() => {
    if (!user?.uid) return;
    const unsubProfile = subscribeToUserProfile(user.uid, (nextProfile) => {
      if (nextProfile) setProfile(nextProfile);
    });
    const unsubOffers = subscribeToPendingHelperOffers(user.uid, setOffers);
    return () => {
      unsubProfile?.();
      unsubOffers?.();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!activeRequestId) {
      setActiveRequest(null);
      return;
    }
    const unsubReq = subscribeToActiveServiceRequest(activeRequestId, (req) => {
      setActiveRequest(req);
    });
    return () => unsubReq?.();
  }, [activeRequestId]);

  // Request browser Notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }
  }, []);

  // Screen Wake Lock while online
  useEffect(() => {
    async function requestWakeLock() {
      if (isOnline && 'wakeLock' in navigator && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          // Wake lock not granted or supported
        }
      }
    }
    if (isOnline) {
      requestWakeLock();
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => null);
      wakeLockRef.current = null;
    }
    return () => {
      wakeLockRef.current?.release().catch(() => null);
      wakeLockRef.current = null;
    };
  }, [isOnline]);

  // Geolocation watch position when online
  const sendGpsUpdate = useCallback(async (coords) => {
    const now = Date.now();
    if (now - lastPingTimeRef.current < 20000) return; // throttle 20s
    lastPingTimeRef.current = now;
    try {
      await updateWebHelperLiveLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy || null,
        heading: coords.heading || null,
        speed: coords.speed || null,
      });
      setGpsStatus('active');
      setGpsError('');
    } catch (err) {
      setGpsStatus('error');
      setGpsError(err?.message || 'GPS sync failed.');
    }
  }, []);

  useEffect(() => {
    if (!isOnline) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsStatus('idle');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setGpsStatus('error');
      return;
    }

    setGpsStatus('acquiring');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendGpsUpdate(pos.coords);
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => sendGpsUpdate(p.coords),
          (err) => {
            setGpsStatus('error');
            setGpsError(err?.message || 'Location watch error.');
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
        );
      },
      (err) => {
        setGpsStatus('error');
        setGpsError(err?.message || 'Location permission denied or unavailable.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );

    const heartbeatId = window.setInterval(() => {
      if (!document.hidden && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => sendGpsUpdate(pos.coords),
          () => null,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
        );
      }
    }, 3 * 60 * 1000);

    return () => {
      window.clearInterval(heartbeatId);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOnline, sendGpsUpdate]);

  // Visibility change handlers (Leave-App guard)
  useEffect(() => {
    if (!isOnline) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportHelperAppVisibility({ appVisibilityState: 'hidden' }).catch(() => null);
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('⚠️ Uncedo Helpers Active Shift', {
              body: 'You are online on Uncedo. Reopen Uncedo Helpers so your live location stays up to date and you don’t miss offers.',
              tag: 'uncedo-stay-online',
            });
          } catch {
            // Notification failed
          }
        }
      } else {
        reportHelperAppVisibility({ appVisibilityState: 'visible' }).catch(() => null);
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => sendGpsUpdate(pos.coords),
            () => null,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
          );
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
    };
  }, [isOnline, sendGpsUpdate]);

  const toggleOnline = async () => {
    setActionBusy(true);
    setGpsError('');
    try {
      if (!isOnline) {
        // Request GPS permission first
        await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('Geolocation not supported.'));
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(new Error(err?.message || 'Location permission is required to go online.')),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        });
        const pos = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { timeout: 5000 });
        });
        if (pos) {
          await updateWebHelperLiveLocation({
            latitude: pos.latitude,
            longitude: pos.longitude,
            accuracy: pos.accuracy || null,
          });
        }
      } else {
        // Go offline
        await updateWebHelperLiveLocation({ onlineStatus: 'offline' });
      }
      // Refresh profile state
      setProfile((prev) => ({ ...prev, onlineStatus: isOnline ? 'offline' : 'online' }));
    } catch (err) {
      setGpsError(err?.message || 'Unable to update availability.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleOfferAction = async (offer, action) => {
    setActionBusy(true);
    try {
      await respondToServiceRequestOfferApi({
        requestId: offer.id,
        offerToken: offer.offerToken,
        offerRevision: offer.offerRevision,
        action,
      });
      if (action === 'accept') {
        onNavigate(`/requests/${offer.id}`);
      }
    } catch (err) {
      alert(err?.message || 'Unable to process offer response.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-900 pb-20">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tealbrand-700 text-white flex items-center justify-center font-bold text-lg">
            UH
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Uncedo Helpers Workspace</h1>
            <p className="text-xs text-ink-500">{profile.fullName || user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('/onboarding')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-well text-ink-700 hover:bg-border transition-colors"
          >
            Verification & Payouts
          </button>
          <button
            onClick={async () => {
              await signOutHelperAccount().catch(() => null);
              onNavigate('/sign-in');
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* Availability Card */}
        <div className="bg-white rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-well text-ink-700">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isOnline ? 'Online & Ready for Matching' : 'Currently Offline'}
            </div>
            <h2 className="text-xl font-bold tracking-tight">
              {isOnline ? 'Your live location is active for matching' : 'Go online to receive service requests'}
            </h2>
            <p className="text-sm text-ink-500 max-w-md">
              {isOnline
                ? 'Keep this web app open. We check your live device GPS automatically to match nearby customer requests.'
                : 'Tapping Go Online shares your browser live GPS and makes you discoverable to customers within 70 km.'}
            </p>
            {gpsError && <p className="text-xs font-medium text-rose-600 bg-rose-50 p-2 rounded-lg">{gpsError}</p>}
          </div>

          <button
            onClick={toggleOnline}
            disabled={actionBusy}
            className={`w-full md:w-auto px-8 py-4 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 min-h-[48px] ${
              isOnline
                ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-600/20'
                : 'bg-tealbrand-700 text-white hover:bg-tealbrand-800 shadow-tealbrand-700/20'
            }`}
          >
            <Zap className="w-5 h-5" />
            {actionBusy ? 'Updating…' : isOnline ? 'Go Offline' : 'Go Online & Start Shift'}
          </button>
        </div>

        {/* Active Job Alert Banner */}
        {activeRequest && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">Active Service Request Assigned</div>
              <h3 className="text-lg font-bold text-emerald-950">{activeRequest.serviceSummary || activeRequest.subject || 'Service Request'}</h3>
              <p className="text-xs text-emerald-800">Customer address: {activeRequest.requestPayload?.address || 'View location in request details'}</p>
            </div>
            <button
              onClick={() => onNavigate(`/requests/${activeRequest.id}`)}
              className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-md transition-colors whitespace-nowrap"
            >
              Open Request Workspace
            </button>
          </div>
        )}

        {/* Pending Offers List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight">Incoming Service Offers</h2>
          {offers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-well text-ink-400 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-ink-700">No pending offers right now</h3>
              <p className="text-xs text-ink-400">Stay online in your workspace to receive customer request notifications.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {offers.map((offer) => (
                <div key={offer.id} className="bg-white rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-ink-400">
                      <span>{offer.serviceSummary || offer.subject || 'Service request'}</span>
                      <span>·</span>
                      <span>{offer.pricingSnapshot?.total ? `R${Number(offer.pricingSnapshot.total).toFixed(2)}` : 'Priced'}</span>
                    </div>
                    <h3 className="text-base font-bold">{offer.subject || offer.serviceSummary || 'New Request'}</h3>
                    <p className="text-xs text-ink-500">📍 {offer.requestPayload?.address || 'Customer location specified'}</p>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <button
                      onClick={() => handleOfferAction(offer, 'decline')}
                      disabled={actionBusy}
                      className="flex-1 md:flex-none px-5 py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-well transition-colors"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleOfferAction(offer, 'accept')}
                      disabled={actionBusy}
                      className="flex-1 md:flex-none px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
                    >
                      Accept Job
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
