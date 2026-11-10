import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CROSSFIRE — Online Arena Shooter",
  description: "Drop in. Gear up. Make your mark. A free 3D multiplayer arena shooter, right in your browser.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
