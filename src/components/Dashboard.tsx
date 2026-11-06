'use client';

import { useMemo, useState } from 'react';
import { MatchesTimeline, ModeSplitChart, VerticalBars, WinRateRanking } from './charts';
import { EntityTable } from './EntityTable';
import { Avatar, Chip, EmptyState, Panel, StatCard, WinRateBar, formatDate, formatPct } from './ui';
import type { AppData, PairSynergy } from '@/lib/types';

type Tab = 'overview' | 'players' | 'heroes' | 'pairs' | 'maps';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'players', label: 'Игроки' },
  { id: 'heroes', label: 'Герои' },
  { id: 'pairs', label: 'Пары · 2 vs 2' },
  { id: 'maps', label: 'Поля боя' },
];

export function Dashboard({ data }: { data: AppData }) {
  const [tab, setTab] = useState<Tab>('overview');
  const { stats, reference, meta } = data;

  const sourceLabel =
    meta.source === 'api'
      ? 'Sheets API'
      : meta.source === 'public'
        ? 'Публичный CSV'
        : 'Демо-снимок';

  return (
    <div className="space-y-6">
      <DashboardHeader
        meta={meta}
        sourceLabel={sourceLabel}
        stats={stats}
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900/60 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            className="tab-btn flex-1"
            data-active={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <Overview data={data} /> : null}
      {tab === 'players' ? (
        <Panel title="Игроки" subtitle="Сортировка по количеству игр · клик по строке открывает подробности">
          <EntityTable records={stats.players} kind="player" emptyMessage="Нет данных об игроках" />
        </Panel>
      ) : null}
      {tab === 'heroes' ? (
        <Panel title="Герои" subtitle={`Всего в базе: ${reference.heroes.length}`}>
          <EntityTable records={stats.heroes} kind="hero" emptyMessage="Нет данных о героях" />
        </Panel>
      ) : null}
      {tab === 'pairs' ? <PairsPanel data={data} /> : null}
      {tab === 'maps' ? <MapsPanel data={data} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DashboardHeader({
  meta,
  sourceLabel,
  stats,
}: {
  meta: AppData['meta'];
  sourceLabel: string;
  stats: AppData['stats'];
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-parch-100 sm:text-3xl">
          Статистика матчей <span className="text-gold-500">Unmatched</span>
        </h1>
        <p className="mt-1 text-sm text-parch-500">
          {stats.totals.validMatches} матчей учтено
          {stats.totals.firstMatch
            ? ` · период ${formatDate(stats.totals.firstMatch)} — ${formatDate(stats.totals.lastMatch)}`
            : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={meta.canWrite ? 'emerald' : 'gold'}>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: 'currentColor' }}
          />
          {sourceLabel}
        </Chip>
        <Chip tone={meta.canWrite ? 'azure' : 'crimson'}>
          {meta.canWrite ? '● Запись включена' : '○ Только чтение'}
        </Chip>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Overview({ data }: { data: AppData }) {
  const { stats } = data;

  const mapChartData = useMemo(
    () => stats.maps.slice(0, 12).map((m) => ({ name: m.name, value: m.matches })),
    [stats.maps],
  );

  const bestHeroPair = stats.bestHeroSynergy[0] ?? null;
  const bestPlayerPair = stats.bestPlayerSynergy[0] ?? null;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Всего матчей"
          value={stats.totals.validMatches}
          sub={`${stats.totals.modes['1v1']} × 1v1 · ${stats.totals.modes['2v2']} × 2v2`}
          accent="gold"
        />
        <StatCard
          label="Сыграно партий"
          value={stats.totals.wins + stats.totals.losses}
          sub="матчей × игроков"
          accent="azure"
        />
        <StatCard
          label="Общий винрейт"
          value={formatPct(stats.totals.winRate)}
          sub={`${stats.totals.wins} побед · ${stats.totals.losses} поражений`}
          accent={stats.totals.winRate >= 0.5 ? 'emerald' : 'crimson'}
        />
        <StatCard
          label="Самый частый герой"
          value={stats.mostPlayedHero?.name ?? '—'}
          sub={
            stats.mostPlayedHero
              ? `${stats.mostPlayedHero.games} игр · WR ${formatPct(stats.mostPlayedHero.winRate)}`
              : undefined
          }
          accent="violet"
        />
        <StatCard
          label="Популярное поле"
          value={stats.mostPopularMap?.name ?? '—'}
          sub={stats.mostPopularMap ? `${stats.mostPopularMap.games} матчей` : undefined}
          accent="azure"
        />
        <StatCard
          label="Уникальных героев"
          value={data.reference.heroes.length}
          sub={`${data.reference.players.length} игроков в базе`}
          accent="gold"
        />
      </div>

      {/* Best pair callouts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SynergyCallout
          title="Лучшая синергия героев · 2 vs 2"
          pair={bestHeroPair}
          kind="hero"
          heroNames={data.reference.heroes.map((h) => h.name)}
          heroImages={Object.fromEntries(data.reference.heroes.map((h) => [h.name, h.image ?? null]))}
        />
        <SynergyCallout
          title="Лучшая синергия игроков · 2 vs 2"
          pair={bestPlayerPair}
          kind="player"
          heroNames={data.reference.players.map((p) => p.name)}
          heroImages={Object.fromEntries(data.reference.players.map((p) => [p.name, p.image ?? null]))}
        />
      </div>

      {/* Timeline + mode split */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Активность по месяцам"
          subtitle="Количество матчей и разбивка побед/поражений игроков"
          className="xl:col-span-2"
        >
          <MatchesTimeline data={stats.timeline} />
        </Panel>
        <Panel title="Режимы игры" subtitle="1 vs 1 против 2 vs 2">
          <ModeSplitChart data={stats.modeSplit} />
        </Panel>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Топ героев по винрейту"
          subtitle="Минимум 3 матча на героя"
          action={<Chip tone="gold">Топ-10</Chip>}
        >
          <WinRateRanking
            data={stats.heroLeaders.map((h) => ({
              name: h.name,
              winRate: h.winRate,
              games: h.games,
            }))}
          />
        </Panel>
        <Panel
          title="Топ игроков по винрейту"
          subtitle="Минимум 3 матча на игрока"
          action={<Chip tone="gold">Топ-10</Chip>}
        >
          <WinRateRanking
            data={stats.playerLeaders.map((p) => ({
              name: p.name,
              winRate: p.winRate,
              games: p.games,
            }))}
          />
        </Panel>
      </div>

      {/* Map popularity + recent matches */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Самые популярные поля" subtitle="Топ-12 по числу матчей" className="xl:col-span-2">
          <VerticalBars data={mapChartData} />
        </Panel>
        <Panel title="Последние матчи" subtitle="По дате записи">
          <RecentMatches data={data} />
        </Panel>
      </div>

      <DataQualityPanel data={data} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Surfaces the rows that could not be counted, so the table can be cleaned up
 * instead of silently losing games.
 */
function DataQualityPanel({ data }: { data: AppData }) {
  const { stats } = data;
  const hasIssues = stats.rejectedRows.length > 0 || stats.degenerateRows > 0;
  if (!hasIssues) return null;

  return (
    <Panel
      title="Качество данных"
      subtitle="Строки в таблице, которые обработаны особым образом"
      action={<Chip tone="gold">К гигиене таблицы</Chip>}
    >
      <div className="space-y-4 text-sm">
        {stats.rejectedRows.length > 0 ? (
          <div>
            <p className="stat-label mb-2">
              Исключено из статистики — {stats.rejectedRows.length}
            </p>
            <ul className="space-y-1.5">
              {stats.rejectedRows.map((row) => (
                <li
                  key={row.rowNumber}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-crimson-600/30 bg-crimson-600/8 px-3 py-2"
                >
                  <span className="chip border border-ink-600 bg-ink-800 text-parch-400">
                    строка {row.rowNumber}
                  </span>
                  <span className="text-xs text-parch-300">{row.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {stats.degenerateRows > 0 ? (
          <div className="rounded-lg border border-gold-600/30 bg-gold-500/8 px-3 py-2.5">
            <p className="stat-label mb-1">
              Один игрок в двух местах команды — {stats.degenerateRows}
            </p>
            <p className="text-xs text-parch-400">
              В этих строках один и тот же игрок указан дважды в одной команде. Матч учтён, но
              игрок засчитан один раз, чтобы не завышать его количество игр и винрейт. Такие пары
              исключены из таблицы синергий.
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function SynergyCallout({
  title,
  pair,
  kind,
  heroNames,
  heroImages,
}: {
  title: string;
  pair: PairSynergy | null;
  kind: 'hero' | 'player';
  heroNames: string[];
  heroImages: Record<string, string | null>;
}) {
  return (
    <Panel title={title} subtitle="Пара с лучшим винрейтом (минимум 3 матча)">
      {!pair ? (
        <EmptyState message="Недостаточно данных для расчёта синергий" />
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            {pair.members.map((name) => (
              <Avatar
                key={name}
                name={name}
                image={heroImages[name] ?? null}
                size={54}
                rounded="rounded-xl ring-2 ring-ink-850"
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-parch-100">
              {pair.members.join('  +  ')}
            </p>
            <p className="mt-0.5 text-xs text-parch-500">
              {pair.games} совместных матчей · {pair.wins} побед
            </p>
            <div className="mt-2 flex items-center gap-2">
              <WinRateBar value={pair.winRate} className="flex-1" />
              <span className="text-sm font-bold text-gold-400">{formatPct(pair.winRate)}</span>
            </div>
          </div>
        </div>
      )}
      {kind === 'hero' ? null : null}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function PairsPanel({ data }: { data: AppData }) {
  const { stats } = data;
  const heroImages = Object.fromEntries(data.reference.heroes.map((h) => [h.name, h.image ?? null]));
  const playerImages = Object.fromEntries(data.reference.players.map((p) => [p.name, p.image ?? null]));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel
        title="Синергия героев · 2 vs 2"
        subtitle="Обе играли в одной команде. WR считается по матчам пары"
      >
        <SynergyTable pairs={stats.bestHeroSynergy} images={heroImages} />
      </Panel>
      <Panel
        title="Синергия игроков · 2 vs 2"
        subtitle="Оба игрока были в одной команде"
      >
        <SynergyTable pairs={stats.bestPlayerSynergy} images={playerImages} />
      </Panel>

      <Panel
        title="Любимые связки игрок + герой"
        subtitle="Самые частые сочетания за всю историю"
        className="xl:col-span-2"
      >
        {stats.favouriteCombos.length === 0 ? (
          <EmptyState message="Нет данных" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stats.favouriteCombos.map((combo) => (
              <div
                key={`${combo.player}|${combo.hero}`}
                className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2"
              >
                <Avatar name={combo.player} image={playerImages[combo.player] ?? null} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm text-parch-100">{combo.player}</span>
                <span className="text-parch-600">›</span>
                <Avatar name={combo.hero} image={heroImages[combo.hero] ?? null} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm text-parch-300">{combo.hero}</span>
                <Chip tone={combo.winRate >= 0.5 ? 'emerald' : 'crimson'}>
                  {combo.games} · {formatPct(combo.winRate, 0)}
                </Chip>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Очные противостояния"
        subtitle="Кто кого чаще обыгрывал"
        className="xl:col-span-2"
      >
        {stats.headToHead.length === 0 ? (
          <EmptyState message="Нет данных" />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  <th className="stat-label py-2 pr-3">Соперники</th>
                  <th className="stat-label py-2 pr-3 text-right">Матчей</th>
                  <th className="stat-label py-2 pr-3 text-right">Баланс</th>
                </tr>
              </thead>
              <tbody>
                {stats.headToHead.map((h) => (
                  <tr key={`${h.a}|${h.b}`} className="border-b border-ink-800/70">
                    <td className="py-2 pr-3 text-parch-100">
                      {h.a} <span className="text-parch-600">vs</span> {h.b}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">{h.games}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <span className="text-emerald-400">{h.winsA}</span>
                      <span className="text-parch-600"> : </span>
                      <span className="text-crimson-400">{h.winsB}</span>
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

function SynergyTable({
  pairs,
  images,
}: {
  pairs: PairSynergy[];
  images: Record<string, string | null>;
}) {
  if (pairs.length === 0) {
    return <EmptyState message="Недостаточно данных для расчёта синергий" />;
  }
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-700 text-left">
            <th className="stat-label py-2 pr-3">#</th>
            <th className="stat-label py-2 pr-3">Пара</th>
            <th className="stat-label py-2 pr-3 text-right">Матчей</th>
            <th className="stat-label py-2 pr-3 text-right">Побед</th>
            <th className="stat-label w-36 py-2 pr-3">WR</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, index) => (
            <tr key={pair.key} className="border-b border-ink-800/70">
              <td className="py-2 pr-3 text-xs text-parch-600">{index + 1}</td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <span className="flex -space-x-2">
                    {pair.members.map((name) => (
                      <Avatar
                        key={name}
                        name={name}
                        image={images[name] ?? null}
                        size={24}
                        rounded="rounded-md ring-2 ring-ink-850"
                      />
                    ))}
                  </span>
                  <span className="text-parch-100">{pair.members.join(' + ')}</span>
                </div>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-parch-300">{pair.games}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-emerald-400">{pair.wins}</td>
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
  );
}

/* -------------------------------------------------------------------------- */

function MapsPanel({ data }: { data: AppData }) {
  const counts = data.stats.maps;
  const totalWithMap = counts.reduce((sum, c) => sum + c.matches, 0);
  const totalMatches = data.matches.filter((m) => m.valid).length;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel
        title="Рейтинг полей боя"
        subtitle={`${totalWithMap} из ${totalMatches} матчей имеют записанное поле`}
        className="xl:col-span-2"
      >
        {counts.length === 0 ? (
          <EmptyState message="Ни в одном матче не указано поле боя" />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  <th className="stat-label py-2 pr-3">#</th>
                  <th className="stat-label py-2 pr-3">Поле</th>
                  <th className="stat-label py-2 pr-3 text-right">Матчей</th>
                  <th className="stat-label py-2 pr-3 text-right">Доля</th>
                  <th className="stat-label py-2 pr-3 text-right">WR полей</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((entry, index) => (
                  <tr key={entry.name} className="border-b border-ink-800/70">
                    <td className="py-2 pr-3 text-xs text-parch-600">{index + 1}</td>
                    <td className="py-2 pr-3 text-parch-100">{entry.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                      {entry.matches}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-500">
                      {totalMatches > 0
                        ? formatPct(entry.matches / totalMatches, 0)
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                      {entry.games > 0 ? formatPct(entry.wins / entry.games) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Популярность" subtitle="Топ-12 полей по числу матчей">
        <VerticalBars
          data={counts.slice(0, 12).map((c) => ({ name: c.name, value: c.matches }))}
        />
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RecentMatches({ data }: { data: AppData }) {
  const recent = useMemo(() => {
    return [...data.matches]
      .filter((m) => m.valid)
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) return b.timestamp.localeCompare(a.timestamp);
        if (a.timestamp) return -1;
        if (b.timestamp) return 1;
        return b.rowNumber - a.rowNumber;
      })
      .slice(0, 12);
  }, [data.matches]);

  if (recent.length === 0) return <EmptyState message="Нет матчей" />;

  return (
    <ul className="space-y-1.5">
      {recent.map((match) => (
        <li
          key={match.id}
          className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <Chip tone={match.mode === '1v1' ? 'azure' : 'violet'}>
              {match.mode === '1v1' ? '1 vs 1' : '2 vs 2'}
            </Chip>
            <span className="text-parch-600">{formatDate(match.timestamp)}</span>
          </div>
          <p className="mt-1.5 text-parch-300">
            {match.mode === '1v1'
              ? `${match.players[0]} (${match.heroes[0]})  vs  ${match.players[1]} (${match.heroes[1]})`
              : `${match.team1Players.join(' + ')}  vs  ${match.team2Players.join(' + ')}`}
          </p>
          {match.map ? <p className="mt-0.5 text-parch-600">📍 {match.map}</p> : null}
        </li>
      ))}
    </ul>
  );
}
