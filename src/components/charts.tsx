'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
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

const GOLD = 'var(--color-gold-400)';
const EMERALD = 'var(--color-emerald-400)';
const CRIMSON = 'var(--color-crimson-400)';
const AZURE = 'var(--color-azure-400)';
const VIOLET = 'var(--color-violet-400)';

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-xs shadow-xl">
      {label !== undefined ? <p className="mb-1 font-semibold text-parch-100">{label}</p> : null}
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2 text-parch-300">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-parch-500">{entry.name}:</span>
          <span className="font-semibold text-parch-100">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Matches per month with a cumulative-ish win/loss split. */
export function MatchesTimeline({
  data,
}: {
  data: Array<{ month: string; matches: number; wins: number; losses: number }>;
}) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-parch-500">Нет данных</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gWins" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EMERALD} stopOpacity={0.75} />
            <stop offset="100%" stopColor={EMERALD} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gMatches" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.6} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<DarkTooltip />} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: 'var(--color-parch-500)', paddingTop: 6 }}
        />
        <Area
          type="monotone"
          dataKey="matches"
          name="Матчей"
          stroke={GOLD}
          strokeWidth={2}
          fill="url(#gMatches)"
        />
        <Area
          type="monotone"
          dataKey="wins"
          name="Побед (игроков)"
          stroke={EMERALD}
          strokeWidth={2}
          fill="url(#gWins)"
        />
        <Line
          type="monotone"
          dataKey="losses"
          name="Поражений (игроков)"
          stroke={CRIMSON}
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
        />
      </AreaChart>
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
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <XAxis type="number" domain={[0, 1]} hide />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={132}
          tick={{ fontSize: 11, fill: 'var(--color-parch-300)' }}
        />
        <Tooltip
          content={<DarkTooltip />}
          formatter={(value, name) => [
            `${(Number(value) * 100).toFixed(1).replace('.', ',')}%`,
            name === 'winRate' ? 'Винрейт' : String(name),
          ]}
        />
        <Bar dataKey="winRate" name="winRate" radius={[0, 6, 6, 0]} barSize={18}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.winRate >= 0.6 ? EMERALD : entry.winRate >= 0.45 ? GOLD : CRIMSON}
              fillOpacity={0.85}
            />
          ))}
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
        <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(217,160,60,0.06)' }} />
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
