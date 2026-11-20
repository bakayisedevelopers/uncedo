import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-forest-900 text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 border-b border-tealbrand-600/40"
    >
      <WifiOff className="h-3.5 w-3.5 text-tealbrand-500 shrink-0" />
      <span>You are offline. Cached pages remain visible; live job updates resume when reconnected.</span>
    </div>
  );
}
