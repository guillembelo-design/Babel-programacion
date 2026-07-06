import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Babel Programación",
  description: "Gestión semanal de sesiones para Cines Babel"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className="bg-babel-bg text-white"
        style={{ backgroundColor: "#111113", color: "#f8fafc" }}
      >
        {children}
      </body>
    </html>
  );
}
