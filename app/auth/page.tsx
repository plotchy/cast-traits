"use client";
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuthInner() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, next }),
      });
      if (resp.ok) {
        router.replace(next);
      } else {
        const j = await resp.json().catch(() => null);
        setError(j?.error || 'Invalid password');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="border rounded p-6 w-full max-w-sm flex flex-col gap-3">
        <h1 className="text-lg font-medium">Enter password</h1>
        <input
          type="password"
          className="border rounded px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="border rounded px-3 py-2" disabled={!password}>
          Continue
        </button>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </form>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center">Loading…</div>}>
      <AuthInner />
    </Suspense>
  );
}


