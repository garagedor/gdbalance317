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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtMoney, fmtPct, moneyClass } from "@/lib/format";
import { Building2, Crown, DollarSign, MapPin, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// TODO: connect to backend — replace with managers query + aggregates
const MOCK_MANAGERS = [
  { id: "1", name: "Yossi Avraham", region: "North",  techs: 5, rate: 0.10, weekly: 1842.50, openBalance: 612.40 },
  { id: "2", name: "Tamar Sharon",  region: "Center", techs: 4, rate: 0.08, weekly: 1320.00, openBalance: 0 },
  { id: "3", name: "Daniel Peretz", region: "South",  techs: 3, rate: 0.10, weekly: 982.30,  openBalance: 220.00 },
];

export default function AdminManagers() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = MOCK_MANAGERS.find((m) => m.id === selectedId);

  const totalRevenue = MOCK_MANAGERS.reduce((s, m) => s + m.weekly * 10, 0);
  const totalOpen = MOCK_MANAGERS.reduce((s, m) => s + m.openBalance, 0);
  const top = [...MOCK_MANAGERS].sort((a, b) => b.weekly - a.weekly)[0];

  return (
    <AdminLayout
      title="Area Managers"
      description="Regional managers, teams, and earnings"
      actions={<DemoBadge />}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active Managers" value={String(MOCK_MANAGERS.length)} hint="All regions" icon={Users} />
        <StatCard label="Managed Revenue" value={fmtMoney(totalRevenue)} hint="Weekly aggregated" icon={DollarSign} />
        <StatCard label="Open Balances" value={fmtMoney(totalOpen)} hint="Pending payouts" icon={Wallet} />
        <StatCard label="Top Region" value={top.region} hint={fmtMoney(top.weekly)} icon={Crown} />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-4">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">Managers</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Region</TableHead>
              <TableHead className="text-right">Technicians</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Weekly Earnings</TableHead>
              <TableHead className="text-right">Open Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_MANAGERS.map((m) => (
              <TableRow
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {m.region}
                  </span>
                </TableCell>
                <TableCell className="num text-right tabular-nums">{m.techs}</TableCell>
                <TableCell className="num text-right tabular-nums">{fmtPct(m.rate).replace("%", "")}%</TableCell>
                <TableCell className="num text-right tabular-nums">{fmtMoney(m.weekly)}</TableCell>
                <TableCell className={cn("num text-right font-semibold tabular-nums", moneyClass(m.openBalance))}>
                  {fmtMoney(m.openBalance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-xl">{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.region} region · {selected.techs} technicians · {fmtPct(selected.rate).replace("%", "")}% rate
                </SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="team" className="mt-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="team">Team</TabsTrigger>
                  <TabsTrigger value="earnings">Earnings</TabsTrigger>
                  <TabsTrigger value="reports">Reports</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
                </TabsList>
                <TabsContent value="team" className="mt-4 space-y-2">
                  {/* TODO: connect to backend — list of techs under this manager */}
                  {Array.from({ length: selected.techs }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">Technician {i + 1}</p>
                        <p className="text-xs text-muted-foreground">30% commission</p>
                      </div>
                      <span className="num text-sm font-semibold tabular-nums">{fmtMoney(2400 + i * 320)}</span>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="earnings" className="mt-4">
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    {/* TODO: connect — weekly earnings chart */}
                    Earnings breakdown chart
                  </div>
                </TabsContent>
                <TabsContent value="reports" className="mt-4">
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    {/* TODO: connect — reports list filtered by manager's techs */}
                    Recent reports list
                  </div>
                </TabsContent>
                <TabsContent value="payments" className="mt-4">
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    {/* TODO: connect — payment history to this manager */}
                    Payment history
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
