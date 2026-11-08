'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Chip,
  EmptyState,
  MapArt,
  Panel,
  SplitBar,
  StatCard,
  WinRateBar,
  formatPct,
} from './ui';
import { HeroAvatar } from './HeroModal';
import { MIN_GAMES_FOR_NEMESIS, MIN_GAMES_FOR_TIER } from '@/lib/stats';
import type { AppData, HeroProfile, HeroTier, Matchup } from '@/lib/types';

const AZURE = 'var(--color-azure-400)';
const GOLD = 'var(--color-gold-400)';
const VIOLET = 'var(--color-violet-400)';
const EMERALD = 'var(--color-emerald-400)';
const CRIMSON = 'var(--color-crimson-400)';

type Section = 'global' | '1v1' | '2v2' | 'maps';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'global', label: 'Общая статистика' },
  { id: '1v1', label: '1 vs 1' },
  { id: '2v2', label: '2 vs 2' },
  { id: 'maps', label: 'Поля боя' },
];

const TIER_META: Record<HeroTier, { label: string; tone: 'gold' | 'emerald' | 'azure' | 'violet' | 'crimson'; color: string }> = {
  S: { label: 'S', tone: 'gold', color: GOLD },
  A: { label: 'A', tone: 'emerald', color: EMERALD },
  B: { label: 'B', tone: 'azure', color: AZURE },
  C: { label: 'C', tone: 'violet', color: VIOLET },
  D: { label: 'D', tone: 'crimson', color: CRIMSON },
};

const TIER_ORDER: HeroTier[] = ['S', 'A', 'B', 'C', 'D'];

/** Canonical key for an unordered pair of heroes. */
function pairKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y, 'ru')).join('\u0000');
}

export function Matchups({ data }: { data: AppData }) {
  const [section, setSection] = useState<Section>('global');
  const { stats } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-parch-100 sm:text-3xl">
          Матчапы <span className="text-gold-500">Unmatched</span>
        </h1>
        <p className="mt-1 text-sm text-parch-500">
          Глубокая аналитика: тир-лист, матрица матчапов, синергии и баланс полей.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900/60 p-1">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            className="tab-btn flex-1"
            data-active={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'global' ? <GlobalStats stats={stats} /> : null}
      {section === '1v1' ? <MatchupStats stats={stats} /> : null}
      {section === '2v2' ? <TeamStats stats={stats} /> : null}
      {section === 'maps' ? <MapStats stats={stats} /> : null}
    </div>
  );
}

/* ========================================================================== */
/* Global statistics                                                           */
/* ========================================================================== */

