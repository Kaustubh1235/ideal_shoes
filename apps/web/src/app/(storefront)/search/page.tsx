import { redirect } from "next/navigation";

export const metadata = { title: "Search", robots: { index: false } };

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  redirect(`/products${searchParams.q ? `?q=${encodeURIComponent(searchParams.q)}` : ""}`);
}
