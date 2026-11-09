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
   Battlefield artwork.

   The IMAGES tab stores a URL for a battlefield under Тип = "Map". When a
   battlefield has no artwork yet, a deterministic layered gradient is drawn
   from the name so the tile still looks designed instead of empty — and it
   switches to the real picture as soon as the URL is added to the sheet.
--------------------------------------------------------------------------- */

export function MapArt({
  name,
  image,
  className = '',
  rounded = 'rounded-xl',
  position = 'relative',
}: {
  name: string;
  image?: string | null;
  className?: string;
  rounded?: string;
  /**
   * CSS position of the wrapper. `relative` by default; pass `absolute` when
   * the artwork must fill a positioned ancestor (Tailwind resolves `relative`
   * and `absolute` by stylesheet order, so the caller has to be explicit).
   */
  position?: 'relative' | 'absolute';
}) {
  const [failed, setFailed] = useState(false);
  const hue = hashName(name) % 360;
  const showImage = Boolean(image) && !failed;

  // The real picture is a plain <img>; the layer on top only darkens it so
  // the caption stays readable.
  const overlay = showImage
    ? `linear-gradient(180deg, rgba(6,8,15,0.05) 0%, rgba(6,8,15,0.32) 45%, rgba(6,8,15,0.92) 100%)`
    : [
        // Texture on top, then two coloured spotlights, then the base tone.
        `repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 18px)`,
        `radial-gradient(130% 95% at 20% 0%, hsla(${hue}, 70%, 58%, 0.8), transparent 68%)`,
        `radial-gradient(120% 90% at 92% 92%, hsla(${(hue + 50) % 360}, 62%, 48%, 0.7), transparent 66%)`,
        `radial-gradient(90% 70% at 60% 45%, hsla(${(hue + 280) % 360}, 55%, 44%, 0.45), transparent 70%)`,
        `linear-gradient(115deg, hsla(${(hue + 200) % 360}, 50%, 32%, 0.95), hsla(${hue}, 55%, 19%, 0.98))`,
      ].join(', ');

  return (
    <span className={`${position} block overflow-hidden bg-ink-900 ${rounded} ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image as string}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : null}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: overlay, backgroundSize: showImage ? 'cover' : undefined }}
      />
      {/* Gold hairline so the tile reads as a framed board. */}
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-gold-500/15" />
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
  className = '',
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: 'gold' | 'azure' | 'emerald' | 'crimson' | 'violet';
  className?: string;
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
    <div className={`panel animate-fade-up relative min-w-0 overflow-hidden p-4 ${className}`}>
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
      {sub ? <p className="mt-1.5 text-sm leading-relaxed text-parch-400">{sub}</p> : null}
      {children}
    </div>
  );
}

/**
 * One metric inside a stat card.
 *
 * `stacked` puts the label above the value — the readable choice when several
 * metrics sit side by side in a grid. The inline variant keeps the label on
 * the left and the value on the right.
 */
export function MiniStat({
  label,
  value,
  tone = 'text-parch-100',
  hint,
  stacked = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  hint?: string;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div
        className="rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2"
        title={hint}
      >
        <p className="truncate text-xs text-parch-500">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      </div>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="truncate text-xs text-parch-500">{label}</span>
      <span className={`shrink-0 text-base font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

/** Proportional bar used to split a total into segments (1 vs 1 / 2 vs 2). */
export function SplitBar({
  segments,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        {segments.map((segment) => (
          <span
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            style={{
              width: total > 0 ? `${(segment.value / total) * 100}%` : '0%',
              background: segment.color,
            }}
            className="h-full transition-all duration-500"
          />
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-parch-400">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: segment.color }}
              />
              {segment.label}
            </span>
            <span className="text-sm font-bold tabular-nums text-parch-100">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'gold' | 'emerald' | 'crimson' | 'azure' | 'violet';
  title?: string;
}) {
  const tones = {
    neutral: 'bg-ink-700/70 text-parch-300 border-ink-600',
    gold: 'bg-gold-500/15 text-gold-300 border-gold-600/40',
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-600/40',
    crimson: 'bg-crimson-500/15 text-crimson-400 border-crimson-600/40',
    azure: 'bg-azure-500/15 text-azure-400 border-azure-600/40',
    violet: 'bg-violet-500/15 text-violet-400 border-violet-500/40',
  };
  return (
    <span className={`chip border ${tones[tone]}`} title={title}>
      {children}
    </span>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`group flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
        checked
          ? 'border-gold-600/50 bg-gold-500/12'
          : 'border-ink-700 bg-ink-900 hover:border-ink-600'
      }`}
      title={description ?? label}
    >
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-gold-500' : 'bg-ink-600'
        }`}
      >
        <span
          className={`absolute h-3.5 w-3.5 rounded-full bg-ink-950 transition-transform ${
            checked ? 'translate-x-[1.15rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span
        className={`whitespace-nowrap text-xs font-semibold ${
          checked ? 'text-gold-300' : 'text-parch-400'
        }`}
      >
        {label}
      </span>
    </button>
  );
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
