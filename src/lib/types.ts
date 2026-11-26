import type { DigitalStatus, LeadStatus, OpportunityLevel } from "./constants";

export interface Business {
  id: string;
  place_id: string | null;
  dedupe_key: string;
  name: string;
  category: string | null;
  primary_type: string | null;
  primary_type_label: string | null;
  types: string[];
  formatted_address: string | null;
  street: string | null;
  street_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  international_phone: string | null;
  google_maps_uri: string | null;
  osm_url: string | null;
  places_website_uri: string | null;
  rating: number | null;
  user_rating_count: number | null;
  business_status: string | null;
  opening_hours: { weekdayDescriptions?: string[]; osm?: string } | null;
  source: "openstreetmap" | "manual";
  digital_status: DigitalStatus;
  primary_website: string | null;
  has_own_site: boolean | null;
  site_online: boolean | null;
  site_https: boolean | null;
  site_has_location: boolean | null;
  site_mobile_ready: boolean | null;
  has_whatsapp: boolean | null;
  has_instagram: boolean | null;
  has_facebook: boolean | null;
  has_booking: boolean | null;
  has_menu: boolean | null;
  opportunity_level: OpportunityLevel | null;
  opportunity_score: number | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Check { value: boolean | null; evidence?: string; manual?: boolean }
export interface Source { name: string; url?: string; type: string; result: string; at: string }
export interface Audit {
  id: string;
  business_id: string;
  status: string;
  website_url: string | null;
  website_kind: string | null;
  checks: Record<string, Check>;
  sources: Source[];
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface Reason { kind: "fact" | "estimate"; text: string; weight: number }
export interface Opportunity {
  business_id: string;
  level: OpportunityLevel;
  score: number;
  reasons: Reason[];
  suggested_products: string[];
  updated_at: string;
}

export interface Website {
  id: string;
  business_id: string;
  url: string;
  final_url: string | null;
  domain: string | null;
  kind: "own_site" | "social" | "directory" | "marketplace" | "unknown";
  source: string;
  verified: boolean;
  verification_note: string | null;
  is_primary: boolean;
  is_online: boolean | null;
  https: boolean | null;
  last_checked_at: string | null;
  error: string | null;
}

export interface Contact { id: string; business_id: string; type: string; value: string; url: string | null; source: string }

export interface Lead {
  id: string;
  business_id: string;
  status: LeadStatus;
  position: number;
  potential_value: number | null;
  contact_name: string | null;
  next_follow_up: string | null;
  is_priority: boolean;
  lost_reason: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  businesses?: Business;
}

export interface LeadNote { id: string; lead_id: string; kind: string; content: string; created_at: string }
export interface LeadTask { id: string; lead_id: string; title: string; due_at: string | null; done: boolean; done_at: string | null; created_at: string }

export interface Search {
  id: string;
  country: string;
  city: string;
  state: string | null;
  neighborhood: string | null;
  categories: string[];
  custom_category: string | null;
  radius_km: number;
  max_results: number;
  digital_filter: string;
  status: "running" | "completed" | "failed";
  total_found: number;
  total_new: number;
  total_analyzed: number;
  api_calls: number;
  error: string | null;
  center_lat: number | null;
  center_lng: number | null;
  created_at: string;
  completed_at: string | null;
  batch_job_id: string | null;
}

export interface SearchResult { id: string; search_id: string; business_id: string; category: string; was_new: boolean; distance_km: number; created_at: string }

export interface Proposal {
  id: string;
  business_id: string | null;
  lead_id: string | null;
  template: string;
  title: string;
  contact_name: string | null;
  content: any;
  total_value: number;
  status: "draft" | "sent" | "accepted" | "rejected";
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPrompt { id: string; business_id: string | null; kind: string; title: string | null; content: string; created_at: string }
export interface Favorite { business_id: string; created_at: string }
export interface SavedFilter { id: string; name: string; filters: any; created_at: string }
export interface View { id: string; business_id: string; viewed_at: string }
export interface Activity { id: string; level: "info" | "warning" | "error" | "alert"; action: string; entity_type: string | null; entity_id: string | null; details: Record<string, any>; created_at: string }
export interface UsageRow { id: string; provider: string; endpoint: string; success: boolean; created_at: string }

export interface BatchJob {
  id: string;
  name: string;
  kind: "search" | "audit";
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  total_items: number;
  done_items: number;
  failed_items: number;
  found_count: number;
  analyzed_count: number;
  created_at: string;
  updated_at: string;
}
export interface BatchItem {
  id: string;
  batch_job_id: string;
  seq: number;
  payload: any;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  result: any;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface UserSettings {
  id: "me";
  seller_name: string | null;
  seller_email: string | null;
  seller_phone: string | null;
  seller_whatsapp: string | null;
  seller_company: string | null;
  seller_website: string | null;
  default_country: string;
  default_state: string | null;
  default_city: string | null;
  default_radius_km: number;
  default_max_results: number;
  auto_audit: boolean;
  proposal_validity_days: number;
  proposal_footer: string | null;
  alert_min_score: number;
  onboarded: boolean;
}
