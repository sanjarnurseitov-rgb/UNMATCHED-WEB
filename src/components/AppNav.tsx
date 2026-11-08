'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Дашборд' },
  { href: '/matchups', label: 'Матчапы' },
  { href: '/history', label: 'История' },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {NAV.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="tab-btn px-2.5 py-1.5 text-xs sm:px-3.5 sm:py-2 sm:text-sm"
            data-active={active}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
