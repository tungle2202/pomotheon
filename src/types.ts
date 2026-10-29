export interface Person {
  id: string;
  name: string;
  title: string | null;
  quote: string | null;
  image_path: string | null;
  respect_count: number;
  created_at: string;
  has_detail: boolean;
}

export type LedgerType = 'earn' | 'spend';

export interface LedgerEntry {
  id: string;
  type: LedgerType;
  amount: number;
  person_id: string | null;
  created_at: string;
}

export interface Settings {
  focus_duration_minutes: number;
  short_break_duration_minutes: number;
  long_break_duration_minutes: number;
  sessions_before_long_break: number;
  points_per_focus_minute: number;
  respect_cost: number;
  theme: 'system' | 'light' | 'dark';
}

export interface AppStateSummary {
  persons: Person[];
  balance: number;
  settings: Settings;
  total_earned: number;
  total_spent: number;
  data_directory: string;
}

export interface CreatePersonInput {
  name: string;
  title?: string | null;
  quote?: string | null;
  detail?: string | null;
  image_base64?: string | null;
  image_extension?: string | null;
}

export interface UpdatePersonInput {
  id: string;
  name: string;
  title?: string | null;
  quote?: string | null;
  detail?: string | null;
  image_base64?: string | null;
  image_extension?: string | null;
  remove_image: boolean;
}

export type TimerMode = 'focus' | 'short_break' | 'long_break';
export type TimerStatus = 'idle' | 'running' | 'paused';
