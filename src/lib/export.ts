// Exportação de dados: CSV, Excel (XLSX) e PDF.
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Business } from "./types";
import { DIGITAL_STATUS, OPPORTUNITY } from "./constants";

export type Row = Record<string, string | number | null>;

export function businessRows(list: Business[]): Row[] {
  const yn = (v: boolean | null) => (v === true ? "Sim" : v === false ? "Não identificado" : "Não verificado");
  return list.map((b) => ({
    Nome: b.name,
    Categoria: b.category,
    Endereço: b.formatted_address,
    Bairro: b.neighborhood,
    Cidade: b.city,
    UF: b.state,
    CEP: b.postal_code,
    Telefone: b.phone,
    Site: b.primary_website ?? (b.digital_status === "no_site" ? "Não identificado" : b.places_website_uri),
    "Presença digital": DIGITAL_STATUS[b.digital_status]?.label ?? b.digital_status,
    "Site online": yn(b.site_online),
    HTTPS: yn(b.site_https),
    "Localização no site": yn(b.site_has_location),
    WhatsApp: yn(b.has_whatsapp),
    Instagram: yn(b.has_instagram),
    Agendamento: yn(b.has_booking),
    Cardápio: yn(b.has_menu),
    Avaliação: b.rating,
    "Nº avaliações": b.user_rating_count,
    Oportunidade: b.opportunity_level ? OPPORTUNITY[b.opportunity_level].label : "Não classificado",
    Pontuação: b.opportunity_score,
    Latitude: b.lat,
    Longitude: b.lng,
    "Google Maps": b.google_maps_uri,
    "Analisado em": b.analyzed_at ? new Date(b.analyzed_at).toLocaleString("pt-BR") : null,
  }));
}

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportCSV(rows: Row[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // proteção contra injeção de fórmulas
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join("\n");
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), filename.endsWith(".csv") ? filename : filename + ".csv");
}

export function exportXLSX(sheets: { name: string; rows: Row[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Info: "Sem dados" }]);
    ws["!cols"] = Object.keys(s.rows[0] ?? { Info: 1 }).map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}

export function pdfHeader(doc: jsPDF, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(8, 9, 12);
  doc.rect(0, 0, w, 64, "F");
  doc.setFillColor(198, 244, 50);
  doc.circle(36, 32, 10, "F");
  doc.setFillColor(8, 9, 12);
  doc.circle(36, 32, 5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("RADAR LOCAL PRO", 56, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(198, 244, 50);
  doc.text("Encontre negócios. Identifique oportunidades. Conquiste clientes.", 56, 44);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 32, 96);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 32, 112);
  }
}

export function exportPDFTable(title: string, rows: Row[], columns: string[], filename: string, subtitle?: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pdfHeader(doc, title, subtitle ?? `Gerado em ${new Date().toLocaleString("pt-BR")} · ${rows.length} registros`);
  autoTable(doc, {
    startY: 126,
    head: [columns],
    body: rows.map((r) => columns.map((c) => (r[c] == null ? "" : String(r[c])))),
    styles: { fontSize: 7.5, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [17, 20, 26], textColor: [198, 244, 50] },
    alternateRowStyles: { fillColor: [245, 247, 240] },
    margin: { left: 32, right: 32 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`RADAR LOCAL PRO · página ${doc.getNumberOfPages()}`, 32, h - 16);
    },
  });
  doc.save(filename.endsWith(".pdf") ? filename : filename + ".pdf");
}
