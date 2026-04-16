import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Local Business SEO Audit | Free Report Generator",
  description:
    "Generate a professional, data-driven SEO audit report for any local business in under 90 seconds. Covers Google Business Profile, rankings, reviews, citations, and website health.",
  openGraph: {
    title: "Local Business SEO Audit",
    description: "Free comprehensive local SEO audit reports in under 90 seconds.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
