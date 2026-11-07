'use client';

import { useMemo, useState } from 'react';
import { MatchesTimeline, ModeSplitChart, VerticalBars, WinRateRanking } from './charts';
import { EntityTable } from './EntityTable';
import {
  Avatar,
  Chip,
  EmptyState,
  MiniStat,
  Panel,
  SplitBar,
  StatCard,
  Switch,
  WinRateBar,
  formatDate,
  formatPct,
} from './ui';
import { isHomebrew } from '@/lib/normalize';
import {
  MIN_GAMES_FOR_HERO_RATE,
  MIN_GAMES_FOR_PLAYER_RATE,
  computeStats,
} from '@/lib/stats';
import { UNSPECIFIED_MAP, type AppData, type PairSynergy } from '@/lib/types';

type Tab = 'overview' | 'players' | 'heroes' | 'pairs' | 'maps';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'players', label: 'Игроки' },
  { id: 'heroes', label: 'Герои' },
  { id: 'pairs', label: 'Пары · 2 vs 2' },
  { id: 'maps', label: 'Поля боя' },
];

const AZURE = 'var(--color-azure-400)';
const VIOLET = 'var(--color-violet-400)';

export function Dashboard({ data }: { data: AppData }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [hideFan, setHideFan] = useState(false);
  const { reference, meta } = data;

  /**
   * The statistics engine is a pure function, so hiding homebrew characters
   * simply recomputes them in the browser — every hero-derived widget updates
   * immediately, without a round trip to the server.
   */
  const stats = useMemo(() => {
    if (!hideFan) return data.stats;
    return computeStats(data.matches, data.reference, {
      excludeHeroes: (hero) => isHomebrew(hero),
      rejectedRows: data.stats.rejectedRows,
    });
  }, [hideFan, data]);

  const fanCount = useMemo(
    () => data.reference.heroes.filter((h) => h.homebrew).length,
    [data.reference.heroes],
  );

  const sourceLabel =
    meta.source === 'api'
      ? 'Google Sheets API'
      : meta.source === 'public'
        ? 'Публичный CSV'
        : 'Демо-снимок';

  return (
    <div className="space-y-6">
      <DashboardHeader
        meta={meta}
        sourceLabel={sourceLabel}
        stats={stats}
        hideFan={hideFan}
        onToggleFan={() => setHideFan((v) => !v)}
        fanCount={fanCount}
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

      {tab === 'overview' ? <Overview data={data} stats={stats} /> : null}
      {tab === 'players' ? (
        <Panel
          title="Игроки"
          subtitle="Сортировка по количеству игр · клик по строке открывает подробности"
        >
          <EntityTable
            records={stats.players}
            kind="player"
            emptyMessage="Нет данных об игроках"
          />
        </Panel>
      ) : null}
      {tab === 'heroes' ? (
        <Panel
          title="Герои"
          subtitle={`Всего в базе: ${reference.heroes.length} · фан-персонажей: ${fanCount}`}
        >
          <EntityTable
            records={stats.heroes}
            kind="hero"
            layout="split"
            emptyMessage={
              hideFan
                ? 'Фан-персонажи скрыты — в базе не осталось героев'
                : 'Нет данных о героях'
            }
          />
        </Panel>
      ) : null}
      {tab === 'pairs' ? <PairsPanel data={data} stats={stats} /> : null}
      {tab === 'maps' ? <MapsPanel data={data} stats={stats} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DashboardHeader({
  meta,
  sourceLabel,
  stats,
  hideFan,
  onToggleFan,
  fanCount,
}: {
  meta: AppData['meta'];
  sourceLabel: string;
  stats: AppData['stats'];
  hideFan: boolean;
  onToggleFan: () => void;
  fanCount: number;
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
        <Switch
          checked={hideFan}
          onChange={onToggleFan}
          label="Скрыть фан-героев"
          description={`Скрыть ${fanCount} фан-персонажей из статистики героев`}
        />
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

function Overview({ data, stats }: { data: AppData; stats: AppData['stats'] }) {
  const mapChartData = useMemo(
    () => stats.maps.slice(0, 12).map((m) => ({ name: m.name, value: m.matches })),
    [stats.maps],
  );

  const bestHeroPair = stats.bestHeroSynergy[0] ?? null;
  const bestPlayerPair = stats.bestPlayerSynergy[0] ?? null;

  // "Самый активный игрок" — most games played.
  const mostActive = stats.players[0] ?? null;
  // "Лучший игрок по винрейту" — the win-rate leaderboard already applies the
  // minimum-games threshold.
  const bestPlayer = stats.playerLeaders[0] ?? null;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {/* Total matches, split by mode */}
        <StatCard
          label="Всего матчей"
          value={stats.totals.validMatches}
          accent="gold"
        >
          <div className="mt-2">
            <SplitBar
              segments={[
                { label: '1 vs 1', value: stats.totals.modes['1v1'], color: AZURE },
                { label: '2 vs 2', value: stats.totals.modes['2v2'], color: VIOLET },
              ]}
            />
          </div>
        </StatCard>

        <StatCard
          label="Сыграно партий"
          value={stats.totals.wins + stats.totals.losses}
          sub="матчей × игроков"
          accent="azure"
        />

        {/* Replaces the old "общий винрейт" card, which was always ~50 %. */}
        <StatCard
          label="Самый активный игрок"
          value={mostActive?.name ?? '—'}
          sub={mostActive ? `${mostActive.games} матчей · винрейт ${formatPct(mostActive.winRate)}` : undefined}
          accent="violet"
        />

        <StatCard
          label="Лучший игрок по винрейту"
          value={bestPlayer?.name ?? '—'}
          sub={
            bestPlayer
              ? `винрейт ${formatPct(bestPlayer.winRate)} · ${bestPlayer.games} матчей`
              : undefined
          }
          accent="emerald"
        />

        <StatCard
          label="Самый частый герой"
          value={stats.mostPlayedHero?.name ?? '—'}
          sub={
            stats.mostPlayedHero
              ? `${stats.mostPlayedHero.games} игр · винрейт ${formatPct(stats.mostPlayedHero.winRate)}`
              : undefined
          }
          accent="violet"
        />

        <StatCard
          label="Самое популярное поле"
          value={stats.mostPopularMap?.name ?? '—'}
          sub={stats.mostPopularMap ? `${stats.mostPopularMap.games} матчей` : undefined}
          accent="azure"
        />

        {/* Total / official / fan breakdown — spans two columns so the
            seven KPI cards fill the four-column grid evenly. */}
        <StatCard
          label="Уникальных героев"
          value={stats.heroBreakdown.total}
          accent="gold"
          className="xl:col-span-2"
        >
          <div className="mt-2 space-y-1">
            <MiniStat label="Официальные" value={stats.heroBreakdown.official} />
            <MiniStat
              label="Фан-персонажи"
              value={stats.heroBreakdown.homebrew}
              tone="text-violet-400"
              hint="Персонажи с пометкой «(фан)»"
            />
          </div>
        </StatCard>
      </div>

      {stats.totals.dualControlMatches > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/35 bg-violet-500/8 px-4 py-3">
          <Chip tone="violet">1 игрок · 2 героя</Chip>
          <p className="text-xs text-parch-400">
            В <b className="text-violet-400">{stats.totals.dualControlMatches}</b> матчах один
            игрок вёл сразу двух героев против двух соперников. Такой матч засчитывается игроку
            один раз, а оба героя засчитываются за него.
          </p>
        </div>
      ) : null}

      {/* Best pair callouts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SynergyCallout
          title="Лучшая синергия героев · 2 vs 2"
          pair={bestHeroPair}
          images={Object.fromEntries(
            data.reference.heroes.map((h) => [h.name, h.image ?? null]),
          )}
        />
        <SynergyCallout
          title="Лучшая синергия игроков · 2 vs 2"
          pair={bestPlayerPair}
          images={Object.fromEntries(
            data.reference.players.map((p) => [p.name, p.image ?? null]),
          )}
        />
      </div>

      {/* Timeline + mode split */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Активность по месяцам"
          subtitle="Сколько матчей сыграно в 1 vs 1 и в 2 vs 2"
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
          subtitle={`Минимум ${MIN_GAMES_FOR_HERO_RATE} матчей на героя`}
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
          subtitle={`Минимум ${MIN_GAMES_FOR_PLAYER_RATE} матчей на игрока`}
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
        <Panel
          title="Самые популярные поля"
          subtitle="Топ-12 по числу матчей"
          className="xl:col-span-2"
        >
          <VerticalBars data={mapChartData} />
        </Panel>
        <Panel title="Последние матчи" subtitle="По дате записи">
          <RecentMatches data={data} />
        </Panel>
      </div>

      <DataQualityPanel stats={stats} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SynergyCallout({
  title,
  pair,
  images,
}: {
  title: string;
  pair: PairSynergy | null;
  images: Record<string, string | null>;
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
                image={images[name] ?? null}
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
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function PairsPanel({ data, stats }: { data: AppData; stats: AppData['stats'] }) {
  const heroImages = Object.fromEntries(data.reference.heroes.map((h) => [h.name, h.image ?? null]));
  const playerImages = Object.fromEntries(data.reference.players.map((p) => [p.name, p.image ?? null]));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel
        title="Синергия героев · 2 vs 2"
        subtitle="Обе играли в одной команде. Винрейт считается по матчам пары"
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
                      {h.a} <span className="text-parch-600">против</span> {h.b}
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
            <th className="stat-label w-36 py-2 pr-3">Винрейт</th>
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

function MapsPanel({ data, stats }: { data: AppData; stats: AppData['stats'] }) {
  const counts = stats.maps;
  const totalWithMap = counts.reduce((sum, c) => sum + c.matches, 0);
  const totalMatches = data.matches.filter((m) => m.valid).length;
  const unmapped = stats.totals.unmappedMatches;

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
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left">
                  <th className="stat-label py-2 pr-3">#</th>
                  <th className="stat-label py-2 pr-3">Поле</th>
                  <th className="stat-label py-2 pr-3 text-right">Матчей</th>
                  <th className="stat-label py-2 pr-3 text-right">Доля</th>
                  <th className="stat-label py-2 pr-3 text-right">Винрейт</th>
                  <th className="stat-label py-2 pr-3">Топ-герой</th>
                  <th className="stat-label py-2 pr-3">Топ-победитель</th>
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
                      {totalMatches > 0 ? formatPct(entry.matches / totalMatches, 0) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-parch-300">
                      {entry.games > 0 ? formatPct(entry.winRate) : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {entry.topHero ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={entry.topHero.name} size={22} />
                          <span className="text-xs text-parch-300">{entry.topHero.name}</span>
                          <span className="text-xs text-parch-600">{entry.topHero.games}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-parch-600">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {entry.topPlayer ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={entry.topPlayer.name} size={22} />
                          <span className="text-xs text-parch-300">{entry.topPlayer.name}</span>
                          <span className="text-xs text-parch-600">
                            {entry.topPlayer.wins}/{entry.topPlayer.games}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-parch-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="space-y-4">
        <Panel title="Популярность" subtitle="Топ-12 полей по числу матчей">
          <VerticalBars
            data={counts.slice(0, 12).map((c) => ({ name: c.name, value: c.matches }))}
          />
        </Panel>

        {unmapped > 0 ? (
          <Panel title="Без поля боя" subtitle="Матчи, где поле не было записано">
            <p className="text-sm text-parch-300">
              <b className="text-gold-400">{unmapped}</b> матчей были записаны без выбора поля
              боя. Они учтены в общей статистике, игроках, героях и активности, но{' '}
              <b>исключены</b> из рейтинга полей и графика популярности — иначе пустая категория
              опережала бы каждое реальное поле.
            </p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Surfaces the rows that could not be counted, so the table can be cleaned up
 * instead of silently losing games.
 */
function DataQualityPanel({ stats }: { stats: AppData['stats'] }) {
  const hasIssues = stats.rejectedRows.length > 0;
  if (!hasIssues) return null;

  return (
    <Panel
      title="Качество данных"
      subtitle="Строки в таблице, которые обработаны особым образом"
      action={<Chip tone="gold">К гигиене таблицы</Chip>}
    >
      <div className="space-y-4 text-sm">
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
      </div>
    </Panel>
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
            <div className="flex items-center gap-1.5">
              <Chip tone={match.mode === '1v1' ? 'azure' : 'violet'}>
                {match.mode === '1v1' ? '1 vs 1' : '2 vs 2'}
              </Chip>
              {match.dualControl.length > 0 ? (
                <Chip tone="violet">1 игрок · 2 героя</Chip>
              ) : null}
            </div>
            <span className="text-parch-600">{formatDate(match.timestamp)}</span>
          </div>
          <p className="mt-1.5 text-parch-300">
            {match.mode === '1v1'
              ? `${match.players[0]} (${match.heroes[0]})  против  ${match.players[1]} (${match.heroes[1]})`
              : `${match.team1Players.join(' + ')}  против  ${match.team2Players.join(' + ')}`}
          </p>
          <p className="mt-0.5 text-parch-600">
            📍 {match.map ?? UNSPECIFIED_MAP}
          </p>
        </li>
      ))}
    </ul>
  );
}
