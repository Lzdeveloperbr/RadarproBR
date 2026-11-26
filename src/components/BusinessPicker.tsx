import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { fetchBusinesses } from "../lib/filters";

export function BusinessPicker({ onPick, placeholder = "Buscar estabelecimento cadastrado..." }: { onPick: (id: string) => void; placeholder?: string }) {
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["picker", term],
    enabled: term.trim().length >= 2,
    queryFn: () => fetchBusinesses({ q: term.trim() }, 8),
  });
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 size-4 text-ink-400" />
      <input className="input pl-9" placeholder={placeholder} value={term} onChange={(e) => setTerm(e.target.value)} />
      {(q.data?.length ?? 0) > 0 && (
        <div className="absolute z-50 mt-1 w-full card bg-ink-850 p-1">
          {q.data!.map((b) => (
            <button key={b.id} onClick={() => { onPick(b.id); setTerm(""); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5">
              <span><span className="text-white">{b.name}</span> <span className="text-xs text-ink-400">· {b.category} · {b.city}</span></span>
              {b.opportunity_score != null && <span className="text-xs text-lime-400">{b.opportunity_score}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
