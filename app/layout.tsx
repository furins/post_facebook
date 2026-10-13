import type { Metadata } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";

const titilliumWeb = Titillium_Web({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-titillium",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pubblicazioni social · IC Badia Trecenta",
  description: "Prepara contenuti accessibili e curati per i canali social della scuola.",
  icons: {
    icon: "/images/school-logo.png",
    apple: "/images/school-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className={titilliumWeb.variable}>{children}</body>
    </html>
  );
}
