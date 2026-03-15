import "./globals.css";
import type { ReactNode } from "react";
import { SharedWorkspaceProvider } from "../src/context/SharedWorkspaceContext";

export const metadata = {
  title: "Founder's Flight Deck",
  description: "Bioluminescent deep sea startup copilot dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SharedWorkspaceProvider>{children}</SharedWorkspaceProvider>
      </body>
    </html>
  );
}

