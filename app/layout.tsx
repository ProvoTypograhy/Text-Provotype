import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Textual Provotype",
  description: "Research text reading interface at the University of Victoria.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
