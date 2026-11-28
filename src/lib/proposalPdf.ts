import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { pdfHeader } from "./export";
import type { ProposalContent } from "./proposalTemplates";
import { fmtMoney } from "./format";

export interface Seller { name?: string | null; company?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null; website?: string | null; footer?: string | null }

export interface PdfTech { performance: number | null; seo: number | null; accessibility: number | null; best_practices: number | null; lcp_text: string | null; viewport_ok: boolean | null; screenshot: string | null; url: string }

export function buildProposalPdf(p: { title: string; businessName: string; contactName?: string | null; template: string; content: ProposalContent; seller: Seller; createdAt?: string; tech?: PdfTech | null }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  pdfHeader(doc, p.title, `Para: ${p.businessName}${p.contactName ? ` · A/C ${p.contactName}` : ""} · ${new Date(p.createdAt ?? Date.now()).toLocaleDateString("pt-BR")}`);
  let y = 140;
  const ensure = (h: number) => { if (y + h > H - 60) { doc.addPage(); y = 50; } };
  const section = (t: string) => {
    ensure(40);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(17, 20, 26);
    doc.setFillColor(198, 244, 50); doc.rect(32, y - 9, 4, 12, "F");
    doc.text(t.toUpperCase(), 42, y);
    y += 16;
  };
  const para = (t: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(t, W - 64);
    for (const l of lines) { ensure(14); doc.text(l, 32, y); y += 14; }
    y += 6;
  };
  const bullets = (list: string[]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50, 50, 50);
    for (const item of list) {
      const lines = doc.splitTextToSize(item, W - 84);
      ensure(14 * lines.length);
      doc.setFillColor(143, 184, 15); doc.circle(40, y - 3.5, 2, "F");
      lines.forEach((l: string, i: number) => { doc.text(l, 50, y); y += 14; if (i === lines.length - 1) y += 2; });
    }
    y += 6;
  };
  const c = p.content;
  section("Diagnóstico digital"); para(c.diagnosis || "—");
  if (p.tech) {
    const t = p.tech;
    section("Avaliação técnica do site (Google Lighthouse, celular)");
    const box = (label: string, v: number | null, x: number) => {
      const col: [number, number, number] = v == null ? [140, 140, 140] : v >= 90 ? [52, 168, 83] : v >= 50 ? [230, 160, 0] : [220, 53, 69];
      doc.setDrawColor(...col); doc.setLineWidth(3); doc.circle(x + 22, y + 18, 18, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...col);
      doc.text(v == null ? "—" : String(v), x + 22, y + 22, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
      doc.text(label, x + 22, y + 48, { align: "center" });
    };
    ensure(70);
    box("Desempenho", t.performance, 32); box("SEO", t.seo, 102); box("Acessibilidade", t.accessibility, 172); box("Boas práticas", t.best_practices, 242);
    y += 64;
    para([`Site analisado: ${t.url}`, t.lcp_text ? `Tempo para exibir o conteúdo principal no celular: ${t.lcp_text}.` : "", t.viewport_ok === false ? "O site não está adaptado para telas de celular." : ""].filter(Boolean).join(" "));
    if (t.screenshot) {
      try {
        const imgW = 120, imgH = 240;
        ensure(imgH + 24);
        doc.addImage(t.screenshot, "JPEG", (W - imgW) / 2, y, imgW, imgH);
        doc.setFontSize(8); doc.setTextColor(120, 120, 120);
        doc.text("Como o site aparece hoje no celular", W / 2, y + imgH + 12, { align: "center" });
        y += imgH + 26;
      } catch { /* imagem inválida: ignora */ }
    }
  }
  if (c.problems.length) { section("Problemas identificados"); bullets(c.problems); }
  section("Solução recomendada"); para(c.solution);
  if (c.features.length) { section("Funcionalidades propostas"); bullets(c.features); }
  section("Investimento");
  const total = c.items.reduce((n, i) => n + (Number(i.price) || 0), 0);
  autoTable(doc, {
    startY: y,
    head: [["Item", "Valor"]],
    body: [...c.items.map((i) => [i.name, fmtMoney(i.price)]), [{ content: "TOTAL", styles: { fontStyle: "bold" } }, { content: fmtMoney(total), styles: { fontStyle: "bold" } }]],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [17, 20, 26], textColor: [198, 244, 50] },
    columnStyles: { 1: { halign: "right", cellWidth: 120 } },
    margin: { left: 32, right: 32 },
  });
  y = (doc as any).lastAutoTable.finalY + 22;
  section("Prazo estimado"); para(c.deadline);
  if (c.payment) { section("Condições de pagamento"); para(c.payment); }
  para(`Proposta válida por ${c.validity_days} dias a partir da data de emissão.`);
  if (c.notes) { section("Observações"); para(c.notes); }
  section("Contato do vendedor");
  para([p.seller.name, p.seller.company, p.seller.phone && `Telefone: ${p.seller.phone}`, p.seller.whatsapp && `WhatsApp: ${p.seller.whatsapp}`, p.seller.email && `E-mail: ${p.seller.email}`, p.seller.website].filter(Boolean).join("\n") || "—");
  if (p.seller.footer) para(p.seller.footer);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Gerado com RADAR LOCAL PRO · ${i}/${pages}`, 32, H - 20);
  }
  return doc;
}

export function proposalText(p: { title: string; businessName: string; contactName?: string | null; content: ProposalContent; seller: Seller }) {
  const c = p.content;
  const total = c.items.reduce((n, i) => n + (Number(i.price) || 0), 0);
  return [
    `*${p.title}*`, `Para: ${p.businessName}${p.contactName ? ` (A/C ${p.contactName})` : ""}`, "",
    "*Diagnóstico digital*", c.diagnosis, "",
    c.problems.length ? "*Problemas identificados*\n" + c.problems.map((x) => `• ${x}`).join("\n") + "\n" : "",
    "*Solução recomendada*", c.solution, "",
    "*Funcionalidades*", ...c.features.map((x) => `• ${x}`), "",
    "*Investimento*", ...c.items.map((i) => `• ${i.name}: ${fmtMoney(i.price)}`), `Total: ${fmtMoney(total)}`, "",
    `*Prazo:* ${c.deadline}`, c.payment ? `*Pagamento:* ${c.payment}` : "", `Validade: ${c.validity_days} dias`, "",
    [p.seller.name, p.seller.company, p.seller.phone, p.seller.email].filter(Boolean).join(" · "),
  ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
}
