import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrestaYa FinTech | Sistema de Desembolso de Préstamos con Notificaciones 2FA",
  description: "Plataforma bancaria digital conectada al microservicio de notificaciones de alta disponibilidad Notify API en AWS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="bg-slate-900 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
