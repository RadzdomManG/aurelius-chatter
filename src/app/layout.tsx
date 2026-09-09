import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aurelius Chatter",
  description: "A calm, auditable conversation desk for AI-assisted Fanvue teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
