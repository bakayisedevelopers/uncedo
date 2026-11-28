import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  Share2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import WhatsAppIcon from './WhatsAppIcon';
import {
  askServiceOptionAi,
  buildShareServiceUrl,
  buildWhatsAppQuestionUrl,
  filterBrowseServiceOptions,
  loadServiceAiChats,
  saveServiceAiChats,
} from '../services/serviceCatalogWebService';

const QUICK_ASK_SUGGESTIONS = [
  'What is included?',
  'How does pricing work?',
  'How do I book?',
];

export default function ServiceReelsView({
  items = [],
  allItems = [],
  initialItemId = '',
  feedVersion = 0,
  likedIds = new Set(),
  mode = 'page', // 'page' | 'modal'
  activeSearchQuery = '',
  statusBanner = '',
  onDismissStatusBanner,
  onToggleLike,
  onImageError,
  onActiveItemChange,
  onRefreshFeed,
  onApplySearch,
  onClose,
}) {
  const scrollerRef = useRef(null);
  const chatMessagesEndRef = useRef(null);
  const scrollSettleTimerRef = useRef(0);
  const loadedIdsRef = useRef(new Set());

  const initialIndex = useMemo(() => {
    if (!initialItemId) return 0;
    const found = items.findIndex((item) => item.id === initialItemId);
    return found >= 0 ? found : 0;
  }, [initialItemId, items]);

  const [snappedIndex, setSnappedIndex] = useState(initialIndex);
  const [scrollSettled, setScrollSettled] = useState(true);
  const [loadedImageIds, setLoadedImageIds] = useState(() => new Set());
  const [displayItem, setDisplayItem] = useState(() => items[initialIndex] || items[0] || null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [copiedId, setCopiedId] = useState('');
  const [pulseHeartId, setPulseHeartId] = useState('');
  const [commentsItem, setCommentsItem] = useState(null);
  const [chatsByService, setChatsByService] = useState(() => loadServiceAiChats());
  const [draftQuestion, setDraftQuestion] = useState('');
  const [chatSendingServiceId, setChatSendingServiceId] = useState('');
  const [chatErrorByServiceId, setChatErrorByServiceId] = useState({});

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(activeSearchQuery);

  const targetItem = items[snappedIndex] || items[0] || null;
  const currentItem = displayItem || targetItem;

  const markImageLoaded = useCallback((id) => {
    if (!id || loadedIdsRef.current.has(id)) return;
    loadedIdsRef.current.add(id);
    setLoadedImageIds(new Set(loadedIdsRef.current));
  }, []);

  // Lock body scroll in modal mode or full-screen reels page
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Reset scroll position cleanly whenever feedVersion or initialItemId resets the feed
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slideHeight = scroller.clientHeight || window.innerHeight;
    scroller.scrollTo({
      top: initialIndex * slideHeight,
      behavior: 'auto',
    });
    setSnappedIndex(initialIndex);
    setScrollSettled(true);
    const nextTarget = items[initialIndex] || items[0] || null;
    if (nextTarget) {
      setDisplayItem(nextTarget);
    }
  }, [feedVersion, initialIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep snappedIndex valid if items array shrinks
  useEffect(() => {
    if (!items.length) {
      if (mode === 'modal') {
        onClose?.();
      }
      return;
    }
    if (snappedIndex >= items.length) {
      setSnappedIndex(items.length - 1);
    }
  }, [items.length, mode, onClose, snappedIndex]);

  // Preload target image and adjacent images; update details ONLY after target image loads & scroll settles
  useEffect(() => {
    if (!targetItem) return undefined;

    if (!loadedIdsRef.current.has(targetItem.id)) {
      const preloader = new window.Image();
      preloader.referrerPolicy = 'no-referrer';
      preloader.onload = () => markImageLoaded(targetItem.id);
      preloader.onerror = () => onImageError?.(targetItem.id);
      preloader.src = targetItem.imageUrl;
      if (preloader.complete && preloader.naturalWidth > 0) {
        markImageLoaded(targetItem.id);
      }
    }

    // Warm adjacent slides so swiping feels instantaneous
    [items[snappedIndex + 1], items[snappedIndex - 1]].forEach((adjacent) => {
      if (!adjacent || loadedIdsRef.current.has(adjacent.id)) return;
      const warm = new window.Image();
      warm.referrerPolicy = 'no-referrer';
      warm.onload = () => markImageLoaded(adjacent.id);
      warm.src = adjacent.imageUrl;
    });

    if (scrollSettled && loadedIdsRef.current.has(targetItem.id)) {
      setDisplayItem(targetItem);
    }
    return undefined;
  }, [items, loadedImageIds, markImageLoaded, onImageError, scrollSettled, snappedIndex, targetItem]);

  useEffect(() => {
    if (currentItem?.id) {
      onActiveItemChange?.(currentItem);
    }
  }, [currentItem, onActiveItemChange]);

  const scrollToSlide = useCallback(
    (nextIndex) => {
      const scroller = scrollerRef.current;
      if (!scroller || !items.length) return;
      const clamped = Math.max(0, Math.min(nextIndex, items.length - 1));
      const slideHeight = scroller.clientHeight || window.innerHeight;
      setScrollSettled(false);
      scroller.scrollTo({
        top: clamped * slideHeight,
        behavior: 'smooth',
      });
      setSnappedIndex(clamped);
      window.clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = window.setTimeout(() => {
        setScrollSettled(true);
      }, 220);
    },
    [items.length],
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        if (commentsItem) {
          setCommentsItem(null);
          return;
        }
        if (mode === 'modal') {
          onClose?.();
        }
        return;
      }

      if (searchOpen || commentsItem) return;

      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        scrollToSlide(snappedIndex + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        scrollToSlide(snappedIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commentsItem, mode, onClose, scrollToSlide, searchOpen, snappedIndex]);

  // Listen for native scrollend when available so snap settle is immediate
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    const onScrollEnd = () => {
      window.clearTimeout(scrollSettleTimerRef.current);
      const height = scroller.clientHeight || window.innerHeight;
      if (height > 0 && items.length) {
        const finalIndex = Math.max(
          0,
          Math.min(items.length - 1, Math.round(scroller.scrollTop / height)),
        );
        setSnappedIndex(finalIndex);
      }
      setScrollSettled(true);
    };
    scroller.addEventListener('scrollend', onScrollEnd);
    return () => scroller.removeEventListener('scrollend', onScrollEnd);
  }, [items.length]);

  const handleScroll = () => {
    setScrollSettled(false);
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const slideHeight = scroller.clientHeight || window.innerHeight;
    if (slideHeight > 0) {
      const nextIndex = Math.max(
        0,
        Math.min(items.length - 1, Math.round(scroller.scrollTop / slideHeight)),
      );
      if (nextIndex !== snappedIndex) {
        setSnappedIndex(nextIndex);
      }
    }

    window.clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = window.setTimeout(() => {
      const currentScroller = scrollerRef.current;
      if (!currentScroller) return;
      const height = currentScroller.clientHeight || window.innerHeight;
      if (height > 0) {
        const finalIndex = Math.max(
          0,
          Math.min(items.length - 1, Math.round(currentScroller.scrollTop / height)),
        );
        setSnappedIndex(finalIndex);
      }
      setScrollSettled(true);
    }, 130);
  };

  useEffect(() => () => {
    window.clearTimeout(scrollSettleTimerRef.current);
  }, []);

  const handleShare = async (item, event) => {
    event?.stopPropagation?.();
    if (!item) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const basePath = mode === 'page' ? '/' : '/services';
    const shareUrl = buildShareServiceUrl(origin, item.id, basePath);
    const shareTitle = `${item.title} · ${item.priceLabel}`;
    const shareText = `Check out ${item.title} (${item.priceLabel}) on Uncedo`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard?.writeText?.(shareUrl);
      setCopiedId(item.id);
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === item.id ? '' : curr));
      }, 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const toggleExpanded = (id, event) => {
    event?.stopPropagation?.();
    if (!id) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDoubleTapImage = (item) => {
    if (!item) return;
    if (!likedIds.has(item.id)) {
      onToggleLike?.(item.id);
    }
    setPulseHeartId(item.id);
    window.setTimeout(() => {
      setPulseHeartId((curr) => (curr === item.id ? '' : curr));
    }, 650);
  };

  const sendAskQuestion = useCallback(async (questionText, { appendUserTurn = true } = {}) => {
    const target = commentsItem;
    if (!target) return;
    const trimmed = String(questionText || '').trim();
    if (!trimmed || chatSendingServiceId === target.id) return;

    const targetKey = target.id;
    const existingMessages = Array.isArray(chatsByService[targetKey])
      ? chatsByService[targetKey]
      : [];

    const historyForApi = appendUserTurn
      ? existingMessages
      : existingMessages.slice(0, -1);

    if (appendUserTurn) {
      const userTurn = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        text: trimmed,
        createdAt: new Date().toLocaleTimeString('en-ZA', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setChatsByService((prev) => {
        const current = Array.isArray(prev[targetKey]) ? prev[targetKey] : [];
        const next = {
          ...prev,
          [targetKey]: [...current, userTurn].slice(-24),
        };
        saveServiceAiChats(next);
        return next;
      });
      setDraftQuestion('');
    }

    setChatErrorByServiceId((prev) => {
      if (!prev[targetKey]) return prev;
      const next = { ...prev };
      delete next[targetKey];
      return next;
    });
    setChatSendingServiceId(targetKey);

    try {
      const response = await askServiceOptionAi({
        item: target,
        message: trimmed,
        history: historyForApi,
      });

      const assistantTurn = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        text: response.reply,
        createdAt: new Date().toLocaleTimeString('en-ZA', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setChatsByService((prev) => {
        const current = Array.isArray(prev[targetKey]) ? prev[targetKey] : [];
        const next = {
          ...prev,
          [targetKey]: [...current, assistantTurn].slice(-24),
        };
        saveServiceAiChats(next);
        return next;
      });
    } catch (error) {
      setChatErrorByServiceId((prev) => ({
        ...prev,
        [targetKey]: {
          message: error?.message || 'Unable to get a response right now. Please try again.',
          failedQuestion: trimmed,
        },
      }));
    } finally {
      setChatSendingServiceId((curr) => (curr === targetKey ? '' : curr));
    }
  }, [chatSendingServiceId, chatsByService, commentsItem]);

  const handleAskSubmit = (event) => {
    event.preventDefault();
    sendAskQuestion(draftQuestion);
  };

  const handleClearChat = (serviceKey) => {
    if (!serviceKey) return;
    setChatsByService((prev) => {
      if (!prev[serviceKey]) return prev;
      const next = { ...prev };
      delete next[serviceKey];
      saveServiceAiChats(next);
      return next;
    });
    setChatErrorByServiceId((prev) => {
      if (!prev[serviceKey]) return prev;
      const next = { ...prev };
      delete next[serviceKey];
      return next;
    });
  };

  const searchPool = allItems.length ? allItems : items;
  const searchPreviewResults = useMemo(() => {
    const trimmed = searchDraft.trim();
    if (!trimmed) return searchPool.slice(0, 12);
    return filterBrowseServiceOptions(searchPool, { searchQuery: trimmed });
  }, [searchDraft, searchPool]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setSearchOpen(false);
    onApplySearch?.(searchDraft.trim());
  };

  const handleSelectSearchPreview = (selectedItem) => {
    setSearchOpen(false);
    onApplySearch?.(searchDraft.trim(), selectedItem.id);
  };

  const activeChatMessages = useMemo(
    () => (commentsItem && Array.isArray(chatsByService[commentsItem.id]) ? chatsByService[commentsItem.id] : []),
    [chatsByService, commentsItem],
  );
  const isSendingChat = Boolean(commentsItem && chatSendingServiceId === commentsItem.id);
  const activeChatError = commentsItem ? chatErrorByServiceId[commentsItem.id] : null;

  useEffect(() => {
    if (!commentsItem) return;
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeChatError, activeChatMessages.length, commentsItem, isSendingChat]);

  const isLiked = currentItem ? likedIds.has(currentItem.id) : false;
  const isExpanded = currentItem ? expandedIds.has(currentItem.id) : false;
  const isCopied = currentItem ? copiedId === currentItem.id : false;
  const chatCount = currentItem && Array.isArray(chatsByService[currentItem.id])
    ? chatsByService[currentItem.id].length
    : 0;
  const showParentName =
    currentItem?.parentServiceLabel
    && currentItem.parentServiceLabel.toLowerCase() !== currentItem.title.toLowerCase();
  const overlaysVisible =
    Boolean(currentItem)
    && Boolean(targetItem)
    && scrollSettled
    && currentItem.id === targetItem.id;
  const overlayFadeClass = `transition-opacity duration-200 ease-out ${
    overlaysVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
  }`;

  return (
    <div
      className={`fixed inset-0 ${
        mode === 'modal' ? 'z-50' : 'z-30'
      } flex items-center justify-center overflow-hidden bg-zinc-950 text-white md:p-4`}
    >
      {/* Reel Frame: Edge-to-edge full height on mobile, centered 9:16 Reels stage on desktop */}
      <div className="relative h-full w-full overflow-hidden bg-zinc-900 md:h-[calc(100dvh-2rem)] md:max-w-[440px] md:rounded-3xl md:border md:border-white/15 md:shadow-2xl">
        {/* LAYER 1: Image-Only Scrolling Track (ONLY images swipe/move!) */}
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => (
            <div
              key={item.id}
              onDoubleClick={() => handleDoubleTapImage(item)}
              className="relative h-full w-full snap-start snap-always overflow-hidden bg-zinc-900"
            >
              <img
                src={item.imageUrl}
                alt={item.title}
                loading="eager"
                referrerPolicy="no-referrer"
                onLoad={() => markImageLoaded(item.id)}
                onError={() => onImageError?.(item.id)}
                className="h-full w-full select-none object-cover"
              />
            </div>
          ))}
        </div>

        {/* LAYER 2: Fixed Contrast Scrims (fade out during swipe, fade back in on settle) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/45 via-black/15 to-transparent ${overlayFadeClass}`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[62%] bg-gradient-to-t from-black/95 via-black/60 to-transparent ${overlayFadeClass}`}
        />

        {/* Double-tap heart burst */}
        {currentItem && pulseHeartId === currentItem.id && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <Heart className="h-20 w-20 animate-ping fill-emerald-400 text-emerald-400" />
          </div>
        )}

        {/* LAYER 3: Fixed Top Overlay (Top-Right Refresh & Search in page mode, Category + Close in modal mode) */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4 sm:p-5 ${overlayFadeClass}`}
        >
          {mode === 'page' ? (
            <div aria-hidden="true" />
          ) : (
            <div className="min-w-0 text-xs font-semibold text-white/90 drop-shadow">
              <span>{currentItem?.categoryName || 'Service'}</span>
              <span className="mx-1.5 text-white/60" aria-hidden="true">·</span>
              <span className="tabular-nums text-white/75">
                {snappedIndex + 1} / {items.length}
              </span>
            </div>
          )}

          <div
            className={`flex items-center gap-2 ${
              overlaysVisible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {activeSearchQuery && mode === 'page' && (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft('');
                  onRefreshFeed?.(currentItem?.id);
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md transition-colors hover:bg-black/75"
              >
                <span className="max-w-[110px] truncate">“{activeSearchQuery}”</span>
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            )}

            {mode === 'page' ? (
              <>
                <button
                  type="button"
                  onClick={() => onRefreshFeed?.(currentItem?.id)}
                  aria-label="Refresh services feed"
                  title="Refresh services feed"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft(activeSearchQuery);
                    setSearchOpen(true);
                  }}
                  aria-label="Search services"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close service viewer"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Status Toast Banner (e.g. No items found -> feed refreshed) */}
        {statusBanner && (
          <div className="pointer-events-auto absolute inset-x-4 top-16 z-30 flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-zinc-900/90 px-4 py-3 text-xs font-medium text-white shadow-xl backdrop-blur-md">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={onDismissStatusBanner}
              aria-label="Dismiss notification"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* LAYER 4A: Fixed Bottom-Right Reels Action Column (Like -> Share -> Ask -> Details) */}
        {currentItem && (
          <div
            className={`absolute right-3.5 z-20 flex flex-col items-center gap-3.5 sm:right-4 ${
              mode === 'page'
                ? 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))]'
                : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
            } ${overlayFadeClass}`}
          >
            {/* 1. Like */}
            <button
              type="button"
              onClick={(event) => onToggleLike?.(currentItem.id, event)}
              aria-pressed={isLiked}
              aria-label={isLiked ? `Unlike ${currentItem.title}` : `Like ${currentItem.title}`}
              className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition-transform duration-150 group-active:scale-90 ${
                  isLiked
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                    : 'bg-black/40 text-white hover:bg-black/65'
                }`}
              >
                <Heart
                  className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`}
                  aria-hidden="true"
                />
              </span>
              <span className="text-[11px] font-semibold tracking-tight text-white drop-shadow">
                {isLiked ? 'Liked' : 'Like'}
              </span>
            </button>

            {/* 2. Share */}
            <button
              type="button"
              onClick={(event) => handleShare(currentItem, event)}
              aria-label={`Share ${currentItem.title}`}
              className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform duration-150 hover:bg-black/65 group-active:scale-90">
                <Share2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold tracking-tight text-white drop-shadow">
                {isCopied ? 'Copied' : 'Share'}
              </span>
            </button>

            {/* 3. Ask Uncedo Conversation */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setCommentsItem(currentItem);
                setDraftQuestion('');
              }}
              aria-label={`Ask about ${currentItem.title}`}
              className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform duration-150 hover:bg-black/65 group-active:scale-90">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold tabular-nums tracking-tight text-white drop-shadow">
                {chatCount > 0 ? `Ask (${chatCount})` : 'Ask'}
              </span>
            </button>

            {/* 4. Details Toggle */}
            <button
              type="button"
              onClick={(event) => toggleExpanded(currentItem.id, event)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Show fewer details' : 'Show full details'}
              className="group flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <span
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition-transform duration-150 group-active:scale-90 ${
                  isExpanded
                    ? 'bg-white text-zinc-950'
                    : 'bg-black/40 text-white hover:bg-black/65'
                }`}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold tracking-tight text-white drop-shadow">
                {isExpanded ? 'Less' : 'Details'}
              </span>
            </button>
          </div>
        )}

        {/* LAYER 4B: Fixed Bottom-Left Details Block + Book CTA */}
        {currentItem && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col gap-2 px-4 pr-20 sm:px-5 sm:pr-24 ${
              mode === 'page'
                ? 'bottom-[calc(2.35rem+env(safe-area-inset-bottom))]'
                : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
            } ${overlayFadeClass}`}
          >
            <p className="truncate text-xs font-semibold text-emerald-300 drop-shadow">
              {currentItem.categoryName}
              {showParentName ? ` · ${currentItem.parentServiceLabel}` : ''}
            </p>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h1 className="font-display text-xl font-extrabold leading-tight text-white drop-shadow sm:text-2xl">
                {currentItem.title}
              </h1>
              <span className="font-display text-base font-bold tabular-nums text-emerald-300 drop-shadow sm:text-lg">
                {currentItem.priceLabel}
              </span>
            </div>

            <p
              onClick={(event) => toggleExpanded(currentItem.id, event)}
              className={`text-sm leading-relaxed text-zinc-100/95 drop-shadow ${
                overlaysVisible ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
              } ${isExpanded ? '' : 'line-clamp-2'}`}
            >
              {currentItem.description}
            </p>

            <div className={`pt-1 ${overlaysVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}>
              <a
                href={currentItem.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[46px] w-full max-w-xs items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-dark px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <WhatsAppIcon className="h-4 w-4 shrink-0" />
                <span>Book on WhatsApp</span>
              </a>
            </div>
          </div>
        )}

        {/* LAYER 4C: Centered About · Policies Text Links at Bottom */}
        {mode === 'page' && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-[calc(0.4rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-center ${overlayFadeClass}`}
          >
            <div
              className={`flex items-center gap-2.5 text-xs font-semibold text-white/85 drop-shadow ${
                overlaysVisible ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <Link
                to="/about"
                className="py-0.5 transition-colors hover:text-white hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                About
              </Link>
              <span aria-hidden="true" className="text-white/50">·</span>
              <Link
                to="/policies"
                className="py-0.5 transition-colors hover:text-white hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Policies
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Prev / Next Vertical Reel Buttons */}
      {items.length > 1 && (
        <div className="pointer-events-none fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-3 md:flex">
          <button
            type="button"
            disabled={snappedIndex <= 0}
            onClick={() => scrollToSlide(snappedIndex - 1)}
            aria-label="Previous service"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-white backdrop-blur-md transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={snappedIndex >= items.length - 1}
            onClick={() => scrollToSlide(snappedIndex + 1)}
            aria-label="Next service"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-zinc-900/80 text-white backdrop-blur-md transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Search Overlay Component */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:p-6"
          onClick={() => setSearchOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search services"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-b-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 border-b border-zinc-200 p-4"
            >
              <div className="relative flex flex-1 items-center">
                <Search
                  className="pointer-events-none absolute left-3.5 h-4 w-4 text-brand-dark"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  autoFocus
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search services (e.g. braids, laundry)"
                  className="min-h-[46px] w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-9 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-brand-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
                {searchDraft && (
                  <button
                    type="button"
                    onClick={() => setSearchDraft('')}
                    aria-label="Clear search query"
                    className="absolute right-2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="inline-flex min-h-[46px] shrink-0 items-center justify-center rounded-xl bg-brand-dark px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-800"
              >
                Search
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {searchPreviewResults.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="font-display text-sm font-bold text-zinc-900">
                    No matching services found
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Press Search to refresh the feed or try another keyword.
                  </p>
                </div>
              ) : (
                searchPreviewResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => handleSelectSearchPreview(result)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-2.5 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
                  >
                    <img
                      src={result.imageUrl}
                      alt={result.title}
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-bold text-zinc-950">
                        {result.title}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {result.categoryName}
                        {result.parentServiceLabel
                        && result.parentServiceLabel.toLowerCase() !== result.title.toLowerCase()
                          ? ` · ${result.parentServiceLabel}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-xs font-bold tabular-nums text-brand-dark">
                      {result.priceLabel}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ask Uncedo Multi-Turn Conversation Slide-Up Drawer */}
      {commentsItem && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center md:p-6"
          onClick={() => setCommentsItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reel-ask-title"
            className="flex h-[80vh] max-h-[640px] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl md:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-brand-dark">
                  Ask Uncedo · {commentsItem.priceLabel}
                </p>
                <h3 id="reel-ask-title" className="truncate font-display text-base font-bold text-zinc-950">
                  {commentsItem.title}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {activeChatMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleClearChat(commentsItem.id)}
                    aria-label="Clear conversation"
                    title="Clear conversation"
                    className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Clear</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCommentsItem(null)}
                  aria-label="Close questions panel"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {activeChatMessages.length === 0 ? (
                <div className="space-y-4 py-4">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3.5 text-sm leading-relaxed text-zinc-800">
                    Ask anything about <span className="font-semibold text-zinc-950">{commentsItem.title}</span> — what is included, pricing, helper verification, or how booking works.
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Quick questions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_ASK_SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          disabled={isSendingChat}
                          onClick={() => sendAskQuestion(suggestion)}
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-brand-dark disabled:opacity-50"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                activeChatMessages.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        turn.role === 'user'
                          ? 'rounded-br-md bg-brand-dark text-white'
                          : 'rounded-bl-md border border-zinc-200/80 bg-zinc-100 text-zinc-900'
                      }`}
                    >
                      <p className="whitespace-pre-line">{turn.text}</p>
                    </div>
                    {turn.createdAt && (
                      <span className="mt-1 px-1 text-[11px] text-zinc-400">{turn.createdAt}</span>
                    )}
                  </div>
                ))
              )}

              {isSendingChat && (
                <div className="flex items-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-zinc-200/80 bg-zinc-100 px-4 py-2.5 text-xs font-medium text-zinc-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-dark" aria-hidden="true" />
                    <span>Checking details...</span>
                  </div>
                </div>
              )}

              {activeChatError && !isSendingChat && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                  <p className="font-medium">{activeChatError.message}</p>
                  {activeChatError.failedQuestion && (
                    <button
                      type="button"
                      onClick={() => sendAskQuestion(activeChatError.failedQuestion, { appendUserTurn: false })}
                      className="mt-2 inline-flex items-center gap-1 font-bold text-red-900 underline underline-offset-2 hover:text-red-700"
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}

              <div ref={chatMessagesEndRef} />
            </div>

            <form
              onSubmit={handleAskSubmit}
              className="space-y-2.5 border-t border-zinc-200 bg-zinc-50/80 p-4"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draftQuestion}
                  onChange={(event) => setDraftQuestion(event.target.value)}
                  disabled={isSendingChat}
                  placeholder={`Ask about ${commentsItem.title}...`}
                  className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!draftQuestion.trim() || isSendingChat}
                  aria-label="Send question"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-dark text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isSendingChat ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                <a
                  href={buildWhatsAppQuestionUrl({
                    title: commentsItem.title,
                    parentServiceLabel: commentsItem.parentServiceLabel,
                    question: draftQuestion,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-zinc-600 transition-colors hover:text-brand-dark"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>Continue on WhatsApp</span>
                </a>

                <a
                  href={commentsItem.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-brand-dark transition-colors hover:text-emerald-800"
                >
                  Book now →
                </a>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
