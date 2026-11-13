import { ImageResponse } from "next/og";

// Fallback share image for pages without a product photo. Drawn with the default font, so it
// needs no network at build or request time.
export const alt = "IDEALX: boots and formal shoes from our Agra factory";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#FBF9F6", color: "#1E1714" }}>
        <div style={{ fontSize: 120, letterSpacing: 24, fontWeight: 700, color: "#5E3526" }}>IDEALX</div>
        <div style={{ marginTop: 24, fontSize: 40, maxWidth: 900, lineHeight: 1.3 }}>
          The factory that makes boots for service makes your formal shoes.
        </div>
        <div style={{ marginTop: 40, fontSize: 28, color: "#7A1F2B" }}>Ideal Shoes · Agra</div>
      </div>
    ),
    size,
  );
}
