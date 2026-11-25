import { useMemo } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Home,
  Layers,
  LogOut,
  MessageSquare,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  UserCircle2,
} from 'lucide-react';
import { MasteryBadge, MembershipBadge } from '../components/rewards/MasteryBadge';
import { useHelperSession } from '../context/HelperSessionContext';
import { WHATSAPP_CHAT_URL, resolveHelperPayoutAmount, signOutHelperAccount } from '../services/helperDataService';
import { buildHelperApprovedMasteryList } from '../utils/masteryModel';

function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || 'U';
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'U';
}

function ProfileRow({ Icon, title, description, onClick, href, external = false, tone = 'default' }) {
  const toneClasses =
    tone === 'warning'
      ? 'border-amber-300 bg-amber-50 hover:bg-amber-100/70'
      : 'border-border bg-surface hover:bg-well/45';

  const iconWrapClasses =
    tone === 'warning'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-tealbrand-50 text-tealbrand-700';

  const content = (
    <>
      <span className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${iconWrapClasses}`}>
        <Icon className="h-[19px] w-[19px]" />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[15px] font-bold text-ink-900 leading-tight">{title}</span>
        <span className="block text-xs text-ink-500 mt-0.5 leading-relaxed">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-ink-400 shrink-0" />
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        className={`w-full rounded-[22px] border p-3.5 sm:p-4 flex items-center gap-3.5 transition-colors ${toneClasses}`}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[22px] border p-3.5 sm:p-4 flex items-center gap-3.5 transition-colors ${toneClasses}`}
    >
      {content}
    </button>
  );
}

