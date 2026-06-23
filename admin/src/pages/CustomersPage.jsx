import { useEffect, useMemo, useState } from 'react';
import { MapPin, Search, User, Wallet } from 'lucide-react';
import { Badge, Card, EmptyState, LoadingState, SectionTitle } from '../components/ui';
import { listCustomerProfiles } from '../services/adminService';

function customerAddress(profile) {
  return (
    profile.customerProfile?.serviceAddress
    || profile.homeAddress
    || profile.address
    || profile.city
    || 'Not provided'
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const items = await listCustomerProfiles();
      setCustomers(items);
      setSelectedId((current) => current || items[0]?.uid || '');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    return customers.filter((item) => {
      if (!normalizedSearch) return true;
      return [
        item.fullName,
        item.displayName,
        item.email,
        item.customerProfile?.serviceAddress,
        item.city,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [customers, search]);

  const selected = filtered.find((item) => item.uid === selectedId) || filtered[0] || null;

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Customer data"
          title="Customer directory"
          description="Review client profiles, contact details, and the address data that is already stored."
          action={(
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customers"
                className="w-full rounded-2xl border border-white/10 bg-ink-950/50 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
              />
            </label>
          )}
        />

        {isLoading ? <LoadingState label="Loading customers..." /> : null}

        {!isLoading && !filtered.length ? (
          <EmptyState
            title="No customers found"
            description="Customer profiles will appear here once customers create accounts."
          />
        ) : null}

        {!isLoading && filtered.length ? (
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              {filtered.map((customer) => (
                <button
                  type="button"
                  key={customer.uid}
                  onClick={() => setSelectedId(customer.uid)}
                  className={`w-full rounded-[24px] border p-4 text-left transition ${
                    customer.uid === selectedId
                      ? 'border-brand/30 bg-brand/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-white">{customer.fullName || customer.displayName || customer.email}</p>
                      <p className="mt-1 truncate text-sm text-ink-200">{customer.email}</p>
                      <p className="mt-2 text-xs text-ink-300">{customerAddress(customer)}</p>
                    </div>
                    <Badge tone="neutral">{customer.activeRole || customer.role || 'customer'}</Badge>
                  </div>
                </button>
              ))}
            </div>

            <div>
              {selected ? (
                <Card>
                  <SectionTitle
                    eyebrow="Client profile"
                    title={selected.fullName || selected.displayName || selected.email}
                    description="This panel shows the stored account data and any visible location fields."
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Email', selected.email || 'Not set'],
                      ['Address', customerAddress(selected)],
                      ['Phone', selected.phoneNumber || 'Not set'],
                      ['Account type', selected.customerProfile?.accountType || 'Not set'],
                      ['Customer type', selected.customerProfile?.customerType || 'Not set'],
                      ['Discovery source', selected.customerProfile?.discoverySource || 'Not set'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">{label}</p>
                        <p className="mt-2 text-sm text-white">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <Wallet className="h-4 w-4 text-brand-soft" />
                        Wallet
                      </div>
                      <p className="mt-2 text-sm text-ink-200">
                        Balance: {Number(selected.wallet?.balance || 0).toFixed(2)} {selected.wallet?.currency || 'ZAR'}
                      </p>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <MapPin className="h-4 w-4 text-brand-soft" />
                        Location note
                      </div>
                      <p className="mt-2 text-sm text-ink-200">
                        {selected.customerProfile?.businessName
                          ? `${selected.customerProfile.businessName} is stored as a business customer profile.`
                          : 'No business profile details stored for this customer.'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <User className="h-4 w-4 text-brand-soft" />
                      Account flags
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone={selected.suspended ? 'danger' : 'neutral'}>{selected.suspended ? 'Suspended' : 'Active'}</Badge>
                      <Badge tone="neutral">{selected.activeRole || selected.role || 'customer'}</Badge>
                      <Badge tone={selected.customerProfile?.customerType ? 'brand' : 'neutral'}>
                        {selected.customerProfile?.customerType || 'personal'}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ) : (
                <EmptyState title="Select a customer" description="Choose a customer to inspect their profile details." />
              )}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
