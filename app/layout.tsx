import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Babel Programacion",
  description: "Gestion semanal de sesiones para Cines Babel"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
