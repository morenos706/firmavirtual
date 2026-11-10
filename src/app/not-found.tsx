import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-mist p-6 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <p className="text-navy">La página que busca no existe o no tiene acceso a ella.</p>
      <Link href="/dashboard" className="text-sm font-semibold text-brand">Volver al inicio</Link>
    </div>
  );
}
