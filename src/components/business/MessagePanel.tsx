import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareText, Copy, MessageCircle, Mail, Save } from "lucide-react";
import { Button, Card, CardHeader } from "../ui";
import { copyText, whatsappLink } from "../../lib/format";
import { generateMessage, MESSAGE_KINDS, type MessageKind } from "../../lib/messages";
import { db, uid, nowIso } from "../../lib/db";
import type { Business, Opportunity } from "../../lib/types";
import { useSettings } from "../../hooks/useSettings";

export function MessagePanel({ business, opportunity, phone, onSaved }: { business: Business; opportunity: Opportunity | null; phone?: string | null; onSaved?: () => void }) {
  const { settings } = useSettings();
  const [kind, setKind] = useState<MessageKind | null>(null);
  const [text, setText] = useState("");
  const run = (k: MessageKind) => {
    setKind(k);
    setText(generateMessage(k, business, opportunity, { name: settings.seller_name, company: settings.seller_company, phone: settings.seller_phone, email: settings.seller_email }));
  };
  const save = async () => {
    await db.prompts.add({ id: uid(), business_id: business.id, kind: kind!, title: `${MESSAGE_KINDS.find((m) => m.key === kind)?.label} — ${business.name}`, content: text, created_at: nowIso() });
    toast.success("Salvo no histórico do estabelecimento");
    onSaved?.();
  };
  const firstVariant = text.split(/\n-{3,}\n/)[0]?.trim();
  return (
    <Card>
      <CardHeader title="Gerador de mensagens e argumentos" subtitle="Textos montados apenas com os dados verificados — edite antes de enviar" icon={MessageSquareText} />
      <div className="px-5 pb-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {MESSAGE_KINDS.map((m) => <Button key={m.key} size="sm" variant={kind === m.key ? "primary" : "secondary"} onClick={() => run(m.key)}>{m.label}</Button>)}
        </div>
        {text && (
          <>
            <textarea className="input min-h-72 font-mono text-[13px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Copy} onClick={async () => { await copyText(text); toast.success("Copiado"); }}>Copiar</Button>
              {kind === "whatsapp" && phone && <a href={whatsappLink(phone, firstVariant) ?? "#"} target="_blank" rel="noreferrer"><Button size="sm" icon={MessageCircle}>Abrir no WhatsApp</Button></a>}
              {kind === "email" && <a href={`mailto:?subject=${encodeURIComponent(text.match(/^Assunto:\s*(.*)$/m)?.[1] ?? "")}&body=${encodeURIComponent(text.replace(/^Assunto:.*$/m, "").trim())}`}><Button size="sm" icon={Mail}>Abrir no e-mail</Button></a>}
              <Button size="sm" variant="ghost" icon={Save} onClick={save}>Salvar</Button>
            </div>
          </>
        )}
        {!settings.seller_name && <p className="text-[11px] text-ink-400">Dica: preencha seu nome e contato em Configurações para que apareçam nas mensagens.</p>}
      </div>
    </Card>
  );
}
