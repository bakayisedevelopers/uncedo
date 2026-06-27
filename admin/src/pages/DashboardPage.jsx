import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Building2, FileText, Users, UserCircle2 } from 'lucide-react';
import { Badge, Card, EmptyState, LoadingState, MetricCard, SectionTitle } from '../components/ui';
import { flattenProviderServices, listCustomerProfiles, listHelperProfiles } from '../services/adminService';

function formatCount(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0));
}

export default function DashboardPage() {
  const [helpers, setHelpers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const [helperItems, customerItems] = await Promise.all([listHelperProfiles(), listCustomerProfiles()]);
      setHelpers(helperItems);
      setCustomers(customerItems);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const serviceRows = flattenProviderServices(helpers);
    const pendingServices = serviceRows.filter((item) => item.skillStatus === 'pending' || item.skillStatus === 'review');
    const suspendedProviders = helpers.filter((item) => item.suspended || item.adminStatus === 'suspended');
    const businessProviders = helpers.filter((item) => String(item.providerType || '').toLowerCase() === 'business');
    const verifiedProviders = helpers.filter((item) => String(item.verificationStatus || '').toLowerCase() === 'verified');
    const activeServices = serviceRows.filter((item) => item.skillActive !== false && item.skillStatus !== 'rejected');

    return {
      serviceRows,
      pendingServices,
      suspendedProviders,
      businessProviders,
      verifiedProviders,
      activeServices,
    };
  }, [helpers]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Service providers" value={formatCount(helpers.length)} detail="Helper accounts in the shared users collection" tone="brand" />
        <MetricCard label="Customers" value={formatCount(customers.length)} detail="Student/customer accounts stored in Firestore" tone="neutral" />
        <MetricCard label="Pending services" value={formatCount(summary.pendingServices.length)} detail="Skills that still need review" tone="accent" />
        <MetricCard label="Suspended providers" value={formatCount(summary.suspendedProviders.length)} detail="Providers blocked from active work" tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <SectionTitle
            eyebrow="Operations"
            title="Fast access"
            description="Jump straight into the moderation screens that matter most."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { to: '/providers', title: 'Provider directory', copy: 'Review profiles, business details, and account state.', icon: Users },
              { to: '/services', title: 'Service approvals', copy: 'Approve or suspend individual skills and photos.', icon: BadgeCheck },
              { to: '/customers', title: 'Customer records', copy: 'Inspect customer profiles and location fields.', icon: UserCircle2 },
              { to: '/services', title: 'Photo audit', copy: 'Inspect uploaded work photos before approval.', icon: Building2 },
              { to: '/helper-agreements', title: 'Helper contracts', copy: 'Publish a new helper agreement version and invalidate old acceptances.', icon: FileText },
            ].map((item) => (
              <Link key={item.to + item.title} to={item.to} className="group rounded-[24px] border border-white/10 bg-white/5 p-4 transition hover:border-brand/30 hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/15 text-brand-soft">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-ink-200">{item.copy}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle
            eyebrow="Snapshot"
            title="Current moderation mix"
            description="A quick read on the state of the platform."
          />
          <div className="space-y-3">
            {[
              ['Verified providers', summary.verifiedProviders.length, 'success'],
              ['Business providers', summary.businessProviders.length, 'brand'],
              ['Active services', summary.activeServices.length, 'neutral'],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="text-sm text-ink-200">{label}</span>
                <Badge tone={tone}>{formatCount(value)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <SectionTitle
              eyebrow="Needs attention"
              title="Pending service reviews"
              description="These are the latest skills waiting to be approved, rejected, or paused."
            />
            {summary.pendingServices.length ? (
              <div className="space-y-3">
                {summary.pendingServices.slice(0, 6).map((item) => (
                  <div key={`${item.providerUid}-${item.skillId}`} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <p className="font-bold text-white">{item.skillName}</p>
                        <p className="mt-1 text-sm text-ink-200">
                          {item.serviceName} by {item.providerName}
                        </p>
                        <p className="mt-1 text-xs text-ink-300">
                          {item.businessName || item.providerType || 'individual'} {item.city ? `- ${item.city}` : ''}
                        </p>
                      </div>
                      <Badge tone={item.skillStatus === 'pending' ? 'warning' : 'neutral'}>{item.skillStatus}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No pending reviews"
                description="New provider services will appear here when they are submitted for moderation."
              />
            )}
          </Card>

          <Card>
            <SectionTitle
              eyebrow="Service health"
              title="At a glance"
              description="A few high-level indicators for the admin team."
            />
            <div className="space-y-3">
              {summary.suspendedProviders.length ? (
                <div className="rounded-[22px] border border-rose-400/20 bg-rose-400/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-200" />
                    <div>
                      <p className="font-bold text-white">Suspended providers detected</p>
                      <p className="mt-1 text-sm leading-6 text-rose-100/90">
                        {summary.suspendedProviders.length} provider account{summary.suspendedProviders.length === 1 ? ' is' : 's are'} currently blocked from active work.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  No providers are currently suspended.
                </div>
              )}

              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 text-sm leading-6 text-ink-200">
                Customer records are visible for support and market analysis. The admin app surfaces the location and
                profile fields that already exist in Firestore.
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <LoadingState label="Loading dashboard..." />
      )}
    </div>
  );
}
