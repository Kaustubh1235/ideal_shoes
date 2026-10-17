import Script from "next/script";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@bharatboot/ui";

export const dynamic = "force-dynamic";

export default async function ARPage({ params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true, slug: true, arEnabled: true, arModelUrl: true },
  });
  if (!product) notFound();

  return (
    <>
      <Script
        type="module"
        src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"
        strategy="afterInteractive"
      />
      <div className="container py-8">
        <h1 className="font-display text-3xl">{product.name}</h1>
        <p className="text-sm text-ink/60 mt-1">3D / AR Viewer</p>

        <div className="mt-6 rounded-lg border border-leather-100 bg-cream p-2 md:p-4">
          {product.arModelUrl ? (
            // @ts-expect-error - custom element
            <model-viewer
              src={product.arModelUrl}
              ios-src={product.arModelUrl.replace(/\.glb$/, ".usdz")}
              alt={`3D model of ${product.name}`}
              ar
              ar-modes="webxr scene-viewer quick-look"
              camera-controls
              touch-action="pan-y"
              auto-rotate
              shadow-intensity="1"
              exposure="0.9"
              style={{ width: "100%", height: "min(70vh, 600px)", background: "#FAF8F5" }}
            >
              <button
                slot="ar-button"
                className="absolute bottom-4 right-4 bg-leather-700 text-cream px-4 py-2 rounded font-medium uppercase text-sm tracking-wider"
              >
                View in your space
              </button>
            {/* @ts-expect-error - custom element */}
            </model-viewer>
          ) : (
            <div className="aspect-square w-full max-w-xl mx-auto grid place-items-center text-center text-ink/60 p-12 border border-dashed border-leather-200 rounded">
              <div>
                <p className="font-display text-lg">3D model not yet uploaded</p>
                <p className="mt-2 text-sm">
                  Upload a <code>.glb</code> file via <Link className="underline" href={`/admin/products/${product.id}`}>admin</Link> to enable AR.
                </p>
                <p className="mt-4 text-xs text-ink/50">
                  See <code>NEXT-STEPS.md</code> step 6 for how to generate 3D models cheaply with Polycam / Kiri Engine.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <Button asChild variant="outline">
            <Link href={`/products/${product.slug}`}>← Back to product</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
