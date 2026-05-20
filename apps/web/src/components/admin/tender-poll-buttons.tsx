"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@bharatboot/ui";
import { pollRssAction, pollEmailAction } from "@/app/actions/admin-tenders";

export function TenderPollButtons() {
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await pollRssAction();
          toast(r.ok ? `Ingested ${r.count} tenders from CPPP RSS` : `Poll failed: ${r.error}`);
        })}
      >
        Poll CPPP RSS
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await pollEmailAction();
          toast(r.ok ? `Ingested ${r.count} tender emails` : `Inbox not configured (NEXT-STEPS step 8)`);
        })}
      >
        Poll Email Inbox
      </Button>
    </>
  );
}
