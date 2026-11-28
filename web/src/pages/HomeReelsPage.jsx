import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceReelsView from '../components/ServiceReelsView';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { UNCEDO_WHATSAPP_BOOK_URL } from '../components/Navbar';
import {
  filterBrowseServiceOptions,
  loadLikedServiceOptionIds,
  saveLikedServiceOptionIds,
  shuffleServiceOptions,
  subscribeToPicturedServiceOptions,
} from '../services/serviceCatalogWebService';

export default function HomeReelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [likedIds, setLikedIds] = useState(() => loadLikedServiceOptionIds());
  const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());
  const [feedItems, setFeedItems] = useState([]);
  const [feedVersion, setFeedVersion] = useState(0);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [statusBanner, setStatusBanner] = useState('');

  const initializedFeedRef = useRef(false);
  const statusTimerRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setErrorMessage('');
    const unsubscribe = subscribeToPicturedServiceOptions(
      (items) => {
        setOptions(items);
        setLoading(false);
      },
      (err) => {
        setErrorMessage(err?.message || 'Unable to load services right now.');
        setLoading(false);
      },
    );
    return () => unsubscribe?.();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(statusTimerRef.current);
  }, []);

  const validOptions = useMemo(
    () => options.filter((item) => !brokenImageIds.has(item.id)),
    [brokenImageIds, options],
  );

  // Sync live Firestore catalog updates without jolting active order once initialized
  useEffect(() => {
    if (loading) return;
    if (!validOptions.length) {
      setFeedItems([]);
      return;
    }

    if (!initializedFeedRef.current) {
      initializedFeedRef.current = true;
      const requestedId = String(searchParams.get('service') || '').trim();
      setFeedItems(shuffleServiceOptions(validOptions, { priorityId: requestedId }));
      setFeedVersion((v) => v + 1);
      return;
    }

    const validMap = new Map(validOptions.map((item) => [item.id, item]));
    setFeedItems((prev) => {
      const updated = prev
        .map((entry) => validMap.get(entry.id))
        .filter(Boolean);
      const presentIds = new Set(updated.map((entry) => entry.id));

      if (activeSearchQuery) {
        const matchingNew = filterBrowseServiceOptions(validOptions, {
          searchQuery: activeSearchQuery,
        }).filter((entry) => !presentIds.has(entry.id));
        return [...updated, ...matchingNew];
      }

      const newlyAdded = validOptions.filter((entry) => !presentIds.has(entry.id));
      return [...updated, ...newlyAdded];
    });
  }, [activeSearchQuery, loading, searchParams, validOptions]);

  const showBanner = useCallback((message) => {
    window.clearTimeout(statusTimerRef.current);
    setStatusBanner(message);
    statusTimerRef.current = window.setTimeout(() => {
      setStatusBanner('');
    }, 4000);
  }, []);

  const syncServiceParam = useCallback(
    (serviceId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (serviceId) {
            next.set('service', serviceId);
          } else {
            next.delete('service');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleRefreshFeed = useCallback(
    (currentItemId = '') => {
      if (!validOptions.length) return;
      const nextList = shuffleServiceOptions(validOptions, { excludeFirstId: currentItemId });
      setActiveSearchQuery('');
      setFeedItems(nextList);
      setFeedVersion((v) => v + 1);
      if (nextList[0]?.id) {
        syncServiceParam(nextList[0].id);
      }
    },
    [syncServiceParam, validOptions],
  );

  const handleApplySearch = useCallback(
    (query = '', priorityId = '') => {
      const cleanQuery = String(query || '').trim();
      if (!cleanQuery) {
        setStatusBanner('');
        handleRefreshFeed();
        return;
      }

      const matches = filterBrowseServiceOptions(validOptions, { searchQuery: cleanQuery });
      if (!matches.length) {
        showBanner(`No items found for "${cleanQuery}". Feed refreshed.`);
        const refreshed = shuffleServiceOptions(validOptions);
        setActiveSearchQuery('');
        setFeedItems(refreshed);
        setFeedVersion((v) => v + 1);
        if (refreshed[0]?.id) {
          syncServiceParam(refreshed[0].id);
        }
        return;
      }

      let orderedMatches = matches;
      if (priorityId) {
        const targetIndex = matches.findIndex((item) => item.id === priorityId);
        if (targetIndex > 0) {
          orderedMatches = [
            matches[targetIndex],
            ...matches.slice(0, targetIndex),
            ...matches.slice(targetIndex + 1),
          ];
        }
      }

      setStatusBanner('');
      setActiveSearchQuery(cleanQuery);
      setFeedItems(orderedMatches);
      setFeedVersion((v) => v + 1);
      if (orderedMatches[0]?.id) {
        syncServiceParam(orderedMatches[0].id);
      }
    },
    [handleRefreshFeed, showBanner, syncServiceParam, validOptions],
  );

  const handleToggleLike = useCallback((id, event) => {
    event?.stopPropagation?.();
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveLikedServiceOptionIds(next);
      return next;
    });
  }, []);

  const handleImageError = useCallback((id) => {
    setBrokenImageIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleActiveItemChange = useCallback(
    (item) => {
      if (!item?.id) return;
      if (String(searchParams.get('service') || '') !== item.id) {
        syncServiceParam(item.id);
      }
    },
    [searchParams, syncServiceParam],
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-950 text-white md:p-4">
        <div className="relative h-full w-full overflow-hidden bg-zinc-900 md:h-[calc(100dvh-2rem)] md:max-w-[440px] md:rounded-3xl md:border md:border-white/15">
          <div className="absolute inset-x-0 bottom-[calc(2.35rem+env(safe-area-inset-bottom))] space-y-3 px-4 sm:px-5">
            <div className="h-3.5 w-28 animate-pulse rounded bg-white/15" />
            <div className="h-7 w-56 animate-pulse rounded bg-white/20" />
            <div className="h-11 w-full max-w-xs animate-pulse rounded-xl bg-emerald-700/60" />
          </div>
          <div className="absolute inset-x-0 bottom-[calc(0.4rem+env(safe-area-inset-bottom))] flex items-center justify-center gap-2.5 text-xs font-semibold text-white/80">
            <Link to="/about" className="py-0.5 hover:text-white">About</Link>
            <span aria-hidden="true" className="text-white/50">·</span>
            <Link to="/policies" className="py-0.5 hover:text-white">Policies</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!feedItems.length) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-zinc-900 p-8 text-center">
          <img
            src="/uncedo-logo-white.png"
            alt="Uncedo"
            className="mx-auto h-8 w-auto object-contain"
          />
          <h1 className="mt-6 font-display text-2xl font-extrabold text-white">
            {errorMessage ? 'Unable to load services' : 'No visual services right now'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {errorMessage || 'Services with photos will appear here soon. You can book directly with Uncedo on WhatsApp anytime.'}
          </p>
          <div className="mt-6">
            <a
              href={UNCEDO_WHATSAPP_BOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-brand-dark px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <WhatsAppIcon className="h-4 w-4 shrink-0" />
              <span>Book on WhatsApp</span>
            </a>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2.5 text-xs font-semibold text-white/80">
            <Link to="/about" className="hover:text-white hover:underline">About</Link>
            <span aria-hidden="true">·</span>
            <Link to="/policies" className="hover:text-white hover:underline">Policies</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ServiceReelsView
      mode="page"
      items={feedItems}
      allItems={validOptions}
      feedVersion={feedVersion}
      likedIds={likedIds}
      activeSearchQuery={activeSearchQuery}
      statusBanner={statusBanner}
      onDismissStatusBanner={() => setStatusBanner('')}
      onToggleLike={handleToggleLike}
      onImageError={handleImageError}
      onActiveItemChange={handleActiveItemChange}
      onRefreshFeed={handleRefreshFeed}
      onApplySearch={handleApplySearch}
    />
  );
}
