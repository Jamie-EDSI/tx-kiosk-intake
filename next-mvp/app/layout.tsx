import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workforce Video Greeter",
  description: "Browser-based kiosk-to-staff WebRTC greeter MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
