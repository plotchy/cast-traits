"use client";
import { useState } from 'react';

export function TraitGenerator({
  onGenerated,
}: {
  onGenerated: (payload: { name: string; description: string; code: string }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/generate-trait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to generate');
      setCode(data.code);
      // Auto-apply the generated trait
      onGenerated({ name, description, code: data.code });
      // Reset inputs for a clean flow
      setName('');
      setDescription('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded p-3 flex flex-col gap-2">
      <div className="text-sm font-medium">Generate a new trait</div>
      <input
        className="border rounded px-2 py-1"
        placeholder="Trait name (e.g. 'web surfer')"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="border rounded px-2 py-1 min-h-20"
        placeholder="Describe the trait in plain English. (e.g. 'contains a url')"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="border rounded px-3 py-1" onClick={generate} disabled={loading || !name || !description}>
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {code && (
        <div>
          <div className="text-xs opacity-80 mb-1">Generated predicate</div>
          <pre className="text-xs bg-black/5 dark:bg-white/5 p-2 rounded overflow-auto max-h-48">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}


