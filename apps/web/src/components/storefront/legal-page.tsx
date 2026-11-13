import type { ReactNode } from "react";

/** Plain reading layout for the policy pages (the Tailwind typography plugin is not installed). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="container py-12 max-w-2xl text-ink/85 leading-relaxed">
      <h1 className="font-display text-3xl text-ink">{title}</h1>
      <p className="mt-1 text-xs text-ink/50">Last updated {updated}</p>
      <div className="mt-6 space-y-4 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </div>
    </div>
  );
}

export function Contact({ email, phone }: { email: string; phone: string }) {
  if (!email && !phone) return <a href="/contact">our contact page</a>;
  return (
    <>
      {email && <a href={`mailto:${email}`}>{email}</a>}
      {email && phone && " or WhatsApp "}
      {phone}
    </>
  );
}
