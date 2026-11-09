'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { identityKey } from '@/lib/normalize';
import type { AppData, HeroProfile, HeroTier } from '@/lib/types';
import { Avatar, Chip, WinRateBar, formatPct } from './ui';

/* ---------------------------------------------------------------------------
   Global hero modal.

   Every hero avatar in the app (hero tables, synergy lists, match history,
   tier list) is wrapped in <HeroAvatar>. Clicking it opens this modal with
   the full profile of the hero: tier, nemesis, favourite battlefield and the
   best duo it played in.
--------------------------------------------------------------------------- */

interface HeroModalContextValue {
  openHero: (name: string) => void;
  /**
   * Artwork of a hero, taken from the IMAGES tab.
   *
   * Every hero avatar resolves its picture through this lookup, so a caller
   * never has to remember to pass `image` — that is how images went missing
   * in some blocks before.
   */
  heroImage: (name: string) => string | null;
}

const HeroModalContext = createContext<HeroModalContextValue | null>(null);

/**
 * Open the hero modal from anywhere inside <HeroModalProvider>.
 * Outside the provider the call is a no-op, so components stay reusable.
 */
export function useHeroModal(): HeroModalContextValue {
  return useContext(HeroModalContext) ?? { openHero: () => {}, heroImage: () => null };
}

export function HeroModalProvider({
  data,
  children,
}: {
  data: AppData;
  children: React.ReactNode;
}) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // The modal is rendered into <body> through a portal, so it can never be
  // offset by a transformed ancestor.
  useEffect(() => setMounted(true), []);

  const profiles = useMemo(() => {
    const map = new Map<string, HeroProfile>();
    for (const profile of data.stats.heroProfiles) {
      map.set(identityKey(profile.name), profile);
    }
    return map;
  }, [data.stats.heroProfiles]);

  const selected = selectedName ? profiles.get(identityKey(selectedName)) ?? null : null;

  /*
   * Artwork lookup. Keyed by the normalized hero name so that the different
   * spellings of the same hero always resolve to the same picture.
   */
  const heroImages = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of data.reference.heroes) {
      if (entry.image) map.set(identityKey(entry.name), entry.image);
    }
    return map;
  }, [data.reference.heroes]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedName(null);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  const value = useMemo<HeroModalContextValue>(
    () => ({
      openHero: (name: string) => setSelectedName(name),
      heroImage: (name: string) => heroImages.get(identityKey(name)) ?? null,
    }),
    [heroImages],
  );

  return (
    <HeroModalContext.Provider value={value}>
      {children}
      {mounted && selected
        ? createPortal(
            <HeroModal profile={selected} onClose={() => setSelectedName(null)} />,
            document.body,
          )
        : null}
    </HeroModalContext.Provider>
  );
}

/* ---------------------------------------------------------------------------
   Clickable hero avatar
--------------------------------------------------------------------------- */

/**
 * A hero avatar that opens the hero modal when clicked.
 *
 * The click handler stops the event from bubbling, so a hero avatar inside a
 * clickable table row opens the hero modal and not the row modal.
 */
export function HeroAvatar({
  name,
  image,
  size = 30,
  rounded = 'rounded-lg',
  className = '',
}: {
  name: string;
  image?: string | null;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  const { openHero, heroImage } = useHeroModal();

  // The caller may pass an explicit picture; otherwise it is looked up in the
  // IMAGES tab, so avatars never silently fall back to a monogram.
  const src = image ?? heroImage(name);

  // An empty hero slot renders the plain monogram and is not clickable.
  if (!name.trim()) {
    return <Avatar name={name} image={src} size={size} rounded={rounded} />;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openHero(name);
      }}
      title={`Подробнее о герое: ${name}`}
      aria-label={`Подробнее о герое ${name}`}
      className={`shrink-0 rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${className}`}
    >
      <Avatar name={name} image={src} size={size} rounded={rounded} />
    </button>
  );
}

/* ---------------------------------------------------------------------------
   The modal itself
--------------------------------------------------------------------------- */

const TIER_STYLE: Record<HeroTier, { label: string; tone: 'gold' | 'emerald' | 'azure' | 'violet' | 'crimson' }> = {
  S: { label: 'S — легенда', tone: 'gold' },
  A: { label: 'A — сильный', tone: 'emerald' },
  B: { label: 'B — крепкий', tone: 'azure' },
  C: { label: 'C — средний', tone: 'violet' },
  D: { label: 'D — слабый', tone: 'crimson' },
};

