import type { Metadata } from "next";
import ChordApp from "./chord-app";

export const metadata: Metadata = {
  title: "Harmonic Practice — Chords & Voicings",
  description: "Discover, save, build, and practice exact piano chord voicings.",
};

export default function Home() {
  return <ChordApp />;
}
