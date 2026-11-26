import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Download, Copy, Share2, MessageCircle, Save, Sparkles, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { callFunction, errorMessage } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { PROPOSAL_TEMPLATES, type ProposalContent } from "../lib/proposalTemplates";
import { buildProposalPdf, proposalText } from "../lib/proposalPdf";
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, PageLoader } from "../components/ui";
import { BusinessPicker } from "../components/BusinessPicker";
import { copyText, fmtDate, fmtMoney, whatsappLink } from "../lib/format";

const STATUS: Record<string, [string, string]> = {
  draft: ["Rascunho", ""], sent: ["Enviada", "border-amber-300/30 text-amber-300 bg-amber-300/10"],
  accepted: ["Aceita", "border-lime-400/30 text-lime-400 bg-lime-400/10"], rejected: ["Recusada", "border-rose-400/30 text-rose-300 bg-rose-400/10"],
};

export function ProposalsPage() {
  const { orgId } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["proposals", orgId],
    enabled: !!orgId,
    queryFn: async () => (await supabase.from("proposals").select("*, businesses(name, city)").eq("organization_id", orgId!).order("created_at", { ascending: false })).data ?? [],
  });
  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("proposals").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["proposals"] });
  };
  return (
    <>
      <PageHeader title="Propostas comerciais" subtitle="Gere propostas em PDF com diagnóstico digital baseado em fatos verificados" icon={FileText}
        actions={<Button icon={Plus} onClick={() => nav("/propostas/nova")}>Nova proposta</Button>} />
      <Card>
        {q.isLoading ? <PageLoader /> : !(q.data ?? []).length ? <EmptyState icon={FileText} title="Nenhuma proposta ainda" description="Abra a ficha de um estabelecimento e clique em “Gerar proposta”." /> : (
          <div className="divide-y divide-white/[0.04]">
            {q.data!.map((p: any) => (
              <div key={p.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link to={`/propostas/${p.id}`} className="min-w-0">
                  <div className="text-sm font-medium text-white hover:text-lime-400">{p.title}</div>
                  <div className="text-xs text-ink-400">{p.businesses?.name ?? "—"} · {PROPOSAL_TEMPLATES[p.template]?.label ?? p.template} · {fmtDate(p.created_at)}</div>
                </Link>
                <div className="flex items-center gap-2">
                  <span className="heading text-white">{fmtMoney(p.total_value)}</span>
                  <Badge className={STATUS[p.status]?.[1]}>{STATUS[p.status]?.[0]}</Badge>
                  <select className="input h-8 py-0 w-32 text-xs" value={p.status} onChange={(e) => setStatus(p.id, e.target.value)}>
                    {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

const emptyContent = (tpl: string, validity: number): ProposalContent => ({
  diagnosis: "", problems: [], solution: PROPOSAL_TEMPLATES[tpl].solution, features: [...PROPOSAL_TEMPLATES[tpl].features],
  items: PROPOSAL_TEMPLATES[tpl].items.map((i) => ({ ...i })), deadline: PROPOSAL_TEMPLATES[tpl].deadline,
  payment: "50% na aprovação e 50% na entrega", validity_days: validity, notes: "",
});

export function ProposalEditorPage() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { orgId, user, settings } = useAuth();
  const [proposalId, setProposalId] = useState<string | null>(id ?? null);
  const [businessId, setBusinessId] = useState<string | null>(sp.get("business"));
  const [template, setTemplate] = useState("profissional");
  const [title, setTitle] = useState("Proposta de presença digital");
  const [contact, setContact] = useState("");
  const [c, setC] = useState<ProposalContent>(() => emptyContent("profissional", 15));
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Carrega proposta existente
  useQuery({
    queryKey: ["proposal", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("proposals").select("*").eq("id", id!).single();
      if (error) throw error;
      setBusinessId(data.business_id); setTemplate(data.template); setTitle(data.title); setContact(data.contact_name ?? ""); setC(data.content);
      return data;
    },
  });

  const biz = useQuery({
    queryKey: ["proposal-biz", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [b, o, l] = await Promise.all([
        supabase.from("businesses").select("*").eq("id", businessId!).single(),
        supabase.from("opportunities").select("*").eq("business_id", businessId!).maybeSingle(),
        supabase.from("leads").select("id, contact_name, potential_value").eq("business_id", businessId!).maybeSingle(),
      ]);
      return { b: b.data, o: o.data, l: l.data };
    },
  });

  const applyTemplate = (tpl: string, keepItems = false) => {
    setTemplate(tpl);
    const t = PROPOSAL_TEMPLATES[tpl];
    setC((prev) => ({ ...prev, solution: t.solution, features: [...t.features], items: keepItems ? prev.items : t.items.map((i) => ({ ...i })), deadline: t.deadline }));
  };
  // Pré-preenche diagnóstico com FATOS verificados
  useEffect(() => {
    if (id || !biz.data?.b) return;
    const { b, o, l } = biz.data;
    const facts = (o?.reasons ?? []).filter((r: any) => r.kind === "fact" && r.weight > 0).map((r: any) => r.text);
    setTitle(`Proposta de presença digital — ${b.name}`);
    if (l?.contact_name) setContact(l.contact_name);
    setC((prev) => ({
      ...prev,
      validity_days: settings?.proposal_validity_days ?? 15,
      diagnosis: `Analisamos a presença digital de ${b.name}${b.city ? `, em ${b.city}` : ""}, a partir de dados públicos (Google${b.primary_website ? " e site do estabelecimento" : ""}).` +
        (b.rating != null ? ` O negócio possui nota ${b.rating} no Google com ${b.user_rating_count} avaliações.` : "") +
        (b.primary_website ? ` O site identificado é ${b.primary_website}.` : " Não foi identificado um site próprio nas fontes consultadas."),
      problems: facts,
    }));
    const tpl = (o?.suggested_products ?? []).some((p: string) => /card[aá]pio/i.test(p)) ? "cardapio" : (o?.suggested_products ?? []).some((p: string) => /agendamento/i.test(p)) ? "agendamento" : "profissional";
    applyTemplate(tpl, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz.data, id]);

  const total = useMemo(() => c.items.reduce((n, i) => n + (Number(i.price) || 0), 0), [c.items]);
  const seller = { name: settings?.seller_name, company: settings?.seller_company, email: settings?.seller_email, phone: settings?.seller_phone, whatsapp: settings?.seller_whatsapp, website: settings?.seller_website, footer: settings?.proposal_footer };
  const businessName = biz.data?.b?.name ?? "Cliente";

  const save = async (status?: string) => {
    if (!businessId) { toast.error("Selecione o estabelecimento"); return null; }
    setSaving(true);
    const row = { organization_id: orgId, business_id: businessId, lead_id: biz.data?.l?.id ?? null, user_id: user!.id, template, title, contact_name: contact || null, content: c, total_value: total, ...(status ? { status, sent_at: status === "sent" ? new Date().toISOString() : null } : {}) };
    const res = proposalId ? await supabase.from("proposals").update(row).eq("id", proposalId).select().single() : await supabase.from("proposals").insert(row).select().single();
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return null; }
    if (!proposalId) { setProposalId(res.data.id); nav(`/propostas/${res.data.id}`, { replace: true }); }
    qc.invalidateQueries({ queryKey: ["proposals"] });
    if (status === "sent" && biz.data?.l?.id) {
      await supabase.from("leads").update({ status: "proposta_enviada", potential_value: biz.data.l.potential_value ?? total }).eq("id", biz.data.l.id);
      await supabase.from("lead_notes").insert({ organization_id: orgId, lead_id: biz.data.l.id, user_id: user!.id, kind: "proposal", content: `Proposta "${title}" enviada — ${fmtMoney(total)}` });
    }
    toast.success(status === "sent" ? "Proposta marcada como enviada e CRM atualizado" : "Proposta salva");
    return res.data;
  };
  const pdf = () => buildProposalPdf({ title, businessName, contactName: contact, template, content: c, seller });
  const fileName = `proposta-${businessName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;
  const text = () => proposalText({ title, businessName, contactName: contact, content: c, seller });
  const share = async () => {
    const file = new File([pdf().output("blob")], fileName, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); } catch { /* cancelado */ }
    } else if (navigator.share) {
      try { await navigator.share({ title, text: text() }); } catch { /* cancelado */ }
    } else { await copyText(text()); toast.success("Compartilhamento indisponível: texto copiado"); }
  };
  const aiFill = async () => {
    if (!businessId) return toast.error("Selecione o estabelecimento");
    setAiLoading(true);
    try {
      const r = await callFunction<{ text: string }>("ai-assistant", { business_id: businessId, task: "proposal_text" });
      const json = JSON.parse(r.text.replace(/^```(json)?|```$/gm, "").trim());
      setC((prev) => ({ ...prev, diagnosis: json.diagnosis ?? prev.diagnosis, problems: Array.isArray(json.problems) ? json.problems : prev.problems, solution: json.solution ?? prev.solution, features: Array.isArray(json.features) ? json.features : prev.features }));
      toast.success("Textos preenchidos pela IA — revise antes de enviar");
    } catch (e) {
      toast.error(e instanceof SyntaxError ? "A IA retornou um formato inesperado. Tente novamente." : errorMessage(e));
    } finally { setAiLoading(false); }
  };
  const listEditor = (key: "problems" | "features", label: string) => (
    <Field label={label}>
      <div className="space-y-1.5">
        {c[key].map((v, i) => (
          <div key={i} className="flex gap-2">
            <input className="input" value={v} onChange={(e) => setC({ ...c, [key]: c[key].map((x, j) => (j === i ? e.target.value : x)) })} />
            <button onClick={() => setC({ ...c, [key]: c[key].filter((_, j) => j !== i) })} className="text-ink-500 hover:text-rose-300 px-2"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => setC({ ...c, [key]: [...c[key], ""] })}>Adicionar</Button>
      </div>
    </Field>
  );

  return (
    <>
      <PageHeader title={proposalId ? "Editar proposta" : "Nova proposta"} icon={FileText} subtitle={businessName !== "Cliente" ? businessName : "Selecione o estabelecimento"}
        actions={<>
          <Button variant="secondary" icon={Save} loading={saving} onClick={() => save()}>Salvar</Button>
          <Button icon={Download} onClick={() => { pdf().save(fileName); toast.success("PDF gerado"); }}>Gerar PDF</Button>
        </>} />
      {!businessId && <Card className="p-4 mb-4"><BusinessPicker onPick={(bid) => { setBusinessId(bid); setSp({ business: bid }); }} /></Card>}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Modelo" icon={FileText} />
            <div className="px-5 pb-5 flex flex-wrap gap-1.5">
              {Object.entries(PROPOSAL_TEMPLATES).map(([k, t]) => <button key={k} onClick={() => applyTemplate(k)} className={`chip ${template === k ? "chip-active" : ""}`}>{t.label}</button>)}
            </div>
          </Card>
          <Card className="p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Nome do responsável (se informado)"><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end"><Button size="sm" variant="outline" icon={Sparkles} loading={aiLoading} onClick={aiFill}>Preencher textos com IA</Button></div>
            <Field label="Diagnóstico digital"><textarea className="input min-h-24" value={c.diagnosis} onChange={(e) => setC({ ...c, diagnosis: e.target.value })} /></Field>
            {listEditor("problems", "Problemas identificados (fatos verificados)")}
            <Field label="Solução recomendada"><textarea className="input min-h-20" value={c.solution} onChange={(e) => setC({ ...c, solution: e.target.value })} /></Field>
            {listEditor("features", "Funcionalidades propostas")}
          </Card>
          <Card className="p-5 space-y-3">
            <div className="label">Investimento (editável)</div>
            {c.items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={it.name} onChange={(e) => setC({ ...c, items: c.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input type="number" min={0} step="10" className="input w-36" value={it.price} onChange={(e) => setC({ ...c, items: c.items.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)) })} />
                <button onClick={() => setC({ ...c, items: c.items.filter((_, j) => j !== i) })} className="text-ink-500 hover:text-rose-300 px-2"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setC({ ...c, items: [...c.items, { name: "Novo item", price: 0 }] })}>Adicionar item</Button>
              <span className="heading text-xl text-lime-400">{fmtMoney(total)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Prazo estimado"><input className="input" value={c.deadline} onChange={(e) => setC({ ...c, deadline: e.target.value })} /></Field>
              <Field label="Pagamento"><input className="input" value={c.payment} onChange={(e) => setC({ ...c, payment: e.target.value })} /></Field>
              <Field label="Validade (dias)"><input type="number" className="input" value={c.validity_days} onChange={(e) => setC({ ...c, validity_days: Number(e.target.value) || 15 })} /></Field>
            </div>
            <Field label="Observações"><textarea className="input min-h-16" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} /></Field>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-5 space-y-2 xl:sticky xl:top-20">
            <div className="heading font-semibold text-white">Ações</div>
            <Button className="w-full" icon={Download} onClick={() => { pdf().save(fileName); toast.success("PDF gerado"); }}>Gerar PDF</Button>
            <Button className="w-full" variant="secondary" icon={Copy} onClick={async () => { await copyText(text()); toast.success("Proposta copiada"); }}>Copiar proposta</Button>
            <Button className="w-full" variant="secondary" icon={Share2} onClick={share}>Compartilhar</Button>
            <a className="block" href={whatsappLink(biz.data?.b?.phone, text()) ?? undefined} target="_blank" rel="noreferrer">
              <Button className="w-full" variant="secondary" icon={MessageCircle} disabled={!biz.data?.b?.phone}>Abrir WhatsApp</Button>
            </a>
            <Button className="w-full" variant="outline" icon={Send} loading={saving} onClick={() => save("sent")}>Marcar como enviada</Button>
            <div className="pt-3 text-xs text-ink-400">
              <div className="label">Dados do vendedor no PDF</div>
              {seller.name || seller.company ? <p>{[seller.name, seller.company, seller.phone, seller.email].filter(Boolean).join(" · ")}</p> : <p>Configure seus dados em <Link to="/configuracoes" className="text-lime-400 hover:underline">Configurações</Link>.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
