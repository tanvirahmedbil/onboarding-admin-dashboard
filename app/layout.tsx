import type { Metadata } from "next";
import "./globals.css";
import "./interactions.css";

export const metadata: Metadata = {
  title: "Onboarding SOP - Admin View",
  description: "Live delivery reporting for Digital Marketing and SEO onboarding.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
