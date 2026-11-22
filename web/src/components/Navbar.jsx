import { Link } from 'react-router-dom';
import WhatsAppIcon from './WhatsAppIcon';

export const UNCEDO_WHATSAPP_BOOK_URL =
  'https://wa.me/27605239926?text=Hi%20Uncedo%2C%20I%27d%20like%20to%20book%20a%20service';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <img
            src="/logo.png"
            alt="Uncedo"
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="font-display text-xl font-extrabold tracking-tight text-zinc-900">
            Uncedo
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-7 md:flex"
        >
          <a
            href="/#features"
            className="whitespace-nowrap shrink-0 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-4"
          >
            Why WhatsApp
          </a>
          <a
            href="/#how-it-works"
            className="whitespace-nowrap shrink-0 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-4"
          >
            How it works
          </a>
          <a
            href="https://helpers.bakayise.com"
            className="whitespace-nowrap shrink-0 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-4"
          >
            Helpers
          </a>
          <Link
            to="/sign-in"
            className="whitespace-nowrap shrink-0 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-4"
          >
            Sign in
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <a
            href={UNCEDO_WHATSAPP_BOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-dark px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            <WhatsAppIcon className="h-4 w-4 shrink-0" />
            <span>Book</span>
          </a>
        </div>
      </div>
    </header>
  );
}
