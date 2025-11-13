interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Este layout se simplifica porque el sidebar ahora es global desde el RootLayout.
// Conservamos únicamente un contenedor de contenido para el dashboard.
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return <div className="min-w-0 space-y-6">{children}</div>;
}
