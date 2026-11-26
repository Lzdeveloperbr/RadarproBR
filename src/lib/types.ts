import type { DigitalStatus, LeadStatus, OpportunityLevel } from "./constants";

export interface Business {
  id: string;
  organization_id: string;
  place_id: string | null;
  name: string;
  category: string | null;
  primary_type: string | null;
  primary_type_label: string | null;
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
  places_website_uri: string | null;
  rating: number | null;
  user_rating_count: number | null;
  business_status: string | null;
  opening_hours: { weekdayDescriptions?: string[]; openNow?: boolean } | null;
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

export interface Check { value: boolean | null; evidence?: string }
export interface Audit {
  id: string;
  business_id: string;
  status: string;
  website_url: string | null;
  website_kind: string | null;
  checks: Record<string, Check>;
  location: any;
  sources: { name: string; url?: string; type: string; result: string; at: string }[];
  robots_allowed: boolean | null;
  pages_analyzed: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface Opportunity {
  business_id: string;
  level: OpportunityLevel;
  score: number;
  reasons: { kind: "fact" | "estimate"; text: string; weight: number }[];
  suggested_products: string[];
}

export interface Lead {
  id: string;
  organization_id: string;
  business_id: string;
  status: LeadStatus;
  position: number;
  potential_value: number | null;
  contact_name: string | null;
  next_follow_up: string | null;
  is_priority: boolean;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  businesses?: Business;
}

export interface Search {
  id: string;
  city: string;
  state: string | null;
  neighborhood: string | null;
  categories: string[];
  radius_km: number;
  max_results: number;
  digital_filter: string;
  status: string;
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

export interface UserSettings {
  user_id: string;
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
  use_web_search: boolean;
  proposal_validity_days: number;
  proposal_footer: string | null;
  alert_min_score: number;
}
