import { DollarSign } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="flex items-center gap-3 mb-4">
        <DollarSign className="h-10 w-10 text-emerald-600" aria-hidden="true" />
        <h1 className="text-4xl font-bold text-gray-900">FairShare</h1>
      </div>
      <p className="text-lg text-gray-600 max-w-md text-center">
        Split expenses fairly. Settle debts simply.
      </p>
    </main>
  );
}
