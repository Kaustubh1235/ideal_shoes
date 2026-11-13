import { apiFetch } from "@/lib/api";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from "@bharatboot/ui";
import { triggerExportAction } from "@/app/actions/admin-gstr";

export const dynamic = "force-dynamic";

interface Run {
  id: string;
  report_type: string;
  period_month: string;
  status: string;
  has_file: boolean;
  row_count: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export default async function AdminGstrPage() {
  let runs: Run[] = [];
  try {
    const r = await apiFetch<{ items: Run[] }>("/gstr/r1/runs");
    runs = r.items;
  } catch {}

  const defaultMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // last completed month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl uppercase">GSTR-1 Exports</h1>

      <Card>
        <CardHeader><CardTitle>New Export</CardTitle></CardHeader>
        <CardContent>
          <form action={triggerExportAction} className="flex items-end gap-3">
            <div>
              <Label>Month</Label>
              <Input name="month" type="month" defaultValue={defaultMonth} required />
            </div>
            <Button type="submit">Generate</Button>
          </form>
          <p className="text-xs text-ink/60 mt-3">
            Produces a CSV with B2B, B2CL, B2CS, and HSN summary sections matching the GSTN
            offline tool format. Upload there for filing, or convert to JSON via your GSP.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>File</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.period_month}</TableCell>
                  <TableCell><Badge variant={r.status === "done" ? "success" : r.status === "running" ? "warning" : "outline"}>{r.status}</Badge></TableCell>
                  <TableCell>{r.row_count ?? "—"}</TableCell>
                  <TableCell>{new Date(r.started_at).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{r.has_file ? <a className="underline" href={`/files/gstr/r1/runs/${r.id}/file`}>Download</a> : "—"}</TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-ink/60 py-6">No exports yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
