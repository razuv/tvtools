import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Playtools",
    description: "Turn SVG and PNG shapes into material-rich 3D objects, then export them anywhere.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
    openGraph: { title: "Playtools", description: "SVG, PNG or text in. Material-rich 3D out.", images: [{ url: image, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "Playtools", description: "SVG, PNG or text in. Material-rich 3D out.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
