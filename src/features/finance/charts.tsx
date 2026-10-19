// Graphiques partagés (Recharts). Une seule échelle par graphique, marques fines,
// grille discrète, info-bulle au survol. Couleurs validées (contraste + daltonisme).
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatEuros } from '@/lib/money';

export const CHART = {
  primary: '#B66B50',
  grid: '#EDE3D8',
  axis: '#6E6A63',
  // Ordre fixe par scénario (validé : prudent, central, ambitieux)
  scenario: { prudent: '#1D7FB8', central: '#B66B50', ambitieux: '#7E8B2E' } as Record<string, string>,
};

const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
export function monthTick(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y!, (m ?? 1) - 1, 1);
  return `${monthShort.format(d).replace('.', '')}${m === 1 ? ` ${String(y).slice(2)}` : ''}`;
}

const euroAxis = (v: number) =>
  Math.abs(v) >= 100000 ? `${Math.round(v / 100000)} k€` : `${Math.round(v / 100)} €`;

function TooltipBox({ active, payload, label, format }: {
  active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-beige-300 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-anthracite">{label ? monthTickLong(label) : ''}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-anthracite-700">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name} : <span className="font-medium tabular-nums text-anthracite">{format(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

const monthLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
function monthTickLong(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return monthLong.format(new Date(y!, (m ?? 1) - 1, 1));
}

export function MonthlyBars({ data, dataKey, name, money = true, height = 220 }: {
  data: Record<string, number | string>[]; dataKey: string; name: string; money?: boolean; height?: number;
}) {
  const fmt = money ? (v: number) => formatEuros(v) : (v: number) => String(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="month" tickFormatter={monthTick} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={money ? euroAxis : undefined} allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={48} />
        <Tooltip cursor={{ fill: '#F8F4EF' }} content={<TooltipBox format={fmt} />} />
        <Bar dataKey={dataKey} name={name} fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyLine({ data, series, height = 220 }: {
  data: Record<string, number | string | null>[];
  series: { key: string; name: string; color: string; dashed?: boolean }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="month" tickFormatter={monthTick} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tickFormatter={euroAxis} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} width={52} />
        <Tooltip cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} content={<TooltipBox format={(v) => formatEuros(v)} />} />
        {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
