import { useState } from "react";
import { AdminLayout, StatCard, DemoBadge } from "@/components/admin/AdminLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { fmtMoney, fmtPct, moneyClass } from "@/lib/format";
import {
  Award,
  DollarSign,
  Eye,
  MoreHorizontal,
  Percent,
  Search,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// TODO: connect to backend — replace with useTechnicians + weekly aggregate query
const MOCK_TECHS = [
  { id: "1", name: "David Cohen",   commission: 0.35, manager: "Yossi Avraham",  sales: 8612.43,  balance: 1188.81,  status: "active" },
  { id: "2", name: "Roni Levi",     commission: 0.30, manager: "Yossi Avraham",  sales: 6240.00,  balance: -245.10,  status: "active" },
  { id: "3", name: "Eli Mizrahi",   commission: 0.32, manager: "Tamar Sharon",   sales: 5980.20,  balance: 612.50,   status: "active" },
  { id: "4", name: "Mark Stein",    commission: 0.30, manager: "Tamar Sharon",   sales: 4221.00,  balance: 0,        status: "pending" },
  { id: "5", name: "Avi Bar",       commission: 0.28, manager: "Yossi Avraham",  sales: 3120.75,  balance: 320.00,   status: "active" },
  { id: "6", name: "Noa Kaplan",    commission: 0.30, manager: "Tamar Sharon",   sales: 0,        balance: 0,        status: "inactive" },
];

const statusStyles: Record<string, string> = {
  active: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  pending: "bg-warning/15 text-warning",
  inactive: "bg-muted text-muted-foreground",
};

export default function AdminTechnicians() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_TECHS.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.manager.toLowerCase().includes(search.toLowerCase()),
  );

  const active = MOCK_TECHS.filter((t) => t.status === "active").length;
  const totalBalance = MOCK_TECHS.reduce((s, t) => s + t.balance, 0);
  const totalSales = MOCK_TECHS.reduce((s, t) => s + t.sales, 0);
  const avgRevenue = totalSales / Math.max(1, active);
  const top = [...MOCK_TECHS].sort((a, b) => b.sales - a.sales)[0];

  return (
    <AdminLayout
      title="Technicians"
      description="Manage technicians, commission rates, and assignments"
      actions={<DemoBadge />}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active Technicians" value={String(active)} hint={`${MOCK_TECHS.length} total`} icon={UserCheck} />
        <StatCard label="Weekly Balances" value={fmtMoney(totalBalance)} hint="Open across all techs" icon={DollarSign} />
        <StatCard label="Top Performer" value={top.name.split(" ")[0]} hint={fmtMoney(top.sales)} icon={Award} />
        <StatCard label="Avg Revenue / Tech" value={fmtMoney(avgRevenue)} hint="This week" icon={TrendingUp} />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-display text-base font-semibold">All Technicians</h2>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search technicians..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Area Manager</TableHead>
              <TableHead className="text-right">Week Sales</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} className="cursor-pointer">
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                    <Percent className="h-3 w-3 text-muted-foreground" />
                    {fmtPct(t.commission).replace("%", "")}%
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{t.manager}</TableCell>
                <TableCell className="num text-right tabular-nums">{fmtMoney(t.sales)}</TableCell>
                <TableCell className={cn("num text-right font-semibold tabular-nums", moneyClass(t.balance))}>
                  {fmtMoney(t.balance)}
                </TableCell>
                <TableCell>
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", statusStyles[t.status])}>
                    {t.status}
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Percent className="mr-2 h-4 w-4" /> Edit %
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Users className="mr-2 h-4 w-4" /> Reassign Manager
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Eye className="mr-2 h-4 w-4" /> View Reports
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}
