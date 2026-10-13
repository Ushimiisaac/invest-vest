"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
} from "recharts";
import { naira } from "@/lib/utils";

const AXIS = { fontSize: 11, fill: "currentColor" };

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-[var(--surface-raised)] px-3 py-2 text-[12px] shadow-[var(--shadow-float)]">
      {label != null ? <p className="mb-1 font-semibold">{String(label)}</p> : null}
      {payload.map((entry: any) => (
        <p key={entry.dataKey ?? entry.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: entry.color ?? entry.payload?.fill }} />
          <span className="muted">{entry.name}</span>
          <span className="tnum ml-auto font-semibold">{naira(Number(entry.value))}</span>
        </p>
      ))}
    </div>
  );
}

export function SavingsFlowChart({ data }: { data: { label: string; credited: number; debited: number }[] }) {
  return (
    <div className="h-[248px] w-full text-[var(--text-muted)]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="creditFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10a376" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#10a376" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="debitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0a91f" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#f0a91f" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(v) => `${Math.round(Number(v) / 100000)}k`} width={52} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          <Area type="monotone" dataKey="credited" name="Saved" stroke="#10a376" strokeWidth={2} fill="url(#creditFill)" />
          <Area type="monotone" dataKey="debited" name="Moved out" stroke="#f0a91f" strokeWidth={2} fill="url(#debitFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AllocationDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((a, b) => a + b.value, 0);
  if (!total) {
    return (
      <div className="flex h-[210px] items-center justify-center text-[13px] muted">
        No allocation to chart yet — fund a wallet or start a plan.
      </div>
    );
  }
  return (
    <div className="relative h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={filtered} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
            {filtered.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] uppercase tracking-wide muted">Total held</span>
        <span className="tnum text-[17px] font-bold">{naira(total, { compact: true })}</span>
      </div>
    </div>
  );
}

export function GrowthChart({ data }: { data: { label: string; balance: number; contributions: number }[] }) {
  return (
    <div className="h-[280px] w-full text-[var(--text-muted)]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -18, right: 10, top: 10 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={54} tickFormatter={(v) => `${Math.round(Number(v) / 100000)}k`} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          <Line type="monotone" dataKey="contributions" name="Your deposits" stroke="#8e9ab1" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="balance" name="Projected balance" stroke="#10a376" strokeWidth={2.6} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlanComparisonBars({ data }: { data: { name: string; earnings: number; finalBalance: number }[] }) {
  return (
    <div className="h-[260px] w-full text-[var(--text-muted)]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -18, right: 10, top: 10 }}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={AXIS} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS} width={54} tickFormatter={(v) => `${Math.round(Number(v) / 100000)}k`} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} />
          <Bar dataKey="finalBalance" name="Balance" fill="#10a376" radius={[6, 6, 0, 0]} />
          <Bar dataKey="earnings" name="Growth" fill="#fbbf3c" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
