import { Bell, Menu } from 'lucide-react';
import ReferralShareButton from './ReferralShareButton';

export default function Topbar({
  onOpenNav,
  onOpenNotifications,
  unreadCount = 0,
  name,
  role,
  referralSlug,
  showMenuButton = true,
}) {
  return (
    <header className="mb-5 rounded-[1.5rem] border border-zinc-200 bg-white/90 px-4 py-3 shadow-[0_16px_35px_rgba(15,23,42,0.07)] backdrop-blur md:mb-6 md:rounded-[2rem] md:px-6 md:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center">
          {showMenuButton ? (
            <button
              type="button"
              onClick={onOpenNav}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-700"
              aria-label="Open more navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {role === 'student' ? (
            <ReferralShareButton
              referralSlug={referralSlug}
              variant="icon"
            />
          ) : null}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative rounded-2xl border border-zinc-200 bg-zinc-50 p-2.5 text-zinc-700 transition hover:bg-zinc-100"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </button>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-2.5 py-2">
            <img
              src="/logo.png"
              alt="Parakleo logo"
              className="h-8 w-8 rounded-xl object-cover ring-1 ring-zinc-200"
            />
            <p className="text-xs font-semibold text-zinc-700">{name || 'Parakleo User'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
