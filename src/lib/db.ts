// Banco de dados LOCAL (IndexedDB via Dexie). Tudo fica no navegador do usuário:
// sem servidor, sem login e sem configuração. Backup/restauração em JSON na página "Dados e backup".
import Dexie, { type Table } from "dexie";
import type {
  Activity, Audit, BatchItem, BatchJob, Business, Contact, Favorite, GeneratedPrompt, Lead, LeadNote, LeadTask,
  Opportunity, Proposal, SavedFilter, Search, SearchResult, UsageRow, UserSettings, View, Website,
} from "./types";

export class RadarDB extends Dexie {
  businesses!: Table<Business, string>;
  searches!: Table<Search, string>;
  search_results!: Table<SearchResult, string>;
  websites!: Table<Website, string>;
  contacts!: Table<Contact, string>;
  audits!: Table<Audit, string>;
  opportunities!: Table<Opportunity, string>;
  leads!: Table<Lead, string>;
  lead_notes!: Table<LeadNote, string>;
  lead_tasks!: Table<LeadTask, string>;
  proposals!: Table<Proposal, string>;
  prompts!: Table<GeneratedPrompt, string>;
  favorites!: Table<Favorite, string>;
  saved_filters!: Table<SavedFilter, string>;
  views!: Table<View, string>;
  activity!: Table<Activity, string>;
  usage!: Table<UsageRow, string>;
  batch_jobs!: Table<BatchJob, string>;
  batch_items!: Table<BatchItem, string>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super("radar-local-pro");
    this.version(1).stores({
      businesses: "id, &place_id, &dedupe_key, city, category, digital_status, opportunity_level, opportunity_score, created_at",
      searches: "id, created_at, batch_job_id",
      search_results: "id, search_id, business_id, [search_id+business_id]",
      websites: "id, business_id, domain, kind, [business_id+url]",
      contacts: "id, business_id, [business_id+type+value]",
      audits: "id, business_id, created_at",
      opportunities: "business_id, level",
      leads: "id, &business_id, status, next_follow_up",
      lead_notes: "id, lead_id, created_at",
      lead_tasks: "id, lead_id, done, due_at",
      proposals: "id, business_id, created_at",
      prompts: "id, business_id, created_at",
      favorites: "business_id",
      saved_filters: "id",
      views: "id, business_id, viewed_at",
      activity: "id, created_at",
      usage: "id, provider, created_at",
      batch_jobs: "id, status, created_at",
      batch_items: "id, batch_job_id, status, [batch_job_id+status]",
      settings: "id",
    });
  }
}

export const db = new RadarDB();

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const nowIso = () => new Date().toISOString();

export const DEFAULT_SETTINGS: UserSettings = {
  id: "me", seller_name: null, seller_email: null, seller_phone: null, seller_whatsapp: null, seller_company: null, seller_website: null,
  default_country: "Brasil", default_state: null, default_city: null, default_radius_km: 10, default_max_results: 60, auto_audit: true,
  proposal_validity_days: 15, proposal_footer: null, alert_min_score: 70, onboarded: false,
  google_api_key: null, tomtom_api_key: null, search_source: "auto", google_max_grid: 3,
};

export async function getSettings(): Promise<UserSettings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get("me")) ?? {}) };
}

export async function logActivity(action: string, entity: { type?: string; id?: string } = {}, details: Record<string, any> = {}, level: Activity["level"] = "info") {
  await db.activity.add({ id: uid(), level, action, entity_type: entity.type ?? null, entity_id: entity.id ?? null, details, created_at: nowIso() });
}

export async function recordUsage(provider: string, endpoint: string, success = true) {
  await db.usage.add({ id: uid(), provider, endpoint, success, created_at: nowIso() });
}

/** Atualiza o lead com histórico automático de mudança de status (equivalente ao trigger do banco). */
export async function updateLead(id: string, patch: Partial<Lead>) {
  const lead = await db.leads.get(id);
  if (!lead) throw new Error("Lead não encontrado");
  const next = { ...patch, updated_at: nowIso() } as Partial<Lead>;
  if (patch.status && patch.status !== lead.status) {
    const { leadStatusLabel } = await import("./constants");
    await db.lead_notes.add({ id: uid(), lead_id: id, kind: "status_change", content: `Status alterado de ${leadStatusLabel(lead.status)} para ${leadStatusLabel(patch.status)}`, created_at: nowIso() });
    if (patch.status === "fechado") next.closed_at = nowIso();
  }
  await db.leads.update(id, next);
}

export async function ensureLead(businessId: string, status: Lead["status"] = "novo"): Promise<Lead> {
  const existing = await db.leads.where("business_id").equals(businessId).first();
  if (existing) return existing;
  const lead: Lead = { id: uid(), business_id: businessId, status, position: 0, potential_value: null, contact_name: null, next_follow_up: null,
    is_priority: false, lost_reason: null, closed_at: null, created_at: nowIso(), updated_at: nowIso() };
  await db.leads.add(lead);
  return lead;
}

/** Exclusão completa de um estabelecimento e dados relacionados (LGPD). */
export async function deleteBusiness(id: string) {
  await db.transaction("rw", [db.businesses, db.search_results, db.websites, db.contacts, db.audits, db.opportunities, db.leads, db.lead_notes, db.lead_tasks, db.prompts, db.favorites, db.views], async () => {
    const leads = await db.leads.where("business_id").equals(id).toArray();
    for (const l of leads) {
      await db.lead_notes.where("lead_id").equals(l.id).delete();
      await db.lead_tasks.where("lead_id").equals(l.id).delete();
    }
    await db.leads.where("business_id").equals(id).delete();
    for (const t of [db.search_results, db.websites, db.contacts, db.audits, db.prompts, db.views]) await (t as Table<any, string>).where("business_id").equals(id).delete();
    await db.opportunities.delete(id);
    await db.favorites.delete(id);
    await db.businesses.delete(id);
  });
}

const BACKUP_TABLES = ["businesses", "searches", "search_results", "websites", "contacts", "audits", "opportunities", "leads", "lead_notes", "lead_tasks",
  "proposals", "prompts", "favorites", "saved_filters", "views", "activity", "batch_jobs", "batch_items", "settings"] as const;

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) data[t] = await (db as any)[t].toArray();
  return new Blob([JSON.stringify({ app: "radar-local-pro", version: 1, exported_at: nowIso(), data })], { type: "application/json" });
}

export async function importBackup(file: File, mode: "merge" | "replace") {
  const json = JSON.parse(await file.text());
  if (json?.app !== "radar-local-pro" || !json.data) throw new Error("Arquivo de backup inválido");
  await db.transaction("rw", BACKUP_TABLES.map((t) => (db as any)[t]), async () => {
    for (const t of BACKUP_TABLES) {
      const table = (db as any)[t] as Table<any, any>;
      if (mode === "replace") await table.clear();
      const rows = Array.isArray(json.data[t]) ? json.data[t] : [];
      if (rows.length) await table.bulkPut(rows);
    }
  });
}

export async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()));
}
