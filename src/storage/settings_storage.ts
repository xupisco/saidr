import { settings_schema } from '../validators/settings_validator';

export type ThemePreference = 'system' | 'saidr' | 'light' | 'dark' | 'corporate' | 'business' | 'dracula';

export type ProviderPreference = 'openai' | 'ollama' | 'lm_studio';

export type AppSettings = {
  theme: ThemePreference;
  openai_api_key?: string;
  ollama_base_url: string;
  lm_studio_base_url: string;
  global_prompt: string;
  save_history: boolean;
  panel_position_x: number;
  panel_position_y: number;
  panel_width: number;
  panel_height: number;
};

const SETTINGS_KEY = 'app_settings';

export const THEME_OPTIONS: ThemePreference[] = [
  'system',
  'business',
  'saidr',
  'light',
  'dark',
  'corporate',
  'dracula'
];

export const PROVIDER_OPTIONS: ProviderPreference[] = ['openai', 'ollama', 'lm_studio'];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'saidr',
  openai_api_key: '',
  ollama_base_url: 'http://localhost:11434',
  lm_studio_base_url: 'http://localhost:1234/v1',
  global_prompt: '',
  save_history: true,
  panel_position_x: 24,
  panel_position_y: 24,
  panel_width: 420,
  panel_height: 560
};

export function resolve_theme(theme: ThemePreference): Exclude<ThemePreference, 'system'> {
  if (theme !== 'system') {
    return theme;
  }

  if (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

export async function get_settings(): Promise<AppSettings> {
  const stored_settings = await get_stored_settings();
  const parsed_settings = settings_schema.safeParse({
    ...DEFAULT_SETTINGS,
    ...stored_settings
  });

  if (!parsed_settings.success) {
    return DEFAULT_SETTINGS;
  }

  return parsed_settings.data;
}

export async function save_settings(settings: AppSettings): Promise<AppSettings> {
  const parsed_settings = settings_schema.parse(settings);

  if (has_chrome_storage()) {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: parsed_settings
    });

    return parsed_settings;
  }

  globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(parsed_settings));

  return parsed_settings;
}

export async function reset_settings(): Promise<AppSettings> {
  return save_settings(DEFAULT_SETTINGS);
}

async function get_stored_settings(): Promise<Partial<AppSettings>> {
  if (has_chrome_storage()) {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    return result[SETTINGS_KEY] ?? {};
  }

  const stored_settings = globalThis.localStorage?.getItem(SETTINGS_KEY);

  if (!stored_settings) {
    return {};
  }

  try {
    return JSON.parse(stored_settings) as Partial<AppSettings>;
  } catch {
    return {};
  }
}

function has_chrome_storage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
