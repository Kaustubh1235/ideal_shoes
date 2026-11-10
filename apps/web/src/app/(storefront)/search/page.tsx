import { redirect } from "next/navigation";

export const metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  redirect(`/products${searchParams.q ? `?q=${encodeURIComponent(searchParams.q)}` : ""}`);
}