function GlobalStats({ stats }: { stats: AppData['stats'] }) {
  const rated = useMemo(
    () =>
      stats.heroProfiles
        .filter((hero) => hero.games >= MIN_GAMES_FOR_TIER)
        .sort((a, b) => b.winRate - a.winRate || b.games - a.games),
    [stats.heroProfiles],
  );

  const byTier = useMemo(() => {
    const map = new Map<HeroTier, HeroProfile[]>();
    for (const tier of TIER_ORDER) map.set(tier, []);
    for (const hero of rated) map.get(hero.tier)?.push(hero);
    return map;
  }, [rated]);

  const pickRate = useMemo(
    () => [...stats.heroProfiles].sort((a, b) => b.pickRate - a.pickRate || b.games - a.games).slice(0, 15),
    [stats.heroProfiles],
  );

  return (
    <div className="space-y-4">
      {/* Tier list */}
      <Panel
        title="Тир-лист героев"
        subtitle={`Винрейт по всем матчам · учитываются герои с ${MIN_GAMES_FOR_TIER}+ матчами`}
        action={<Chip tone="gold">{rated.length} героев</Chip>}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {TIER_ORDER.map((tier) => {
            const heroes = byTier.get(tier) ?? [];
            const meta = TIER_META[tier];
            return (
              <div key={tier} className="rounded-xl border border-ink-700 bg-ink-900/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-md font-[family-name:var(--font-display)] text-sm font-bold"
                    style={{ background: `${meta.color}22`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-xs text-parch-500">{heroes.length}</span>
                </div>
                <ul className="space-y-1.5">
                  {heroes.slice(0, 14).map((hero) => (
                    <li key={hero.name}>
                      <HeroLink hero={hero} />
                    </li>
                  ))}
                  {heroes.length === 0 ? (
                    <li className="py-3 text-center text-xs text-parch-600">пусто</li>
                  ) : null}
                </ul>
                {heroes.length > 14 ? (
                  <p className="mt-2 text-center text-[0.68rem] text-parch-600">
                    и ещё {heroes.length - 14}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* First turn balance */}
        <Panel
          title="Баланс первого хода"
          subtitle="Игрок 1 / Команда 1 считаются ходившими первыми"
          className="xl:col-span-2"
        >
          <div className="space-y-4">
            {stats.firstTurn.map((turn) => (
              <div key={turn.mode} className="rounded-xl border border-ink-700 bg-ink-900 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="stat-label">
                    {turn.mode === '1v1' ? '1 vs 1' : '2 vs 2'} · {turn.matches} матчей
                  </p>
                  <Chip tone={turn.firstTurnWinRate >= 0.55 ? 'emerald' : turn.firstTurnWinRate <= 0.45 ? 'crimson' : 'gold'}>
                    {turn.firstTurnWinRate >= 0.55
                      ? 'первый ход решает'
                      : turn.firstTurnWinRate <= 0.45
                        ? 'выигрывает второй ход'
                        : 'равновесие'}
                  </Chip>
                </div>
                <SplitBar
                  segments={[
                    { label: 'Первым ходили', value: turn.firstTurnWins, color: GOLD },
                    { label: 'Вторыми ходили', value: turn.secondTurnWins, color: AZURE },
                  ]}
                />
                <p className="mt-2 text-xs text-parch-500">
                  Первый ход: <b className="text-gold-400">{formatPct(turn.firstTurnWinRate)}</b> ·
                  второй ход: <b className="text-azure-400">{formatPct(1 - turn.firstTurnWinRate)}</b>
                </p>
              </div>
            ))}
          </div>
        </Panel>

        {/* Pick rate */}
        <Panel title="Пик рейт" subtitle="Доля матчей, где герой появлялся">
          <ul className="space-y-1.5">
            {pickRate.map((hero) => (
              <li key={hero.name} className="flex items-center gap-2">
                <HeroAvatar name={hero.name} image={hero.image} size={24} rounded="rounded-md" />
                <span className="min-w-0 flex-1 truncate text-xs text-parch-200">{hero.name}</span>
                <span className="w-12 text-right text-xs font-bold tabular-nums text-parch-100">
                  {formatPct(hero.pickRate)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Pick rate table */}
      <Panel title="Герои: винрейт и пик рейт" subtitle="Полная таблица по всем героям">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left">
                <th className="stat-label py-2 pr-3">Герой</th>
                <th className="stat-label py-2 pr-3">Тир</th>
                <th className="stat-label py-2 pr-3 text-right">Матчей</th>
                <th className="stat-label py-2 pr-3 text-right">1 vs 1</th>
                <th className="stat-label py-2 pr-3 text-right">2 vs 2</th>
                <th className="stat-label py-2 pr-3 text-right">Пик рейт</th>
                <th className="stat-label w-40 py-2 pr-3">Винрейт</th>
              </tr>
            </thead>
            <tbody>
              {pickRate.map((hero) => (
                <tr key={hero.name} className="border-b border-ink-800/70">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2.5">
                      <HeroAvatar name={hero.name} image={hero.image} size={28} />
                      <span className="text-parch-100">{hero.name}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold"
                      style={{
                        background: `${TIER_META[hero.tier].color}22`,
                        color: TIER_META[hero.tier].color,
                      }}
                    >
                      {hero.tier}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-parch-300">{hero.games}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-xs text-parch-400">
                    {hero.games1v1 > 0
                      ? `${hero.games1v1} · ${formatPct(hero.winRate1v1)}`
                      : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-xs text-parch-400">
                    {hero.games2v2 > 0
                      ? `${hero.games2v2} · ${formatPct(hero.winRate2v2)}`
                      : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                    {formatPct(hero.pickRate)}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <WinRateBar value={hero.winRate} className="flex-1" />
                      <span className="w-12 text-right text-xs font-semibold tabular-nums text-parch-100">
                        {formatPct(hero.winRate)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ========================================================================== */
/* 1 vs 1                                                                      */
/* ========================================================================== */

function MatchupStats({ stats }: { stats: AppData['stats'] }) {
  const [matrixSize, setMatrixSize] = useState(10);

  const matrixHeroes = useMemo(
    () =>
      stats.heroes
        .filter((hero) => hero.games1v1 > 0)
        .sort((a, b) => b.games1v1 - a.games1v1)
        .slice(0, matrixSize),
    [stats.heroes, matrixSize],
  );

  const lookup = useMemo(() => {
    const map = new Map<string, Matchup>();
    for (const matchup of stats.matchups) {
      map.set(pairKey(matchup.heroA, matchup.heroB), matchup);
    }
    return map;
  }, [stats.matchups]);

  const nemesisRows = useMemo(
    () =>
      stats.heroProfiles
        .filter((hero) => hero.nemesis.some((o) => o.games >= MIN_GAMES_FOR_NEMESIS))
        .sort((a, b) => b.games - a.games),
    [stats.heroProfiles],
  );

  return (
    <div className="space-y-4">
      {/* Matchup matrix */}
      <Panel
        title="Матрица матчапов 1 vs 1"
        subtitle="Винрейт героя по строке против героя по столбцу"
        action={
          <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
            {[8, 10, 14].map((size) => (
              <button
                key={size}
                className="tab-btn px-2.5 py-1 text-xs"
                data-active={matrixSize === size}
                onClick={() => setMatrixSize(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        }
      >
        {matrixHeroes.length < 2 ? (
          <EmptyState message="Недостаточно данных для матрицы матчапов" />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="stat-label sticky left-0 z-10 bg-ink-900/95 py-2 pr-2" />
                  {matrixHeroes.map((hero) => (
                    <th key={hero.name} className="stat-label px-1 py-2" title={hero.name}>
                      <span className="block max-w-[92px] truncate">{hero.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixHeroes.map((row) => (
                  <tr key={row.name}>
                    <th className="stat-label sticky left-0 z-10 max-w-[150px] truncate bg-ink-900/95 py-1 pr-2 text-left">
                      {row.name}
                    </th>
                    {matrixHeroes.map((col) => {
                      if (row.name === col.name) {
                        return (
                          <td
                            key={col.name}
                            className="px-1 py-1 text-center text-parch-700"
                          >
                            —
                          </td>
                        );
                      }
                      const matchup = lookup.get(pairKey(row.name, col.name));
                      if (!matchup) {
                        return (
                          <td key={col.name} className="px-1 py-1 text-center text-parch-700">
                            ·
                          </td>
                        );
                      }
                      const rate = row.name === matchup.heroA ? matchup.winRateA : 1 - matchup.winRateA;
                      const strength = Math.min(1, Math.abs(rate - 0.5) * 2);
                      const color = rate >= 0.5 ? EMERALD : CRIMSON;
                      return (
                        <td key={col.name} className="p-0.5">
                          <div
                            className="flex flex-col items-center justify-center rounded-md py-1.5"
                            style={{
                              background: `color-mix(in srgb, ${color} ${Math.round(8 + strength * 34)}%, transparent)`,
                            }}
                            title={`${row.name} против ${col.name}: ${formatPct(rate)} за ${matchup.games} матчей`}
                          >
                            <span
                              className="font-bold tabular-nums"
                              style={{ color: rate >= 0.5 ? '#8ee8b8' : '#ff9ea1' }}
                            >
                              {formatPct(rate, 0)}
                            </span>
                            <span className="text-[0.6rem] text-parch-500">{matchup.games}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-parch-500">
          В ячейке — винрейт героя по строке. Нижнее число — количество сыгранных матчей этой пары.
        </p>
      </Panel>

      {/* Nemesis */}
      <Panel
        title="Немезиды"
        subtitle="Лучшая жертва и худший враг каждого героя"
        action={<Chip tone="gold">{nemesisRows.length} героев</Chip>}
      >
        {nemesisRows.length === 0 ? (
          <EmptyState message="Недостаточно данных" />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  <th className="stat-label py-2 pr-3">Герой</th>
                  <th className="stat-label py-2 pr-3 text-right">Матчей 1v1</th>
                  <th className="stat-label py-2 pr-3">Худший враг</th>
                  <th className="stat-label py-2 pr-3 text-right">Его винрейт</th>
                  <th className="stat-label py-2 pr-3">Лучшая жертва</th>
                  <th className="stat-label py-2 pr-3 text-right">Его винрейт</th>
                </tr>
              </thead>
              <tbody>
                {nemesisRows.map((hero) => (
                  <tr key={hero.name} className="border-b border-ink-800/70">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2.5">
                        <HeroAvatar name={hero.name} image={hero.image} size={28} />
                        <span className="text-parch-100">{hero.name}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                      {hero.games1v1}
                    </td>
                    <td className="py-2 pr-3">
                      {hero.worstEnemy ? <OpponentChip opponent={hero.worstEnemy} /> : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {hero.worstEnemy ? (
                        <span className="font-semibold text-crimson-400">
                          {formatPct(hero.worstEnemy.winRate)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {hero.bestVictim ? <OpponentChip opponent={hero.bestVictim} /> : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {hero.bestVictim ? (
                        <span className="font-semibold text-emerald-400">
                          {formatPct(hero.bestVictim.winRate)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-parch-500">
          «Худший враг» — герой, который обыгрывает данного чаще всего. «Лучшая жертва» — герой,
          которого данный обыгрывает чаще всего. Учитываются только пары с {MIN_GAMES_FOR_NEMESIS}+
          матчами.
        </p>
      </Panel>
    </div>
  );
}

/* ========================================================================== */
/* 2 vs 2                                                                      */
/* ========================================================================== */

function TeamStats({ stats }: { stats: AppData['stats'] }) {
  const best = stats.heroSynergies.slice(0, 15);
  const worst = stats.antiSynergies.slice(0, 15);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Лучшие синергии"
          subtitle="Пары героев в одной команде с самым высоким винрейтом"
          action={<Chip tone="emerald">Топ-15</Chip>}
        >
          <SynergyList pairs={best} tone="emerald" />
        </Panel>
        <Panel
          title="Анти-синергии"
          subtitle="Пары героев в одной команде с самым низким винрейтом"
          action={<Chip tone="crimson">Топ-15</Chip>}
        >
          <SynergyList pairs={worst} tone="crimson" />
        </Panel>
      </div>

      <Panel
        title="Синергия игроков"
        subtitle="Какие двое игроков чаще всего выигрывают в одной команде"
      >
        {stats.playerSynergies.length === 0 ? (
          <EmptyState message="Недостаточно данных" />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  <th className="stat-label py-2 pr-3">Пара</th>
                  <th className="stat-label py-2 pr-3 text-right">Матчей</th>
                  <th className="stat-label py-2 pr-3 text-right">Побед</th>
                  <th className="stat-label w-36 py-2 pr-3">Винрейт</th>
                </tr>
              </thead>
              <tbody>
                {stats.playerSynergies.slice(0, 12).map((pair) => (
                  <tr key={pair.key} className="border-b border-ink-800/70">
                    <td className="py-2 pr-3 text-parch-100">{pair.members.join(' + ')}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">{pair.games}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-400">
                      {pair.wins}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <WinRateBar value={pair.winRate} className="flex-1" />
                        <span className="w-12 text-right text-xs font-semibold tabular-nums text-parch-100">
                          {formatPct(pair.winRate)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SynergyList({
  pairs,
  tone,
}: {
  pairs: AppData['stats']['heroSynergies'];
  tone: 'emerald' | 'crimson';
}) {
  if (pairs.length === 0) {
    return <EmptyState message="Недостаточно данных" />;
  }
  return (
    <ul className="space-y-1.5">
      {pairs.map((pair) => (
        <li
          key={pair.key}
          className="flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2"
        >
          <span className="flex -space-x-2">
            {pair.members.map((member) => (
              <HeroAvatar
                key={member}
                name={member}
                size={26}
                rounded="rounded-md ring-2 ring-ink-900"
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-parch-100">
            {pair.members.join(' + ')}
          </span>
          <span className="shrink-0 text-xs text-parch-500">{pair.games} матчей</span>
          <span
            className={`w-12 shrink-0 text-right text-sm font-bold tabular-nums ${
              tone === 'emerald' ? 'text-emerald-400' : 'text-crimson-400'
            }`}
          >
            {formatPct(pair.winRate)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ========================================================================== */
/* Maps                                                                        */
/* ========================================================================== */

function MapStats({ stats }: { stats: AppData['stats'] }) {
  const favouriteMaps = useMemo(
    () =>
      stats.heroProfiles
        .filter((hero) => hero.favoriteMap && hero.games >= MIN_GAMES_FOR_TIER)
        .sort((a, b) => b.games - a.games)
        .slice(0, 12),
    [stats.heroProfiles],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Баланс полей боя"
        subtitle="Доля побед того, кто ходил первым — насколько поле уравновешено"
        action={<Chip tone="gold">{stats.maps.length} полей</Chip>}
      >
        {stats.maps.length === 0 ? (
          <EmptyState message="Нет данных о полях" />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  <th className="stat-label py-2 pr-3">#</th>
                  <th className="stat-label py-2 pr-3">Поле</th>
                  <th className="stat-label py-2 pr-3 text-right">Матчей</th>
                  <th className="stat-label py-2 pr-3 text-right">Винрейт</th>
                  <th className="stat-label py-2 pr-3 text-right">Первый ход</th>
                  <th className="stat-label py-2 pr-3">Баланс</th>
                </tr>
              </thead>
              <tbody>
                {stats.maps.map((map, index) => (
                  <tr key={map.name} className="border-b border-ink-800/70">
                    <td className="py-2 pr-3 text-xs text-parch-600">{index + 1}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2.5">
                        <MapArt
                          name={map.name}
                          image={map.image}
                          className="h-8 w-12 shrink-0"
                          rounded="rounded-md"
                        />
                        <span className="text-parch-100">{map.name}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                      {map.matches}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                      {formatPct(map.winRate)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                      {formatPct(map.firstTurnWinRate)}
                    </td>
                    <td className="py-2 pr-3">
                      <BalanceBar balance={map.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Любимые поля героев"
        subtitle="На каком поле каждый герой играет чаще всего"
      >
        {favouriteMaps.length === 0 ? (
          <EmptyState message="Нет данных" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {favouriteMaps.map((hero) => (
              <div
                key={hero.name}
                className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2"
              >
                <HeroAvatar name={hero.name} image={hero.image} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-parch-100">{hero.name}</p>
                  <p className="truncate text-xs text-parch-500">{hero.favoriteMap?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {hero.favoriteMap ? (
                    <MapArt
                      name={hero.favoriteMap.name}
                      image={hero.favoriteMap.image}
                      className="h-8 w-12 shrink-0"
                      rounded="rounded-md"
                    />
                  ) : null}
                  <span className="text-xs tabular-nums text-parch-400">
                    {hero.favoriteMap?.games}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ========================================================================== */
/* Small shared pieces                                                         */
/* ========================================================================== */

function HeroLink({ hero }: { hero: HeroProfile }) {
  return (
    <span className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/70 px-2 py-1.5">
      <HeroAvatar name={hero.name} image={hero.image} size={24} rounded="rounded-md" />
      <span className="min-w-0 flex-1 truncate text-xs text-parch-200">{hero.name}</span>
      <span className="shrink-0 text-xs font-bold tabular-nums text-parch-100">
        {formatPct(hero.winRate)}
      </span>
    </span>
  );
}

function OpponentChip({
  opponent,
}: {
  opponent: { name: string; image?: string | null; games: number; wins: number; winRate: number };
}) {
  return (
    <span className="flex items-center gap-2">
      <HeroAvatar name={opponent.name} image={opponent.image} size={24} rounded="rounded-md" />
      <span className="text-parch-200">{opponent.name}</span>
      <span className="text-xs text-parch-600">{opponent.games} матчей</span>
    </span>
  );
}

/**
 * Balance bar: centred at 50 %, growing towards whichever side is favoured.
 * A perfectly even battlefield shows an empty bar.
 */
function BalanceBar({ balance }: { balance: number }) {
  const percent = Math.min(50, Math.round(balance * 50));
  const leaningRight = balance >= 0;
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-2 w-28 overflow-hidden rounded-full bg-ink-800">
        <span className="absolute inset-y-0 left-1/2 w-px bg-parch-600" />
        <span
          className="absolute inset-y-0 rounded-full"
          style={{
            width: `${percent}%`,
            left: leaningRight ? '50%' : `${50 - percent}%`,
            background: GOLD,
          }}
        />
      </span>
      <span className="w-14 text-xs tabular-nums text-parch-400">
        {balance === 0 ? 'ровно' : `${Math.round(balance * 100)}% перекос`}
      </span>
    </span>
  );
}
