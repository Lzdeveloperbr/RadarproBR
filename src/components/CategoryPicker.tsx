import { clsx } from "clsx";
import { CATEGORIES } from "../lib/constants";

export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.filter((c) => c !== "Outros").map((c) => (
          <button type="button" key={c} onClick={() => toggle(c)} className={clsx("chip", value.includes(c) && "chip-active")}>{c}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <button type="button" className="text-lime-400 hover:underline" onClick={() => onChange(CATEGORIES.filter((c) => c !== "Outros"))}>Selecionar todas</button>
        {value.length > 0 && <button type="button" className="text-ink-300 hover:underline" onClick={() => onChange([])}>Limpar ({value.length})</button>}
      </div>
    </div>
  );
}
