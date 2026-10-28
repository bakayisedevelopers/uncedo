import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src="/logo.png"
              alt="Uncedo logo"
              className="h-10 w-10 object-contain transition-transform group-hover:scale-[1.02]"
            />
            <span className="bg-gradient-to-r from-brand via-emerald-500 to-brand-dark bg-clip-text text-xl font-black text-transparent">Uncedo</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors font-medium">
              Features
            </a>
            <a href="#how-it-works" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors font-medium">
              How it Works
            </a>
            <Link to="/privacy-policy" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors font-medium">Privacy</Link>
            <Link to="/terms" className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors font-medium">Terms</Link>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <a href="https://helpers.bakayise.com" className="hidden text-sm font-bold text-zinc-700 transition hover:text-brand lg:inline">Helpers</a>
            <Link to="/sign-in" className="hidden text-sm font-bold text-zinc-700 transition hover:text-brand sm:inline">Sign in</Link>
            <Link to="/sign-up" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark">Create account</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
