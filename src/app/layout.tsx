import type { Metadata, Viewport } from "next";
import { Newsreader, Inter, Caveat } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-handwriting",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#FBF9F5",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "UNSENT — Anonymous Letters & Unspoken Words",
  description:
    "Some words were never meant to be spoken. But perhaps they still deserve somewhere to exist. An anonymous sanctuary for unwritten and unspoken letters.",
  keywords: ["anonymous letters", "unspoken words", "writing", "orbit", "quiet sanctuary"],
  authors: [{ name: "UNSENT" }],
  openGraph: {
    title: "UNSENT — Anonymous Letters",
    description:
      "Some words were never meant to be spoken. But perhaps they still deserve somewhere to exist.",
    type: "website",
    locale: "en_US",
    siteName: "UNSENT",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${inter.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#FBF9F5] text-[#23201D] selection:bg-[#EEDCDA] selection:text-[#23201D]">
        {children}
      </body>
    </html>
  );
}
