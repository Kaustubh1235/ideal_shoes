import { redirect } from "next/navigation";

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  redirect(`/products${searchParams.q ? `?q=${encodeURIComponent(searchParams.q)}` : ""}`);
}
