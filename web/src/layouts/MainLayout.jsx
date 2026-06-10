import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function MainLayout({ children }) {
  const footerLinkClassName = 'transition-colors hover:text-brand';

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-zinc-200 bg-zinc-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="mb-4 font-bold text-zinc-900">Product</h4>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li><a href="/#features" className={footerLinkClassName}>Features</a></li>
                <li><Link to="/helpers" className={footerLinkClassName}>Helpers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-bold text-zinc-900">Company</h4>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li><Link to="/about" className={footerLinkClassName}>About</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-bold text-zinc-900">Legal</h4>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li><Link to="/privacy-policy" className={footerLinkClassName}>Privacy Policy</Link></li>
                <li><Link to="/terms" className={footerLinkClassName}>Terms of Service</Link></li>
                <li><Link to="/refund-policy" className={footerLinkClassName}>Refund Policy</Link></li>
                <li><Link to="/data-voice-policy" className={footerLinkClassName}>Data and Voice Handling</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-bold text-zinc-900">Connect</h4>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li><span className="transition-colors hover:text-brand">YouTube</span></li>
                <li><span className="transition-colors hover:text-brand">WhatsApp</span></li>
              </ul>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-8">
            <p className="text-sm text-zinc-600">&copy; 2026 Uncedo. All rights reserved.</p>
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Uncedo logo"
                className="h-8 w-8 rounded-lg object-cover ring-1 ring-zinc-200"
              />
              <span className="font-bold text-zinc-900">Uncedo</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
