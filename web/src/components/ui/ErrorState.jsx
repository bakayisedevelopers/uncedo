import { AlertTriangle } from 'lucide-react';

export default function ErrorState({ title = 'Something went wrong', description = 'Please try again.' }) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4" />
        {title}
      </p>
      <p className="mt-1 text-sm text-rose-200/80">{description}</p>
    </div>
  );
}
