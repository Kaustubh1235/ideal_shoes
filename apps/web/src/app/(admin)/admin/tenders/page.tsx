import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@bharatboot/ui";
import { TenderPollButtons } from "@/components/admin/tender-poll-buttons";

export const dynamic = "force-dynamic";

interface TenderRow {
  id: string;
  source: string;
  title: string;
  buyer_org: string;
  submission_deadline: string | null;
  estimated_value: number | null;
  product_match: string[];
  status: string;
}

export default async function AdminTendersPage() {
  let tenders: TenderRow[] = [];
  try {
    const res = await apiFetch<{ items: TenderRow[] }>("/tenders?limit=100");
    tenders = res.items;
  } catch {
    // API may be unavailable in dev
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="font-display text-2xl uppercase">Tenders</h1>
        <div className="flex gap-2">
          <TenderPollButtons />
          <Button asChild variant="outline"><Link href="/admin/tenders/new">+ New Manual Entry</Link></Button>
        </div>
      </div>

      <div className="rounded-lg border border-olive-100 bg-cream">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenders.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="max-w-md truncate">{t.title}</TableCell>
                <TableCell>{t.buyer_org}</TableCell>
                <TableCell><Badge variant="outline">{t.source}</Badge></TableCell>
                <TableCell>{t.submission_deadline ? new Date(t.submission_deadline).toLocaleDateString("en-IN") : "—"}</TableCell>
                <TableCell className="text-right">{t.estimated_value ? `₹${t.estimated_value.toLocaleString("en-IN")}` : "—"}</TableCell>
                <TableCell>{t.product_match.join(", ") || "—"}</TableCell>
                <TableCell><Badge>{t.status}</Badge></TableCell>
              </TableRow>
            ))}
            {tenders.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-ink/60 py-12">
                No tenders yet. Click <strong>Poll CPPP RSS</strong> to ingest the latest government feed, or add manual entries.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
