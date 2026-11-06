import type { Metadata } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import Link from 'next/link';
import { AppNav } from '@/components/AppNav';
import './globals.css';

const cinzel = Cinzel({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
  variable: '--font-cinzel',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Unmatched — статистика матчей',
  description:
    'Трекер матчей настольной игры Unmatched: винрейты игроков и героев, синергии, поля боя. Данные из Google Sheets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${cinzel.variable} ${inter.variable}`}>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-16 sm:px-6 lg:px-8">
          <header className="sticky top-0 z-40 -mx-4 border-b border-ink-700/80 bg-ink-950/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 py-3">
              <Link href="/" className="group flex shrink-0 items-center gap-2.5 sm:gap-3">
                <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-base font-bold text-ink-950 shadow-lg shadow-gold-600/20 transition-transform group-hover:scale-105 sm:h-10 sm:w-10 sm:text-lg">
                  U
                </span>
                <span className="leading-tight">
                  <span className="block font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-parch-100 sm:text-lg">
                    UNMATCHED
                  </span>
                  <span className="hidden text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-gold-500 sm:block">
                    Трекер матчей
                  </span>
                </span>
              </Link>

              <AppNav />
            </div>
          </header>

          <main className="flex-1 pt-6">{children}</main>

          <footer className="mt-12 border-t border-ink-700/60 pt-6 text-xs text-parch-600">
            <p>
              Данные хранятся в Google Sheets. Приложение читает таблицу напрямую через
              Sheets API.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
