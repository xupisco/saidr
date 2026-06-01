import type { ProviderPreference } from './settings_storage';

export type BotPreset = {
  id: string;
  name: string;
  provider_id: ProviderPreference;
  model_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const BOTS_KEY = 'bot_presets';

export const DEFAULT_BOTS: BotPreset[] = [
  {
    id: 'default-openai',
    name: 'OpenAI',
    provider_id: 'openai',
    model_id: '',
    is_default: true,
    created_at: '',
    updated_at: ''
  }
];

export async function get_bots(): Promise<BotPreset[]> {
  const stored_bots = await get_stored_bots();
  return stored_bots.length > 0 ? stored_bots : DEFAULT_BOTS;
}

export async function create_bot(input: Pick<BotPreset, 'name' | 'provider_id' | 'model_id'>): Promise<BotPreset[]> {
  const bots = await get_bots();
  const now = new Date().toISOString();
  const bot: BotPreset = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    provider_id: input.provider_id,
    model_id: input.model_id.trim(),
    is_default: bots.length === 0,
    created_at: now,
    updated_at: now
  };

  await save_bots([...bots, bot]);
  return get_bots();
}

export async function delete_bot(bot_id: string): Promise<BotPreset[]> {
  const bots = await get_bots();
  const remaining_bots = bots.filter((bot) => bot.id !== bot_id);

  if (remaining_bots.length > 0 && !remaining_bots.some((bot) => bot.is_default)) {
    remaining_bots[0] = {
      ...remaining_bots[0],
      is_default: true,
      updated_at: new Date().toISOString()
    };
  }

  await save_bots(remaining_bots);
  return get_bots();
}

export async function set_default_bot(bot_id: string): Promise<BotPreset[]> {
  const now = new Date().toISOString();
  const bots = await get_bots();
  const next_bots = bots.map((bot) => ({
    ...bot,
    is_default: bot.id === bot_id,
    updated_at: bot.id === bot_id ? now : bot.updated_at
  }));

  await save_bots(next_bots);
  return get_bots();
}

async function get_stored_bots(): Promise<BotPreset[]> {
  if (has_chrome_storage()) {
    const result = await chrome.storage.local.get(BOTS_KEY);
    return Array.isArray(result[BOTS_KEY]) ? result[BOTS_KEY] : [];
  }

  const stored_bots = globalThis.localStorage?.getItem(BOTS_KEY);

  if (!stored_bots) {
    return [];
  }

  try {
    const parsed_bots = JSON.parse(stored_bots);
    return Array.isArray(parsed_bots) ? parsed_bots : [];
  } catch {
    return [];
  }
}

async function save_bots(bots: BotPreset[]): Promise<void> {
  if (has_chrome_storage()) {
    await chrome.storage.local.set({
      [BOTS_KEY]: bots
    });
    return;
  }

  globalThis.localStorage?.setItem(BOTS_KEY, JSON.stringify(bots));
}

function has_chrome_storage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}
