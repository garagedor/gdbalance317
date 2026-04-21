import { AdminLayout, StatCard, DemoBadge } from "@/components/admin/AdminLayout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { fmtMoney } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, HandCoins, PiggyBank, TrendingUp, Wallet } from "lucide-react";

// TODO: connect to backend — replace with company P&L aggregates
const PROFIT_BY_WEEK = [
  { week: "W14", profit: 8420 },
  { week: "W15", profit: 9210 },
  { week: "W16", profit: 7820 },
  { week: "W17", profit: 11240 },
  { week: "W18", profit: 9980 },
  { week: "W19", profit: 12410 },
];

const PROFIT_BY_PROVIDER = [
  { name: "GA-01", value: 14200 },
  { name: "FX-22", value: 9820 },
  { name: "OA-07", value: 6410 },
  { name: "SR-14", value: 3210 },
];

const PROFIT_BY_AREA = [
  { area: "North",  profit: 18420 },
  { area: "Center", profit: 14210 },
  { area: "South",  profit: 9820 },
];

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
];

export default function AdminCompany() {
  return (
    <AdminLayout
      title="Company"
      description="Profit & loss across providers, areas, and managers"
      actions={<DemoBadge />}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Gross Revenue" value={fmtMoney(91410)} hint="This month" icon={Banknote} trend={{ value: "+12.4%", positive: true }} />
        <StatCard label="Net Profit"    value={fmtMoney(28940)} hint="After costs"  icon={TrendingUp} trend={{ value: "+8.1%", positive: true }} />
        <StatCard label="Paid to Techs"     value={fmtMoney(34210)} icon={HandCoins} />
        <StatCard label="Paid to Providers" value={fmtMoney(13820)} icon={Wallet} />
        <StatCard label="Paid to Managers"  value={fmtMoney(4820)}  icon={PiggyBank} />
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date Range</label>
          <Input type="date" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Provider</label>
          <Select>
            <SelectTrigger><SelectValue placeholder="All providers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="ga01">GA-01</SelectItem>
              <SelectItem value="fx22">FX-22</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Area Manager</label>
          <Select>
            <SelectTrigger><SelectValue placeholder="All managers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All managers</SelectItem>
              <SelectItem value="yossi">Yossi Avraham</SelectItem>
              <SelectItem value="tamar">Tamar Sharon</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Technician</label>
          <Select>
            <SelectTrigger><SelectValue placeholder="All techs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All technicians</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Profit by Week" subtitle="Last 6 weeks">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={PROFIT_BY_WEEK}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Profit by Provider" subtitle="Distribution">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={PROFIT_BY_PROVIDER} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {PROFIT_BY_PROVIDER.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Profit by Area" subtitle="Regional breakdown" className="md:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={PROFIT_BY_AREA} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis type="category" dataKey="area" stroke="hsl(var(--muted-foreground))" fontSize={11} width={70} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="profit" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </AdminLayout>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm ${className ?? ""}`}>
      <div className="mb-3">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
