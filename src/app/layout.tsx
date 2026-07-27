import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luna Agenda",
  description: "Portal de agendamento odontológico.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
