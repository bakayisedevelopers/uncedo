import { useEffect, useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Card, ConfirmDialog, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { flattenProviderServices, listHelperProfiles } from '../services/adminService';
import {
  buildServiceCatalogView,
  deleteServiceCatalogEntry,
  subscribeToServiceCatalog,
} from '../services/serviceCatalogService';
import {
  groupRowsByHelper,
  isPendingServiceOfferingStatus,
  matchesCatalogItem,
} from '../utils/moderationView';

function formatPublishedState(entry) {
  if (!entry?.persisted) return 'Not added';
  if (entry.active === false) return 'Paused';
  return 'Added';
}

export default function ServicesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [helpers, setHelpers] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoadingHelpers, setIsLoadingHelpers] = useState(true);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [isDeletingService, setIsDeletingService] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');
  const [statusBanner, setStatusBanner] = useState(() => (
    location.state?.deletedServiceLabel
      ? `"${location.state.deletedServiceLabel}" was deleted from the service catalog.`
      : ''
  ));

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
      const pendingCount = rows.filter((row) => isPendingServiceOfferingStatus(row.offeringStatus)).length;

      return {
        item,
        rows,
        helperGroups,
        pendingCount,
      };
    });
  }, [filteredCatalog, helpers]);

  const referencingBundles = useMemo(() => {
    if (!serviceToDelete?.item?.id) return [];
    return catalogEntries.filter(
      (entry) => entry.type === 'bundle'
        && Array.isArray(entry.includedServiceIds)
        && entry.includedServiceIds.includes(serviceToDelete.item.id),
    );
  }, [catalogEntries, serviceToDelete]);

  const handleConfirmDeleteService = async () => {
    const targetItem = serviceToDelete?.item;
    if (!targetItem?.id || !targetItem.persisted) return;

    setIsDeletingService(true);
    setDeleteErrorMessage('');
    try {
      await deleteServiceCatalogEntry(targetItem.id);
      setServiceToDelete(null);
      setStatusBanner(`"${targetItem.label || targetItem.id}" was deleted from the service catalog.`);
    } catch (error) {
      setDeleteErrorMessage(error?.message || 'Unable to delete this service.');
    } finally {
      setIsDeletingService(false);
    }
  };

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

        {statusBanner ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner('')}
              className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-100 hover:underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {isLoadingCatalog || isLoadingHelpers ? <LoadingState label="Loading services..." /> : null}

        {!isLoadingCatalog && !isLoadingHelpers && serviceSummaries.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {serviceSummaries.map(({ item, helperGroups, pendingCount, rows }) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/services/${item.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/services/${item.id}`);
                  }
                }}
                className="cursor-pointer rounded-[24px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-300">{item.categoryName || 'Service'}</p>
                    <p className="mt-2 text-lg font-bold text-white">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-ink-200">{item.description || 'No description yet.'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={item.persisted ? 'success' : 'neutral'}>{formatPublishedState(item)}</Badge>
                    <Badge tone={item.type === 'bundle' ? 'brand' : 'neutral'}>{item.type === 'bundle' ? 'Bundle' : 'Standard'}</Badge>
                    <Badge tone={pendingCount ? 'warning' : 'success'}>{pendingCount} pending</Badge>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={helperGroups.length ? 'brand' : 'neutral'}>{helperGroups.length} helper{helperGroups.length === 1 ? '' : 's'}</Badge>
                    <Badge tone={item.images.length ? 'success' : 'neutral'}>{item.images.length} image{item.images.length === 1 ? '' : 's'}</Badge>
                    <Badge tone={item.persisted ? (item.active === false ? 'warning' : 'success') : 'neutral'}>
                      {item.persisted ? (item.active === false ? 'Saved as paused' : 'Saved in Firestore') : 'Code only'}
                    </Badge>
                    <Badge tone={rows.length ? 'brand' : 'neutral'}>{rows.length} submission{rows.length === 1 ? '' : 's'}</Badge>
                  </div>

                  {item.persisted ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteErrorMessage('');
                        setServiceToDelete({ item, helperGroups, rows });
                      }}
                      title={`Delete ${item.label}`}
                      aria-label={`Delete ${item.label}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-200 transition hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
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

      <ConfirmDialog
        open={Boolean(serviceToDelete)}
        title={serviceToDelete ? `Delete "${serviceToDelete.item.label || serviceToDelete.item.id}"?` : 'Delete service?'}
        description="This permanently removes the service from the live Firestore catalog so it will no longer appear in the admin, helper, or customer flows."
        details={serviceToDelete ? [
          `Service ID: ${serviceToDelete.item.id}`,
          ...(serviceToDelete.helperGroups.length
            ? [`${serviceToDelete.helperGroups.length} helper profile${serviceToDelete.helperGroups.length === 1 ? '' : 's'} currently have ${serviceToDelete.rows.length} submission${serviceToDelete.rows.length === 1 ? '' : 's'} linked to this service.`]
            : []),
          ...(referencingBundles.length
            ? [`Included in ${referencingBundles.length} bundle${referencingBundles.length === 1 ? '' : 's'} (${referencingBundles.map((b) => b.label).join(', ')}). It will be removed from those bundles.`]
            : []),
          'This action cannot be undone.',
        ] : []}
        confirmLabel="Delete service"
        cancelLabel="Cancel"
        tone="danger"
        isBusy={isDeletingService}
        errorMessage={deleteErrorMessage}
        onCancel={() => {
          if (!isDeletingService) {
            setServiceToDelete(null);
            setDeleteErrorMessage('');
          }
        }}
        onConfirm={handleConfirmDeleteService}
      />
    </div>
  );
}
