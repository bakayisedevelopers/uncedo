import { Link } from 'react-router-dom';
import { LEGAL_LINKS } from '../../constants/legal';

function linkClassName(className) {
  return className || 'font-bold text-brand underline underline-offset-2';
}

export function LegalLinksInline({ className }) {
  return (
    <>
      {LEGAL_LINKS.map((link, index) => {
        const isLast = index === LEGAL_LINKS.length - 1;
        const isSecondLast = index === LEGAL_LINKS.length - 2;
        let separator = ', ';
        if (isSecondLast) separator = ', and ';
        if (isLast) separator = '';

        return (
          <span key={link.href}>
            <Link to={link.href} className={linkClassName(className)}>
              {link.label}
            </Link>
            {separator}
          </span>
        );
      })}
    </>
  );
}

export function LegalLinksList({ className }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {LEGAL_LINKS.map((link) => (
        <Link key={link.href} to={link.href} className={linkClassName(className)}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}
