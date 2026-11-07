'use client';

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPct } from './ui';

const GOLD = 'var(--color-gold-400)';
const EMERALD = 'var(--color-emerald-400)';
const CRIMSON = 'var(--color-crimson-400)';
const AZURE = 'var(--color-azure-400)';
const VIOLET = 'var(--color-violet-400)';

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

/**
 * Dark tooltip.
 *
 * NOTE: when a custom `content` element is supplied to <Tooltip>, Recharts
 * ignores the `formatter` prop entirely — the raw value would be rendered
 * (e.g. 0.8181 instead of 81,8 %). Formatting therefore happens inside this
 * component via the optional `format` callback.
 */
function DarkTooltip({
  active,
  payload,
  label,
  format,
  suffix,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format?: (value: number | string, name: string) => string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-xs shadow-xl">
      {label !== undefined ? <p className="mb-1 font-semibold text-parch-100">{label}</p> : null}
      {payload.map((entry, index) => {
        const raw = entry.value ?? '';
        const shown = format ? format(raw, entry.name ?? '') : String(raw);
        return (
          <p key={index} className="flex items-center gap-2 text-parch-300">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-parch-500">{entry.name}:</span>
            <span className="font-semibold text-parch-100">{shown}</span>
            {suffix ? <span className="text-parch-500">{suffix}</span> : null}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Matches per month, split by mode.
 *
 * Two lines only — "1 vs 1" and "2 vs 2" — in strongly contrasting colours
 * (azure vs gold) so the two series stay readable even on small screens.
 */
export function MatchesTimeline({
  data,
}: {
  data: Array<{ month: string; matches1v1: number; matches2v2: number }>;
}) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-parch-500">Нет данных</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <XAxis dataKey="month" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          content={<DarkTooltip format={(value, name) => `${value} ${name === '1 vs 1' ? 'матч. 1x1' : 'матч. 2x2'}`} />}
          cursor={{ stroke: 'rgba(217,160,60,0.25)' }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: 'var(--color-parch-500)', paddingTop: 6 }}
        />
        <Line
          type="monotone"
          dataKey="matches1v1"
          name="1 vs 1"
          stroke={AZURE}
          strokeWidth={2.5}
          dot={{ r: 2, fill: AZURE, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="matches2v2"
          name="2 vs 2"
          stroke={GOLD}
          strokeWidth={2.5}
          dot={{ r: 2, fill: GOLD, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 1v1 vs 2v2 split. */
export function ModeSplitChart({
  data,
}: {
  data: Array<{ mode: string; matches: number }>;
}) {
  const colors = [AZURE, VIOLET];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data.map((d) => ({ ...d, name: d.mode === '1v1' ? '1 vs 1' : '2 vs 2' }))}
          dataKey="matches"
          nameKey="name"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={3}
          stroke="var(--color-ink-900)"
          strokeWidth={3}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<DarkTooltip />} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: 'var(--color-parch-500)' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Tooltip for the win-rate ranking: percentage + number of games. */
function RankTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const games = Number(entry?.payload?.games ?? 0);
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-parch-100">
        {String(entry?.payload?.name ?? entry?.name ?? '')}
      </p>
      <p className="flex items-center gap-2 text-parch-300">
        <span className="text-parch-500">Винрейт:</span>
        <span className="font-semibold text-parch-100">
          {formatPct(Number(entry?.value ?? 0))}
        </span>
      </p>
      <p className="flex items-center gap-2 text-parch-300">
        <span className="text-parch-500">Матчей:</span>
        <span className="font-semibold text-parch-100">{games}</span>
      </p>
    </div>
  );
}

/** Horizontal win-rate ranking. */
export function WinRateRanking({
  data,
}: {
  data: Array<{ name: string; winRate: number; games: number }>;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-parch-500">Нет данных</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 34 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
        {/* The domain leaves room for the percentage label drawn at the end
            of each bar, so a 100 % bar is not clipped. */}
        <XAxis type="number" domain={[0, 1]} hide />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={132}
          tick={{ fontSize: 11, fill: 'var(--color-parch-300)' }}
        />
        <Tooltip cursor={{ fill: 'rgba(217,160,60,0.06)' }} content={<RankTooltip />} />
        <Bar dataKey="winRate" name="Винрейт" radius={[0, 6, 6, 0]} barSize={18}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.winRate >= 0.6 ? EMERALD : entry.winRate >= 0.45 ? GOLD : CRIMSON}
              fillOpacity={0.85}
            />
          ))}
          <LabelList
            dataKey="winRate"
            position="right"
            offset={8}
            fill="var(--color-parch-300)"
            fontSize={11}
            formatter={(label) => formatPct(Number(String(label)))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical bar chart, used for map popularity. */
export function VerticalBars({
  data,
  color = AZURE,
}: {
  data: Array<{ name: string; value: number }>;
  color?: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-parch-500">Нет данных</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 60 }}>
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          angle={-38}
          textAnchor="end"
          interval={0}
          height={70}
          tick={{ fontSize: 10, fill: 'var(--color-parch-500)' }}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          content={<DarkTooltip />}
          cursor={{ fill: 'rgba(217,160,60,0.06)' }}
        />
        <Bar dataKey="value" name="Матчей" radius={[6, 6, 0, 0]} fill={color} fillOpacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Sparkline-style line for a player's recent form. */
export function TrendLine({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} hide />
        <YAxis hide domain={[0, 1]} />
        <Tooltip content={<DarkTooltip />} />
        <Line type="monotone" dataKey="value" stroke={GOLD} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
