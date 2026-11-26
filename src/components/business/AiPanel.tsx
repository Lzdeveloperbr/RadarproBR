import { useState } from "react";
import { toast } from "sonner";
import { Bot, Copy, MessageCircle, FileText, Lightbulb, Mail, Target, Save } from "lucide-react";
import { callFunction, errorMessage } from "../../lib/api";
import { Button, Card, CardHeader } from "../ui";
import { copyText, whatsappLink } from "../../lib/format";
import { useAuth } from "../../hooks/useAuth";

const TASKS = [
  { key: "report", label: "Relatório comercial", icon: FileText },
  { key: "pitch", label: "Argumentos de venda", icon: Target },
  { key: "approach", label: "Sugestão de abordagem", icon: Lightbulb },
  { key: "whatsapp", label: "Mensagem WhatsApp", icon: MessageCircle },
  { key: "email", label: "E-mail comercial", icon: Mail },
] as const;

export function AiPanel({ businessId, phone, onGenerated }: { businessId: string; phone?: string | null; onGenerated?: () => void }) {
  const { settings } = useAuth();
  const [task, setTask] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [extra, setExtra] = useState("");

  const run = async (key: string) => {
    setTask(key);
    setLoading(true);
    try {
      const r = await callFunction<{ text: string }>("ai-assistant", { business_id: businessId, task: key, extra });
      const filled = r.text.replace(/\{\{NOME_DO_VENDEDOR\}\}/g, settings?.seller_name ?? "{{NOME_DO_VENDEDOR}}")
        .replace(/\{\{CONTATO_DO_VENDEDOR\}\}/g, [settings?.seller_phone, settings?.seller_email].filter(Boolean).join(" · ") || "{{CONTATO_DO_VENDEDOR}}");
      setText(filled);
      onGenerated?.();
    } catch (e) {
      toast.error(errorMessage(e), { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };
  const firstVariant = text.split(/\n-{3,}\n/)[0]?.trim();

  return (
    <Card>
      <CardHeader title="Inteligência artificial" subtitle="Conteúdo gerado somente com dados verificados" icon={Bot} />
      <div className="px-5 pb-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TASKS.map((t) => <Button key={t.key} size="sm" variant={task === t.key ? "primary" : "secondary"} icon={t.icon} loading={loading && task === t.key} disabled={loading} onClick={() => run(t.key)}>{t.label}</Button>)}
        </div>
        <input className="input" placeholder="Instrução adicional (opcional): ex. foco em agendamento, tom mais informal..." value={extra} onChange={(e) => setExtra(e.target.value)} />
        {text && (
          <>
            <textarea className="input min-h-72 font-mono text-[13px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Copy} onClick={async () => { await copyText(text); toast.success("Copiado"); }}>Copiar</Button>
              {task === "whatsapp" && phone && (
                <a href={whatsappLink(phone, firstVariant) ?? "#"} target="_blank" rel="noreferrer"><Button size="sm" icon={MessageCircle}>Abrir no WhatsApp</Button></a>
              )}
              {task === "email" && (
                <a href={`mailto:?subject=${encodeURIComponent(text.match(/^Assunto:\s*(.*)$/m)?.[1] ?? "")}&body=${encodeURIComponent(text.replace(/^Assunto:.*$/m, "").trim())}`}><Button size="sm" icon={Mail}>Abrir no e-mail</Button></a>
              )}
              <span className="text-[11px] text-ink-400 self-center inline-flex items-center gap-1"><Save className="size-3" />Salvo automaticamente no histórico de prompts</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
