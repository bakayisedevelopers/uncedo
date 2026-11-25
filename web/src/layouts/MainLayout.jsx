import { Link } from 'react-router-dom';
import Navbar, { UNCEDO_WHATSAPP_BOOK_URL } from '../components/Navbar';

export default function MainLayout({ children }) {
  const footerLinkClassName = 'transition-colors hover:text-brand-dark';

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-zinc-900">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-zinc-200 bg-zinc-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div>
              <h4 className="mb-4 font-display text-sm font-bold text-zinc-900">Booking</h4>
              <ul className="space-y-2.5 text-sm text-zinc-600">
                <li>
                  <a
                    href={UNCEDO_WHATSAPP_BOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={footerLinkClassName}
                  >
                    Book on WhatsApp
                  </a>
                </li>
                <li><a href="/#features" className={footerLinkClassName}>Why WhatsApp</a></li>
                <li><a href="/#how-it-works" className={footerLinkClassName}>How it works</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-display text-sm font-bold text-zinc-900">Platform</h4>
              <ul className="space-y-2.5 text-sm text-zinc-600">
                <li><Link to="/" className={footerLinkClassName}>Home</Link></li>
                <li><a href="https://helpers.bakayise.com" className={footerLinkClassName}>Helpers Portal</a></li>
                <li><Link to="/sign-in" className={footerLinkClassName}>Customer Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-display text-sm font-bold text-zinc-900">Legal &amp; POPIA</h4>
              <ul className="space-y-2.5 text-sm text-zinc-600">
                <li><Link to="/privacy-policy" className={footerLinkClassName}>Privacy Policy &amp; POPIA</Link></li>
                <li><Link to="/terms" className={footerLinkClassName}>Terms of Service</Link></li>
                <li><Link to="/payment-pricing-policy" className={footerLinkClassName}>Payment &amp; Pricing Policy</Link></li>
                <li><Link to="/refund-policy" className={footerLinkClassName}>Refund &amp; Cancellation Policy</Link></li>
                <li><Link to="/data-voice-policy" className={footerLinkClassName}>Data &amp; Location Policy</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-display text-sm font-bold text-zinc-900">Connect</h4>
              <ul className="space-y-2.5 text-sm text-zinc-600">
                <li>
                  <a
                    href={UNCEDO_WHATSAPP_BOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={footerLinkClassName}
                  >
                    WhatsApp (+27 60 523 9926)
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-8">
            <p className="text-sm text-zinc-600">&copy; 2026 Uncedo. All rights reserved.</p>
            <Link to="/" aria-label="Uncedo home" className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
              <img
                src="/assets/aistudio/IMG_0926_8f427254.jpeg"
                alt="Uncedo"
                referrerPolicy="no-referrer"
                className="h-9 w-auto shrink-0 object-contain mix-blend-multiply"
              />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
