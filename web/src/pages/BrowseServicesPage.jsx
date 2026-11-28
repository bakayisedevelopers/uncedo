import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import ServiceReelsModal from '../components/ServiceReelsModal';
import WhatsAppIcon from '../components/WhatsAppIcon';
import {
  buildCatalogCategories,
  filterBrowseServiceOptions,
  loadLikedServiceOptionIds,
  saveLikedServiceOptionIds,
  subscribeToPicturedServiceOptions,
} from '../services/serviceCatalogWebService';
import { UNCEDO_WHATSAPP_BOOK_URL } from '../components/Navbar';

const SKELETON_ASPECTS = [
  'aspect-[3/4]',
  'aspect-[4/3]',
  'aspect-square',
  'aspect-[4/5]',
  'aspect-[5/4]',
  'aspect-[3/4]',
  'aspect-[4/3]',
  'aspect-[4/5]',
];

export default function BrowseServicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [likedIds, setLikedIds] = useState(() => loadLikedServiceOptionIds());
  const [brokenImageIds, setBrokenImageIds] = useState(() => new Set());
  const [activeReelItemId, setActiveReelItemId] = useState('');
  const deepLinkAppliedRef = useRef(false);

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

  const validOptions = useMemo(
    () => options.filter((item) => !brokenImageIds.has(item.id)),
    [brokenImageIds, options],
  );

  // Open shared ?service=<id> deep link automatically once options load
  useEffect(() => {
    if (loading || deepLinkAppliedRef.current || !validOptions.length) return;
    deepLinkAppliedRef.current = true;
    const requestedId = String(searchParams.get('service') || '').trim();
    if (!requestedId) return;
    if (validOptions.some((item) => item.id === requestedId)) {
      setActiveReelItemId(requestedId);
    }
  }, [loading, searchParams, validOptions]);

  const categories = useMemo(
    () => buildCatalogCategories(validOptions),
    [validOptions],
  );

  const likedCount = useMemo(
    () => validOptions.filter((item) => likedIds.has(item.id)).length,
    [likedIds, validOptions],
  );

  const filteredItems = useMemo(
    () =>
      filterBrowseServiceOptions(validOptions, {
        searchQuery,
        categoryId: activeCategory,
        likedIds,
        onlyLiked: activeCategory === 'liked',
      }),
    [activeCategory, likedIds, searchQuery, validOptions],
  );

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

  const openReel = (item) => {
    if (!item?.id) return;
    setActiveReelItemId(item.id);
    syncServiceParam(item.id);
  };

  const closeReel = useCallback(() => {
    setActiveReelItemId('');
    syncServiceParam('');
  }, [syncServiceParam]);

  const handleActiveReelChange = useCallback(
    (item) => {
      if (!item?.id) return;
      if (String(searchParams.get('service') || '') !== item.id) {
        syncServiceParam(item.id);
      }
    },
    [searchParams, syncServiceParam],
  );

  const toggleLike = (id, event) => {
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
  };

  const handleImageError = (id) => {
    setBrokenImageIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setActiveCategory('all');
  };

  const reelItems = useMemo(() => {
    if (!activeReelItemId) return [];
    if (filteredItems.some((item) => item.id === activeReelItemId)) {
      return filteredItems;
    }
    return validOptions;
  }, [activeReelItemId, filteredItems, validOptions]);

  return (
    <MainLayout hideHelpers>
      <div className="min-h-screen bg-zinc-50/70 pb-16">
        {/* Mobile-Inspired Minimal Search Section Directly on Top */}
        <section className="mx-auto max-w-7xl px-3.5 pt-4 sm:px-6 sm:pt-5 lg:px-8">
          <div className="mx-auto max-w-2xl">
            <label htmlFor="service-catalog-search" className="sr-only">
              Search services
            </label>
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-4 h-4 w-4 text-brand-dark"
                aria-hidden="true"
              />
              <input
                id="service-catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a service"
                className="min-h-[48px] w-full rounded-2xl border border-zinc-200 bg-white pl-11 pr-10 text-sm font-medium text-zinc-900 shadow-sm placeholder:text-zinc-400 transition-colors focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 inline-flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Slim Single-Row Filter Tabs */}
          {!loading && validOptions.length > 0 && (
            <div
              role="tablist"
              aria-label="Filter services by category"
              className="mt-3.5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
                className={`inline-flex min-h-[36px] shrink-0 items-center whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  activeCategory === 'all'
                    ? 'bg-brand-dark text-white shadow-sm'
                    : 'border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950'
                }`}
              >
                All
              </button>

              {likedCount > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === 'liked'}
                  onClick={() => setActiveCategory('liked')}
                  className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    activeCategory === 'liked'
                      ? 'bg-brand-dark text-white shadow-sm'
                      : 'border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950'
                  }`}
                >
                  <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="tabular-nums">Liked ({likedCount})</span>
                </button>
              )}

              {categories.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`inline-flex min-h-[36px] shrink-0 items-center whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-brand-dark text-white shadow-sm'
                        : 'border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Full-Screen Pinterest-Style Masonry Grid */}
        <section className="mx-auto max-w-7xl px-3.5 pt-4 sm:px-6 sm:pt-5 lg:px-8">
          {errorMessage && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="columns-2 gap-3 sm:gap-4 md:columns-3 lg:columns-4 xl:columns-5">
              {SKELETON_ASPECTS.map((aspectClass, index) => (
                <div
                  key={`skeleton-${index}`}
                  className={`mb-3 w-full break-inside-avoid animate-pulse rounded-2xl border border-zinc-200 bg-zinc-200/70 sm:mb-4 sm:rounded-3xl ${aspectClass}`}
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="mx-auto mt-6 max-w-lg rounded-3xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
              <h2 className="font-display text-lg font-bold text-zinc-950">
                {validOptions.length === 0
                  ? 'No services with photos yet'
                  : 'No matching services'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {validOptions.length === 0
                  ? 'Services with photos will appear here soon. You can still message Uncedo on WhatsApp anytime.'
                  : 'Try another search term or message Uncedo directly on WhatsApp.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {(searchQuery || activeCategory !== 'all') && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    Reset
                  </button>
                )}
                <a
                  href={UNCEDO_WHATSAPP_BOOK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-brand-dark px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                >
                  <WhatsAppIcon className="h-4 w-4 shrink-0" />
                  <span>Book on WhatsApp</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="columns-2 gap-3 sm:gap-4 md:columns-3 lg:columns-4 xl:columns-5">
              {filteredItems.map((item) => {
                const isLiked = likedIds.has(item.id);

                return (
                  <article
                    key={item.id}
                    className="group relative mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md sm:mb-4 sm:rounded-3xl"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openReel(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openReel(item);
                        }
                      }}
                      aria-label={`Open ${item.title} (${item.priceLabel})`}
                      className="relative block w-full cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => handleImageError(item.id)}
                        className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
                      />

                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/10 to-zinc-950/20"
                      />

                      {/* Top Bar: Price & Like toggle matching mobile grid rhythm in landing colors */}
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
                        <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold tabular-nums text-zinc-950 shadow-sm backdrop-blur-sm">
                          {item.priceLabel}
                        </span>

                        <button
                          type="button"
                          onClick={(event) => toggleLike(item.id, event)}
                          aria-pressed={isLiked}
                          aria-label={isLiked ? `Unlike ${item.title}` : `Like ${item.title}`}
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                            isLiked
                              ? 'bg-brand-dark text-white'
                              : 'bg-white/90 text-zinc-700 hover:bg-white hover:text-zinc-950'
                          }`}
                        >
                          <Heart
                            className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>

                      {/* Bottom Title */}
                      <div className="absolute inset-x-0 bottom-0 p-3 text-left sm:p-3.5">
                        <h2 className="line-clamp-2 font-display text-sm font-bold leading-snug text-white drop-shadow sm:text-[15px]">
                          {item.title}
                        </h2>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Instagram Reels-Style Vertical Swipe Service Viewer */}
      {activeReelItemId && reelItems.length > 0 && (
        <ServiceReelsModal
          items={reelItems}
          initialItemId={activeReelItemId}
          likedIds={likedIds}
          onToggleLike={toggleLike}
          onImageError={handleImageError}
          onActiveItemChange={handleActiveReelChange}
          onClose={closeReel}
        />
      )}
    </MainLayout>
  );
}
