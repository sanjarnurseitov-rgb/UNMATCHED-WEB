'use client';

import { useState } from 'react';

/* ---------------------------------------------------------------------------
   Avatar — renders a stored image URL when available, otherwise a
   deterministic coloured monogram derived from the name.
--------------------------------------------------------------------------- */

const AVATAR_COLORS = [
  ['#d9a03c', '#6b4a10'],
  ['#3b8ce0', '#12284a'],
  ['#8b5cf6', '#2a1a54'],
  ['#2fa96c', '#0f3524'],
  ['#e04b52', '#4a1518'],
  ['#a78bfa', '#2d1f52'],
  ['#f0b429', '#4a3208'],
  ['#4ec98a', '#123d26'],
  ['#5aa9f7', '#12314f'],
  ['#f2696d', '#4a1b1d'],
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function Avatar({
  name,
  image,
  size = 32,
  rounded = 'rounded-lg',
}: {
  name: string;
  image?: string | null;
  size?: number;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };

  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        onError={() => setFailed(true)}
        style={style}
        className={`${rounded} shrink-0 object-cover ring-1 ring-ink-600`}
      />
    );
  }

  const [bg, fg] = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  const initials = name
    .split(/[\s(]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      title={name}
      style={{ ...style, background: `linear-gradient(145deg, ${bg}, ${fg})` }}
      className={`${rounded} flex shrink-0 items-center justify-center font-bold text-ink-950/90 ring-1 ring-white/10`}
    >
      {initials || '?'}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Win-rate bar
--------------------------------------------------------------------------- */

export function WinRateBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  const color =
    pct >= 60 ? 'var(--color-emerald-400)' : pct >= 45 ? 'var(--color-gold-400)' : 'var(--color-crimson-400)';
  return (
    <span className={`relative inline-flex h-2 w-full overflow-hidden rounded-full bg-ink-800 ${className}`}>
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Small pieces
--------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  sub,
  accent = 'gold',
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: 'gold' | 'azure' | 'emerald' | 'crimson' | 'violet';
  children?: React.ReactNode;
}) {
  const accents = {
    gold: 'text-gold-400',
    azure: 'text-azure-400',
    emerald: 'text-emerald-400',
    crimson: 'text-crimson-400',
    violet: 'text-violet-400',
  };

  // The display face renders Latin lowercase as small-caps, which makes long
  // names shouty and overflow the card. Numbers keep the display face; names
  // fall back to the sans face.
  const isNumeric =
    typeof value === 'string' && /^[\d\s.,%×·+\-–—/()]+$/.test(value.trim());
  const isTextValue = typeof value === 'string' && !isNumeric;

  return (
    <div className="panel animate-fade-up relative min-w-0 overflow-hidden p-4">
      <div
        className="absolute inset-x-0 top-0 h-px opacity-60"
        style={{
          background: `linear-gradient(90deg, transparent, var(--color-${accent === 'gold' ? 'gold-400' : `${accent}-400`}), transparent)`,
        }}
      />
      <p className="stat-label">{label}</p>
      {isTextValue ? (
        <p
          title={value as string}
          className={`mt-1.5 text-lg font-bold leading-tight ${accents[accent]} break-words`}
        >
          {value}
        </p>
      ) : (
        <p
          className={`mt-1.5 font-[family-name:var(--font-display)] text-2xl font-bold ${
            isNumeric ? '' : 'text-lg leading-tight break-words'
          } ${accents[accent]}`}
        >
          {value}
        </p>
      )}
      {sub ? <p className="mt-1 text-xs text-parch-500">{sub}</p> : null}
      {children}
    </div>
  );
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'gold' | 'emerald' | 'crimson' | 'azure' | 'violet';
}) {
  const tones = {
    neutral: 'bg-ink-700/70 text-parch-300 border-ink-600',
    gold: 'bg-gold-500/15 text-gold-300 border-gold-600/40',
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-600/40',
    crimson: 'bg-crimson-500/15 text-crimson-400 border-crimson-600/40',
    azure: 'bg-azure-500/15 text-azure-400 border-azure-600/40',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/40',
  };
  return <span className={`chip border ${tones[tone]}`}>{children}</span>;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel animate-fade-up p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            {title ? <h2 className="panel-title text-base font-bold sm:text-lg">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-parch-500">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 py-10 text-center">
      <span className="text-2xl opacity-40">🃏</span>
      <p className="text-sm text-parch-500">{message}</p>
    </div>
  );
}

/** Formats a win rate as a percentage with a Russian decimal comma. */
export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