export function ProfilePage({ onNavigate, pwa }) {
  const {
    user,
    profile,
    offerings,
    evaluation,
    walletSnapshot,
    jobHistory,
    rewardAccount,
    serviceOptionMasteryMap,
    serviceMasteryMap,
    serviceOptionRatingMap,
    serviceRatingMap,
    isOnline,
    liveLocationText,
    locationAccuracyMeters,
    locationLoading,
    refreshCurrentLocation,
  } = useHelperSession();

  const approvedMasteryItems = useMemo(
    () =>
      buildHelperApprovedMasteryList({
        offerings,
        serviceOptionMasteryMap,
        serviceMasteryMap,
        optionRatingMap: serviceOptionRatingMap,
        serviceRatingMap,
      }),
    [offerings, serviceOptionMasteryMap, serviceMasteryMap, serviceOptionRatingMap, serviceRatingMap],
  );
  const membershipLevel = String(rewardAccount?.membership?.currentLevel || 'neighbour').trim().toLowerCase();

  const fullName = String(profile?.fullName || user?.displayName || 'Helper').trim();
  const initials = getInitials(fullName);
  const photoUri = String(profile?.profilePhoto || profile?.selfieUrl || '').trim();
  const safeMetrics = profile?.metrics && typeof profile.metrics === 'object' ? profile.metrics : {};
  const homeAddress = String(profile?.homeAddress || '').trim() || 'Add your home address';

  const rawBalanceMinor = walletSnapshot?.wallet?.balanceMinor;
  const profileWalletMinor = profile?.wallet?.balanceMinor;
  const signedWalletMinor = Number.isSafeInteger(Number(rawBalanceMinor))
    ? Number(rawBalanceMinor)
    : Number.isSafeInteger(Number(profileWalletMinor))
      ? Number(profileWalletMinor)
      : (walletSnapshot?.wallet?.availableMinor !== undefined || walletSnapshot?.wallet?.outstandingCommissionMinor !== undefined)
        ? (Number(walletSnapshot?.wallet?.availableMinor || 0) - Number(walletSnapshot?.wallet?.outstandingCommissionMinor || 0))
        : Math.round(Number(profile?.wallet?.balance || 0) * 100);
  const displayWalletText =
    signedWalletMinor < 0
      ? `-R${(Math.abs(signedWalletMinor) / 100).toFixed(2)}`
      : `R${(signedWalletMinor / 100).toFixed(2)}`;

  const overallRating = Number(safeMetrics.overallRating || profile?.rating || 0);

  const metrics = [
    {
      key: 'acceptance',
      label: 'Acceptance',
      value: `${Math.round(Number(safeMetrics.acceptanceRate || 0) * 100)}%`,
    },
    {
      key: 'completion',
      label: 'Completion',
      value: `${Math.round(Number(safeMetrics.completionRate || 0) * 100)}%`,
    },
    {
      key: 'rating',
      label: 'Rating',
      value: overallRating > 0 ? overallRating.toFixed(1) : 'New',
    },
    {
      key: 'response',
      label: 'Response',
      value: `${Number(safeMetrics.avgResponseMinutes || 0)} min`,
    },
  ];

  const handleSignOut = async () => {
    await signOutHelperAccount().catch(() => null);
    onNavigate('/sign-in');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5">
      {/* Mobile-matched Hero Header */}
      <header className="space-y-1.5">
        <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-tealbrand-700">
          Account
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
          Profile
        </h1>
        <p className="text-sm text-ink-500 leading-relaxed">
          Manage helper details, profile completion, payout readiness, security, and offering settings.
        </p>
      </header>

      {/* Rounded Identity Card (matches mobile ProviderProfileScreen) */}
      <section className="rounded-[28px] border border-tealbrand-600/20 bg-tealbrand-50/45 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => onNavigate('/profile/details')}
            aria-label="Edit profile photo and details"
            className="h-[72px] w-[72px] rounded-3xl border border-tealbrand-600/25 bg-tealbrand-100 overflow-hidden shrink-0 flex items-center justify-center"
          >
            {photoUri ? (
              <img
                src={photoUri}
                alt={fullName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-2xl font-extrabold text-tealbrand-800">
                {initials}
              </span>
            )}
          </button>

          <div className="flex-1 min-w-0 space-y-1">
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-ink-900 truncate leading-tight">
              {fullName}
            </h2>
            <p className="text-xs sm:text-sm text-ink-500 truncate">
              {profile?.email || user?.email || 'No email set'}
            </p>
            <div className="flex items-center gap-1.5 text-sm">
              <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
              <span className="tabular-nums-mono font-extrabold text-ink-900">
                {overallRating > 0 ? overallRating.toFixed(1) : '0.0'}
              </span>
              <span className="text-xs font-semibold text-ink-500">helper rating</span>
            </div>
          </div>
        </div>

        {/* Status & Wallet Pill Row */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-full bg-tealbrand-100/80 border border-tealbrand-600/20 px-3.5 py-2 text-xs font-bold text-ink-900">
            {evaluation.fullyVerified ? (
              <CheckCircle2 className="h-4 w-4 text-tealbrand-700 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
            )}
            <span>
              {evaluation.fullyVerified
                ? 'Profile complete'
                : `${evaluation.completedTotalSteps} of ${evaluation.totalSteps} onboarding steps complete`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('/payments')}
            className="rounded-2xl border border-border bg-surface px-3.5 py-2 text-left hover:bg-well/50 transition-colors"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-ink-400 leading-none">
              Wallet
            </div>
            <div className="tabular-nums-mono text-sm font-extrabold text-tealbrand-700 mt-1 leading-none">
              {displayWalletText}
            </div>
          </button>
        </div>

        {/* Nested Location & Performance Card */}
        <div className="rounded-[22px] border border-border bg-surface p-4 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-900">
              <Home className="h-3.5 w-3.5 text-tealbrand-700" />
              <span>Home address</span>
            </div>
            <p className="text-xs sm:text-sm text-ink-500 leading-relaxed pl-5">{homeAddress}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-900">
                <Navigation className="h-3.5 w-3.5 text-tealbrand-700" />
                <span>Current live location</span>
                {isOnline && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-tealbrand-50 px-2 py-0.5 text-[10px] font-bold text-tealbrand-700 normal-case">
                    <span className="h-1.5 w-1.5 rounded-full bg-tealbrand-600 animate-pulse" />
                    Live{locationAccuracyMeters ? ` · ±${locationAccuracyMeters}m` : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={refreshCurrentLocation}
                disabled={locationLoading}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-tealbrand-700 hover:text-tealbrand-800 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${locationLoading ? 'animate-spin' : ''}`} />
                <span>{locationLoading ? 'Updating…' : 'Refresh'}</span>
              </button>
            </div>
            <p className="text-xs sm:text-sm text-ink-500 leading-relaxed pl-5">
              {liveLocationText}
            </p>
          </div>

          <div className="pt-2 space-y-2.5 border-t border-border">
            <div className="text-xs font-extrabold uppercase tracking-wider text-ink-900">
              Performance
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {metrics.map((item) => (
                <div
                  key={item.key}
                  className="rounded-[18px] border border-tealbrand-600/15 bg-tealbrand-50/45 px-3.5 py-3"
                >
                  <div className="tabular-nums-mono text-base font-extrabold text-tealbrand-700">
                    {item.value}
                  </div>
                  <div className="text-[11px] font-bold text-ink-500 mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Complete Your Profile Alert Row */}
      {!evaluation.fullyVerified && (
        <ProfileRow
          Icon={Sparkles}
          title="Complete your profile"
          description="Finish helper onboarding before you can go online and accept nearby customers."
          onClick={() => onNavigate('/onboarding')}
          tone="warning"
        />
      )}

      {/* Service Badges & Recognition */}
      <section className="rounded-[24px] border border-border bg-surface p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-base font-extrabold text-ink-900 flex items-center gap-2">
              <Award className="h-4 w-4 text-tealbrand-700" aria-hidden="true" />
              <span>Badges &amp; Recognition</span>
            </h2>
            <p className="text-xs text-ink-500">
              Platform membership reflects your overall helper standing; service badges are earned per approved service option.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/services')}
            className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg border border-border bg-well/50 hover:bg-well text-xs font-semibold text-tealbrand-700 whitespace-nowrap shrink-0"
          >
            <span>View all options</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/70">
          <span className="text-xs font-semibold text-ink-700">Overall helper membership</span>
          <MembershipBadge level={membershipLevel} size="md" />
        </div>

        {approvedMasteryItems.length > 0 ? (
          <div className="divide-y divide-border/70 border-t border-border/70">
            {approvedMasteryItems.slice(0, 4).map((item) => (
              <button
                key={item.offeringId}
                type="button"
                onClick={() => onNavigate('/services')}
                className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-well/35 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-900 truncate">
                    {item.optionTitle || item.serviceName}
                  </div>
                  <div className="text-xs text-ink-500 flex flex-wrap items-center gap-x-1.5 tabular-nums-mono">
                    {item.optionTitle && (
                      <>
                        <span>{item.serviceName}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>{item.mastery.eligibleCompletedJobCount} paid jobs</span>
                    {item.mastery.averageRating > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{item.mastery.averageRating.toFixed(1)}★</span>
                      </>
                    )}
                  </div>
                </div>
                <MasteryBadge level={item.mastery.level} size="sm" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-500 pt-2 border-t border-border/70">
            Once your first service option is approved, its mastery badge (starting at Beginner) will appear here.
          </p>
        )}
      </section>

      {/* Settings List */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-extrabold text-ink-900">Settings</h2>

        <div className="space-y-2.5">
          <ProfileRow
            Icon={UserCircle2}
            title="Personal details"
            description="Edit your name, phone number, helper type, profile selfie, and home address."
            onClick={() => onNavigate('/profile/details')}
          />
          <ProfileRow
            Icon={Layers}
            title="Service offerings"
            description="Add or remove services, manage work portfolio photos, and check service approval status."
            onClick={() => onNavigate('/services')}
          />
          <ProfileRow
            Icon={ShieldCheck}
            title="Security & police clearance"
            description="Upload or check your private police clearance certificate and account safety settings."
            onClick={() => onNavigate('/profile/security')}
          />
          <ProfileRow
            Icon={FileText}
            title="Agreement and legal"
            description="Review your signed Uncedo Helper Agreement and platform policy documents."
            onClick={() => onNavigate('/profile/legal')}
          />
          <ProfileRow
            Icon={MessageSquare}
            title="WhatsApp support"
            description="Open Uncedo Helper support on WhatsApp to link your chat or ask a question."
            href={WHATSAPP_CHAT_URL}
            external
          />
          {!pwa?.isInstalled && (
            <ProfileRow
              Icon={Download}
              title="Add to home screen"
              description="Install Uncedo Helpers as an app on your phone home screen for instant shift access."
              onClick={pwa?.openInstallPopup}
            />
          )}
        </div>
      </section>

      {/* Bottom Logout & App Version */}
      <section className="pt-2 space-y-2.5">
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full min-h-[50px] rounded-[18px] border border-border bg-tealbrand-50/50 hover:bg-red-50 hover:border-red-200 text-ink-900 hover:text-red-700 font-extrabold text-[15px] flex items-center justify-center gap-2.5 transition-colors"
        >
          <LogOut className="h-[18px] w-[18px]" />
          <span>Log out</span>
        </button>
        <div className="flex items-center justify-center gap-2.5 pt-1">
          <img
            src="/helpers-wordmark.png"
            alt="Uncedo Helpers"
            referrerPolicy="no-referrer"
            className="h-7 w-auto object-contain shrink-0"
          />
          <p className="text-xs font-medium text-ink-400">· App version 1.0.0</p>
        </div>
      </section>
    </div>
  );
}
