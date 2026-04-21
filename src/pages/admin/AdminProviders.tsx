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
import { Building2, Crown, DollarSign, Network, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// TODO: connect to backend — providers table not yet defined
const MOCK_PROVIDERS = [
  { id: "p1", code: "GA-01", name: "GarageAds Network",   rate: 0.18, jobs: 142, revenue: 38420.50, balance: 1240.00 },
  { id: "p2", code: "FX-22", name: "Fixly Direct",        rate: 0.15, jobs: 98,  revenue: 24180.00, balance: 0 },
  { id: "p3", code: "OA-07", name: "Open-Door Alliance",  rate: 0.20, jobs: 67,  revenue: 18920.30, balance: 620.10 },
  { id: "p4", code: "SR-14", name: "ServicePro Referrals",rate: 0.12, jobs: 41,  revenue: 9810.00,  balance: -120.00 },
];

const MOCK_COMPANIES = [
  { name: "QuickFix Garage Doors",   jobs: 38, share: 0.42 },
  { name: "Reliable Door Services",  jobs: 27, share: 0.30 },
  { name: "EasyDoor Co.",            jobs: 18, share: 0.20 },
  { name: "DoorMaster Pros",         jobs: 7,  share: 0.08 },
];

export default function AdminProviders() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = MOCK_PROVIDERS.find((p) => p.id === selectedId);

  const totalCost = MOCK_PROVIDERS.reduce((s, p) => s + p.revenue * p.rate, 0);
  const top = [...MOCK_PROVIDERS].sort((a, b) => b.revenue - a.revenue)[0];
  const totalRevenue = MOCK_PROVIDERS.reduce((s, p) => s + p.revenue, 0);
  const roi = totalRevenue / Math.max(1, totalCost);

  return (
    <AdminLayout
      title="Providers"
      description="Lead sources, costs, and ROI"
      actions={<DemoBadge />}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Providers" value={String(MOCK_PROVIDERS.length)} hint="Active sources" icon={Network} />
        <StatCard label="Monthly Cost" value={fmtMoney(totalCost)} hint="Across all providers" icon={DollarSign} />
        <StatCard label="Top Provider" value={top.code} hint={top.name} icon={Crown} />
        <StatCard label="ROI" value={`${roi.toFixed(2)}×`} hint="Revenue / cost" icon={TrendingUp} />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-4">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">All Providers</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_PROVIDERS.map((p) => (
              <TableRow key={p.id} onClick={() => setSelectedId(p.id)} className="cursor-pointer">
                <TableCell>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium">{p.code}</span>
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="num text-right tabular-nums">{fmtPct(p.rate).replace("%", "")}%</TableCell>
                <TableCell className="num text-right tabular-nums">{p.jobs}</TableCell>
                <TableCell className="num text-right tabular-nums">{fmtMoney(p.revenue)}</TableCell>
                <TableCell className={cn("num text-right font-semibold tabular-nums", moneyClass(p.balance))}>
                  {fmtMoney(p.balance)}
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
                <SheetTitle className="flex items-center gap-2 font-display text-xl">
                  <span className="rounded-md bg-muted px-2 py-1 font-mono text-sm">{selected.code}</span>
                  {selected.name}
                </SheetTitle>
                <SheetDescription>
                  {selected.jobs} jobs · {fmtMoney(selected.revenue)} revenue · {fmtPct(selected.rate).replace("%", "")}% rate
                </SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="overview" className="mt-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="jobs">Jobs</TabsTrigger>
                  <TabsTrigger value="balances">Balances</TabsTrigger>
                  <TabsTrigger value="companies">Companies</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4 grid grid-cols-2 gap-3">
                  <StatCard label="Revenue" value={fmtMoney(selected.revenue)} />
                  <StatCard label="Cost" value={fmtMoney(selected.revenue * selected.rate)} />
                  <StatCard label="Net" value={fmtMoney(selected.revenue * (1 - selected.rate))} />
                  <StatCard label="Avg / Job" value={fmtMoney(selected.revenue / selected.jobs)} />
                </TabsContent>
                <TabsContent value="jobs" className="mt-4">
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    {/* TODO: connect — jobs from this provider */}
                    Jobs list with date / tech / amount
                  </div>
                </TabsContent>
                <TabsContent value="balances" className="mt-4">
                  <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    {/* TODO: connect — balance ledger */}
                    Balance ledger and payment history
                  </div>
                </TabsContent>
                <TabsContent value="companies" className="mt-4 space-y-2">
                  <p className="px-1 text-xs text-muted-foreground">
                    Company-name analytics under <span className="font-medium">{selected.code}</span>
                  </p>
                  {MOCK_COMPANIES.map((c) => (
                    <div key={c.name} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.jobs} jobs</p>
                      </div>
                      <span className="num text-sm font-semibold tabular-nums">{Math.round(c.share * 100)}%</span>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
