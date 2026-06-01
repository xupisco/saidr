export type BuiltInPromptId = 'chat' | 'translate' | 'summarize' | 'explain' | 'rewrite';

export type StoredPrompt = {
  id: string;
  name: string;
  icon: string;
  content: string;
  show_in_toolbar: boolean;
  sort_order: number;
  is_built_in: boolean;
  created_at: string;
  updated_at: string;
};

const PROMPTS_KEY = 'custom_prompts';

export const BUILT_IN_PROMPTS: StoredPrompt[] = [
  {
    id: 'chat',
    name: 'Chat',
    icon: '🗨️',
    content: 'Use the selected text as context and answer the user question.',
    show_in_toolbar: true,
    sort_order: 0,
    is_built_in: true,
    created_at: '',
    updated_at: ''
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: '文',
    content: 'Translate the selected text to the configured target language. Keep meaning and tone.',
    show_in_toolbar: true,
    sort_order: 1,
    is_built_in: true,
    created_at: '',
    updated_at: ''
  },
  {
    id: 'summarize',
    name: 'Summarize',
    icon: '▣',
    content: 'Summarize the selected text clearly and concisely.',
    show_in_toolbar: true,
    sort_order: 2,
    is_built_in: true,
    created_at: '',
    updated_at: ''
  },
  {
    id: 'explain',
    name: 'Explain',
    icon: '?',
    content: 'Explain the selected text in clear language, preserving important details.',
    show_in_toolbar: true,
    sort_order: 3,
    is_built_in: true,
    created_at: '',
    updated_at: ''
  },
  {
    id: 'rewrite',
    name: 'Rewrite',
    icon: '✎',
    content: 'Rewrite the selected text while preserving the original meaning.',
    show_in_toolbar: true,
    sort_order: 4,
    is_built_in: true,
    created_at: '',
    updated_at: ''
  }
];

export async function get_prompts(): Promise<StoredPrompt[]> {
  const custom_prompts = normalize_prompts(await get_custom_prompts());
  const custom_built_ins = new Map(
    custom_prompts.filter((prompt) => prompt.is_built_in).map((prompt) => [prompt.id, prompt])
  );
  const built_in_prompts = BUILT_IN_PROMPTS.map((prompt) => custom_built_ins.get(prompt.id) ?? prompt);
  const user_prompts = custom_prompts.filter((prompt) => !prompt.is_built_in);

  return sort_prompts([...built_in_prompts, ...user_prompts]);
}

export async function create_prompt(
  input: Pick<StoredPrompt, 'name' | 'icon' | 'content' | 'show_in_toolbar'>
): Promise<StoredPrompt[]> {
  const now = new Date().toISOString();
  const custom_prompts = normalize_prompts(await get_custom_prompts());
  const prompt: StoredPrompt = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    icon: input.icon.trim() || '•',
    content: input.content.trim(),
    show_in_toolbar: input.show_in_toolbar,
    sort_order: get_next_sort_order(custom_prompts),
    is_built_in: false,
    created_at: now,
    updated_at: now
  };

  await save_custom_prompts([...custom_prompts, prompt]);
  return get_prompts();
}

export async function update_prompt(
  prompt_id: string,
  input: Pick<StoredPrompt, 'name' | 'icon' | 'content' | 'show_in_toolbar'>
): Promise<StoredPrompt[]> {
  const now = new Date().toISOString();
  const prompts = await get_prompts();
  const updated_prompt = prompts.find((prompt) => prompt.id === prompt_id);

  if (!updated_prompt) {
    return prompts;
  }

  const next_prompt: StoredPrompt = {
    ...updated_prompt,
    name: input.name.trim(),
    icon: input.icon.trim() || '•',
    content: input.content.trim(),
    show_in_toolbar: input.show_in_toolbar,
    updated_at: now
  };
  const custom_prompts = normalize_prompts(await get_custom_prompts());
  const next_custom_prompts = [
    ...custom_prompts.filter((prompt) => prompt.id !== prompt_id),
    next_prompt
  ];

  await save_custom_prompts(next_custom_prompts);
  return get_prompts();
}

export async function delete_prompt(prompt_id: string): Promise<StoredPrompt[]> {
  const custom_prompts = normalize_prompts(await get_custom_prompts());
  await save_custom_prompts(custom_prompts.filter((prompt) => prompt.id !== prompt_id));
  return get_prompts();
}

export async function move_prompt(prompt_id: string, direction: 'up' | 'down'): Promise<StoredPrompt[]> {
  const prompts = await get_prompts();
  const current_index = prompts.findIndex((prompt) => prompt.id === prompt_id);
  const target_index = direction === 'up' ? current_index - 1 : current_index + 1;

  if (current_index < 0 || target_index < 0 || target_index >= prompts.length) {
    return prompts;
  }

  const reordered_prompts = [...prompts];
  const current_prompt = reordered_prompts[current_index];
  reordered_prompts[current_index] = reordered_prompts[target_index];
  reordered_prompts[target_index] = current_prompt;

  const now = new Date().toISOString();
  const next_prompts = reordered_prompts.map((prompt, index) => ({
    ...prompt,
    sort_order: index,
    updated_at: now
  }));

  await save_custom_prompts(next_prompts);
  return get_prompts();
}

async function get_custom_prompts(): Promise<StoredPrompt[]> {
  if (has_chrome_storage()) {
    const result = await chrome.storage.local.get(PROMPTS_KEY);
    return Array.isArray(result[PROMPTS_KEY]) ? result[PROMPTS_KEY] : [];
  }

  const stored_prompts = globalThis.localStorage?.getItem(PROMPTS_KEY);

  if (!stored_prompts) {
    return [];
  }

  try {
    const parsed_prompts = JSON.parse(stored_prompts);
    return Array.isArray(parsed_prompts) ? parsed_prompts : [];
  } catch {
    return [];
  }
}

async function save_custom_prompts(prompts: StoredPrompt[]): Promise<void> {
  if (has_chrome_storage()) {
    await chrome.storage.local.set({
      [PROMPTS_KEY]: prompts
    });
    return;
  }

  globalThis.localStorage?.setItem(PROMPTS_KEY, JSON.stringify(prompts));
}

function has_chrome_storage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function normalize_prompts(prompts: StoredPrompt[]): StoredPrompt[] {
  return prompts.map((prompt) => {
    const built_in_prompt = BUILT_IN_PROMPTS.find((candidate) => candidate.id === prompt.id);

    return {
      ...prompt,
      icon: prompt.icon ?? built_in_prompt?.icon ?? '•',
      show_in_toolbar: prompt.show_in_toolbar ?? built_in_prompt?.show_in_toolbar ?? false,
      sort_order: prompt.sort_order ?? built_in_prompt?.sort_order ?? 999
    };
  });
}

function sort_prompts(prompts: StoredPrompt[]): StoredPrompt[] {
  return [...prompts].sort((a, b) => a.sort_order - b.sort_order);
}

function get_next_sort_order(prompts: StoredPrompt[]): number {
  const highest_sort_order = prompts.reduce((highest, prompt) => Math.max(highest, prompt.sort_order ?? -1), -1);
  return highest_sort_order + 1;
}