function HeroModal({ profile, onClose }: { profile: HeroProfile; onClose: () => void }) {
  const tier = TIER_STYLE[profile.tier];

  return (
    <>
      <div className="modal-overlay bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="modal-panel panel modal-animated"
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.name} — профиль героя`}
      >
        <header className="flex items-start gap-3 border-b border-ink-700 p-5">
          <Avatar name={profile.name} image={profile.image} size={56} rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-parch-100">
              {profile.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone={tier.tone}>{tier.label}</Chip>
              {profile.homebrew ? <Chip tone="violet">фан-персонаж</Chip> : null}
              <Chip tone="neutral">{profile.games} матчей</Chip>
            </div>
          </div>
          <button className="btn btn-ghost px-2.5 py-1.5" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        <div className="space-y-4 p-5">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Винрейт" value={formatPct(profile.winRate)} tone="text-gold-400" />
            <Stat label="Победы" value={profile.wins} tone="text-emerald-400" />
            <Stat label="Поражения" value={profile.losses} tone="text-crimson-400" />
            <Stat
              label="Пик рейт"
              value={formatPct(profile.pickRate)}
              tone="text-azure-400"
              hint="Доля матчей, в которых герой появлялся"
            />
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="flex items-center gap-2">
              <WinRateBar value={profile.winRate} className="flex-1" />
              <span className="text-sm font-bold tabular-nums text-parch-100">
                {formatPct(profile.winRate)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="stat-label">1 vs 1</p>
                <p className="mt-0.5 text-parch-200">
                  {profile.games1v1} игр · винрейт{' '}
                  <span className="font-semibold text-parch-100">
                    {profile.games1v1 > 0 ? formatPct(profile.winRate1v1) : '—'}
                  </span>
                </p>
              </div>
              <div>
                <p className="stat-label">2 vs 2</p>
                <p className="mt-0.5 text-parch-200">
                  {profile.games2v2} игр · винрейт{' '}
                  <span className="font-semibold text-parch-100">
                    {profile.games2v2 > 0 ? formatPct(profile.winRate2v2) : '—'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/*
            Nemesis & victim — per mode.

            The duel game and the team game are different matchups, so each
            one gets its own block: the worst opponent and the best victim in
            1 vs 1 and in 2 vs 2. Every pick comes from the opponents the hero
            has met at least twice; when only one opponent qualifies, that
            character is both the worst and the best matchup — instead of
            showing the same name twice, a single card explains it.
          */}
          <div className="grid gap-3 sm:grid-cols-2">
            <OpponentCard
              title="Худший враг · 1 vs 1"
              hint="Кто обыгрывает этого героя чаще всего в дуэли"
              opponent={profile.worstEnemy1v1}
              sibling={profile.bestVictim1v1}
              empty="Нет соперников с двумя матчами"
            />
            <OpponentCard
              title="Худший враг · 2 vs 2"
              hint="Кто обыгрывает этого героя чаще всего в командной игре"
              opponent={profile.worstEnemy2v2}
              sibling={profile.bestVictim2v2}
              empty="Нет соперников с двумя матчами"
            />
            <OpponentCard
              title="Лучшая жертва · 1 vs 1"
              hint="Кого этот герой обыгрывает чаще всего в дуэли"
              opponent={profile.bestVictim1v1}
              sibling={profile.worstEnemy1v1}
              empty="Нет соперников с двумя матчами"
            />
            <OpponentCard
              title="Лучшая жертва · 2 vs 2"
              hint="Кого этот герой обыгрывает чаще всего в командной игре"
              opponent={profile.bestVictim2v2}
              sibling={profile.worstEnemy2v2}
              empty="Нет соперников с двумя матчами"
            />
          </div>

          {/* Favourite map & best synergy */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Любимое поле</p>
              {profile.favoriteMap ? (
                <div className="mt-2 flex items-center gap-3">
                  {profile.favoriteMap.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.favoriteMap.image}
                      alt={profile.favoriteMap.name}
                      loading="lazy"
                      className="h-11 w-11 shrink-0 rounded-lg border border-ink-600 object-cover"
                    />
                  ) : (
                    <span
                      className="h-11 w-11 shrink-0 rounded-lg border border-ink-600 bg-ink-800"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-parch-100">
                      {profile.favoriteMap.name}
                    </p>
                    <p className="text-xs text-parch-500">
                      {profile.favoriteMap.games} матчей на этом поле
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-parch-500">Нет данных</p>
              )}
            </div>

            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Лучший союзник</p>
              {profile.bestSynergy ? (
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex shrink-0 -space-x-2">
                    {profile.bestSynergy.members.map((member) => (
                      <HeroAvatar
                        key={member}
                        name={member}
                        size={32}
                        rounded="rounded-md"
                        className="rounded-md ring-2 ring-ink-900"
                      />
                    ))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-parch-100">
                      {profile.bestSynergy.members.join(' + ')}
                    </p>
                    <p className="text-xs text-parch-500">
                      {profile.bestSynergy.games} совместных матчей · винрейт{' '}
                      <span className="font-semibold text-emerald-400">
                        {formatPct(profile.bestSynergy.winRate)}
                      </span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-parch-500">
                  Нет достаточно сыгранных дуо в 2 vs 2
                </p>
              )}
            </div>
          </div>

          {/* Favourite battlefields — the full list, not only the top one. */}
          {profile.topMaps.length > 0 ? (
            <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <p className="stat-label">Любимые поля</p>
              <ul className="mt-2 space-y-1.5">
                {profile.topMaps.slice(0, 6).map((map) => (
                  <li key={map.name} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-xs text-parch-200">
                      {map.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-parch-400">
                      {map.games} игр
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Full matchup table, per mode */}
          {profile.nemesis.length > 0 ? (
            <details className="rounded-lg border border-ink-700 bg-ink-900 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-parch-300">
                Все соперники ({profile.nemesis.length})
              </summary>
              <div className="mt-3 max-h-64 overflow-y-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-ink-700 text-left">
                      <th className="stat-label py-1 pr-2">Соперник</th>
                      <th className="stat-label py-1 pr-2 text-right">Матчей</th>
                      <th className="stat-label py-1 pr-2 text-right">Побед</th>
                      <th className="stat-label py-1 pr-2 text-right">Винрейт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.nemesis.map((opponent) => (
                      <tr key={opponent.name} className="border-b border-ink-800/60">
                        <td className="py-1 pr-2 text-parch-200">{opponent.name}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-parch-400">
                          {opponent.games}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums text-parch-400">
                          {opponent.wins}
                        </td>
                        <td
                          className={`py-1 pr-2 text-right tabular-nums font-semibold ${
                            opponent.winRate >= 0.5 ? 'text-emerald-400' : 'text-crimson-400'
                          }`}
                        >
                          {formatPct(opponent.winRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * One nemesis / best-victim block.
 *
 * `sibling` is the opposite slot of the same mode (the best victim for a
 * nemesis card and vice versa). When both resolve to the same character the
 * hero has only one qualified opponent, and the card says so instead of
 * pretending there are two.
 */
function OpponentCard({
  title,
  hint,
  opponent,
  sibling,
  empty,
}: {
  title: string;
  hint: string;
  opponent: { name: string; image?: string | null; games: number; wins: number; winRate: number } | null;
  sibling?: { name: string; image?: string | null; games: number; wins: number; winRate: number } | null;
  empty: string;
}) {
  const isOnlyOpponent = Boolean(opponent && sibling && opponent.name === sibling.name);

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
      <p className="stat-label" title={hint}>
        {title}
      </p>
      {opponent ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <HeroAvatar name={opponent.name} image={opponent.image} size={32} rounded="rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-parch-100">{opponent.name}</p>
              <p className="text-xs text-parch-500">
                {opponent.games} матчей · {opponent.wins} побед
              </p>
            </div>
            <span
              className={`text-sm font-bold tabular-nums ${
                opponent.winRate >= 0.5 ? 'text-emerald-400' : 'text-crimson-400'
              }`}
            >
              {formatPct(opponent.winRate)}
            </span>
          </div>
          {isOnlyOpponent ? (
            <p className="mt-2 text-[0.7rem] leading-snug text-parch-500">
              Единственный соперник с достаточной выборкой — отдельного «худшего врага» и
              «лучшей жертвы» в этом режиме нет.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-xs text-parch-500">{empty}</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-3 text-center" title={hint}>
      <p className="stat-label">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
