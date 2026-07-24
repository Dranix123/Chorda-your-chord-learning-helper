import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:1211";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const description = "A focused workspace for chord discovery, piano voicings, progressions, and deliberate practice.";

  return {
    title: {
      default: "Harmonic Practice",
      template: "%s — Harmonic Practice",
    },
    description,
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
      title: "Harmonic Practice",
      description,
      images: [{ url: image, width: 1536, height: 1024, alt: "Harmonic Practice — Chords, Voicings, Progressions" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Harmonic Practice",
      description,
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
