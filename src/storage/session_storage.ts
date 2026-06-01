export type ContextualSession = {
  id: string;
  tool_id: string;
  source_url: string;
  page_title: string;
  selected_text: string;
  action_prompt?: string;
  provider_id?: string;
  model_id?: string;
  bot_name?: string;
  messages: ContextualMessage[];
  created_at: string;
  updated_at: string;
};

export type ContextualMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export type SaveSessionInput = Omit<ContextualSession, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

const SESSIONS_KEY = 'contextual_sessions';
export const ACTIVE_CHAT_SESSION_KEY = 'active_chat_session';

export async function get_sessions(): Promise<ContextualSession[]> {
  const sessions = await get_stored_sessions();
  return sessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function save_session(input: SaveSessionInput): Promise<ContextualSession> {
  const sessions = await get_stored_sessions();
  const now = new Date().toISOString();
  const existing_session = input.id
    ? sessions.find((session) => session.id === input.id)
    : undefined;
  const session: ContextualSession = {
    ...input,
    id: existing_session?.id ?? input.id ?? crypto.randomUUID(),
    created_at: existing_session?.created_at ?? now,
    updated_at: now
  };
  const next_sessions = [
    session,
    ...sessions.filter((stored_session) => stored_session.id !== session.id)
  ];

  await set_stored_sessions(next_sessions);
  return session;
}

export async function set_active_chat_session(session: ContextualSession): Promise<ContextualSession> {
  if (has_chrome_storage()) {
    await chrome.storage.local.set({
      [ACTIVE_CHAT_SESSION_KEY]: session
    });
    return session;
  }

  globalThis.localStorage?.setItem(ACTIVE_CHAT_SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function get_active_chat_session(): Promise<ContextualSession | null> {
  if (has_chrome_storage()) {
    const result = await chrome.storage.local.get(ACTIVE_CHAT_SESSION_KEY);
    return is_contextual_session(result[ACTIVE_CHAT_SESSION_KEY])
      ? result[ACTIVE_CHAT_SESSION_KEY]
      : null;
  }

  const stored_session = globalThis.localStorage?.getItem(ACTIVE_CHAT_SESSION_KEY);

  if (!stored_session) {
    return null;
  }

  try {
    const parsed_session = JSON.parse(stored_session);
    return is_contextual_session(parsed_session) ? parsed_session : null;
  } catch {
    return null;
  }
}

export async function delete_session(session_id: string): Promise<ContextualSession[]> {
  const sessions = await get_stored_sessions();
  await set_stored_sessions(sessions.filter((session) => session.id !== session_id));
  return get_sessions();
}

async function get_stored_sessions(): Promise<ContextualSession[]> {
  if (has_chrome_storage()) {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    return Array.isArray(result[SESSIONS_KEY]) ? result[SESSIONS_KEY] : [];
  }

  const stored_sessions = globalThis.localStorage?.getItem(SESSIONS_KEY);

  if (!stored_sessions) {
    return [];
  }

  try {
    const parsed_sessions = JSON.parse(stored_sessions);
    return Array.isArray(parsed_sessions) ? parsed_sessions : [];
  } catch {
    return [];
  }
}

async function set_stored_sessions(sessions: ContextualSession[]): Promise<void> {
  if (has_chrome_storage()) {
    await chrome.storage.local.set({
      [SESSIONS_KEY]: sessions
    });
    return;
  }

  globalThis.localStorage?.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function has_chrome_storage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function is_contextual_session(value: unknown): value is ContextualSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'messages' in value &&
    Array.isArray(value.messages)
  );
}
