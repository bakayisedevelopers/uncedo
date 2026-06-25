import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { flattenProviderServices, listHelperProfiles } from '../services/adminService';
import {
  buildServiceCatalogView,
  subscribeToServiceCatalog,
} from '../services/serviceCatalogService';
import {
  groupRowsByHelper,
  isPendingSkillStatus,
  matchesCatalogItem,
} from '../utils/moderationView';

function formatPublishedState(entry) {
  if (!entry?.persisted) return 'Not added';
  if (entry.active === false) return 'Paused';
  return 'Added';
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const [helpers, setHelpers] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoadingHelpers, setIsLoadingHelpers] = useState(true);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadHelpers = async () => {
      setIsLoadingHelpers(true);
      try {
        const items = await listHelperProfiles();
        if (!cancelled) {
          setHelpers(items);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHelpers(false);
        }
      }
    };

    loadHelpers();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const connect = async () => {
      setIsLoadingCatalog(true);
      try {
        const cleanup = await subscribeToServiceCatalog((items) => {
          if (!cancelled) {
            setCatalogEntries(items);
          }
          setIsLoadingCatalog(false);
        }, () => {
          if (!cancelled) {
            setCatalogEntries(buildServiceCatalogView([]));
          }
          setIsLoadingCatalog(false);
        });
        unsubscribe = typeof cleanup === 'function' ? cleanup : () => {};
      } catch (_error) {
        if (!cancelled) {
          setCatalogEntries(buildServiceCatalogView([]));
          setIsLoadingCatalog(false);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const filteredCatalog = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();

    return [...catalogEntries]
      .filter((entry) => {
        if (!normalizedSearch) return true;
        return [entry.label, entry.categoryName, entry.description].some((value) => (
          String(value || '').toLowerCase().includes(normalizedSearch)
        ));
      })
      .sort((left, right) => `${left.categoryName}-${left.label}`.localeCompare(`${right.categoryName}-${right.label}`));
  }, [catalogEntries, search]);

  const serviceSummaries = useMemo(() => {
    return filteredCatalog.map((item) => {
      const rows = flattenProviderServices(helpers).filter((row) => matchesCatalogItem(row, item));
      const helperGroups = groupRowsByHelper(rows);
      const pendingCount = rows.filter((row) => isPendingSkillStatus(row.skillStatus)).length;

      return {
        item,
        rows,
        helperGroups,
        pendingCount,
      };
    });
  }, [filteredCatalog, helpers]);

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Service review"
          title="Services"
          description="Open a service to manage its catalog details, pricing inputs, bundle composition, images, and helper approvals."
          action={(
            <div className="flex flex-col gap-3 md:flex-row">
              <label className="relative block min-w-[280px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search service, category, or description"
                  className="w-full rounded-2xl border border-white/10 bg-ink-950/50 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
                />
              </label>
              <button
                type="button"
                onClick={() => navigate('/services/bulk-images')}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
              >
                Bulk image upload
              </button>
              <button
                type="button"
                onClick={() => navigate('/services/new')}
                className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white"
              >
                Create service
              </button>
            </div>
          )}
        />

        {isLoadingCatalog || isLoadingHelpers ? <LoadingState label="Loading services..." /> : null}

        {!isLoadingCatalog && !isLoadingHelpers && serviceSummaries.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {serviceSummaries.map(({ item, helperGroups, pendingCount, rows }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/services/${item.id}`)}
                className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-300">{item.categoryName || 'Service'}</p>
                    <p className="mt-2 text-lg font-bold text-white">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-ink-200">{item.description || 'No description yet.'}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                  <Badge tone={item.persisted ? 'success' : 'neutral'}>{formatPublishedState(item)}</Badge>
                    <Badge tone={item.kind === 'bundle' ? 'brand' : 'neutral'}>{item.kind === 'bundle' ? 'Bundle' : 'Standard'}</Badge>
                    <Badge tone={pendingCount ? 'warning' : 'success'}>{pendingCount} pending</Badge>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone={helperGroups.length ? 'brand' : 'neutral'}>{helperGroups.length} helper{helperGroups.length === 1 ? '' : 's'}</Badge>
                  <Badge tone={item.images.length ? 'success' : 'neutral'}>{item.images.length} image{item.images.length === 1 ? '' : 's'}</Badge>
                  <Badge tone={item.persisted ? (item.active === false ? 'warning' : 'success') : 'neutral'}>
                    {item.persisted ? (item.active === false ? 'Saved as paused' : 'Saved in Firestore') : 'Code only'}
                  </Badge>
                  <Badge tone={rows.length ? 'brand' : 'neutral'}>{rows.length} submission{rows.length === 1 ? '' : 's'}</Badge>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {!isLoadingCatalog && !isLoadingHelpers && !serviceSummaries.length ? (
          <EmptyState
            title="No services found"
            description="The admin catalog has not been created yet."
          />
        ) : null}
      </Card>
    </div>
  );
}
