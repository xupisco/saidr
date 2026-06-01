import type { ProviderCompletionChunk } from '../types/provider_messages';
import type { ToolbarAction } from './floating_toolbar';
import { attach_panel_drag, type PanelPosition } from './panel_drag';
import { attach_panel_resize, type PanelSize } from './panel_resize';
import type { SelectionSnapshot } from './selection_detector';
import { create_shadow_host } from './shadow_root';

export type FloatingPanelState = 'closed' | 'open' | 'minimized';

type FloatingPanelOpenInput = {
  tool_id: ToolbarAction;
  selection: SelectionSnapshot;
};

type PanelMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  bot_name?: string;
  model_id?: string;
  thinking_content?: string;
  is_thinking_open?: boolean;
  is_loading?: boolean;
};

type BotPreset = {
  id: string;
  name: string;
  provider_id: 'openai' | 'ollama' | 'lm_studio';
  model_id: string;
  is_default: boolean;
};

type StoredPrompt = {
  id: string;
  name: string;
  icon?: string;
  content: string;
  show_in_toolbar?: boolean;
};

type ContextualSession = {
  id: string;
  tool_id: string;
  source_url: string;
  page_title: string;
  selected_text: string;
  action_prompt?: string;
  provider_id?: string;
  model_id?: string;
  bot_name?: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
};

type AppSettings = {
  save_history: boolean;
};

type SaveSessionPayload = Omit<ContextualSession, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

type RuntimeResponse<T> =
  | {
      status: 'ok';
      payload: T;
    }
  | {
      status: 'error';
      message: string;
    };

type RenderOptions = {
  stick_to_bottom?: boolean;
};

type MessagesScrollState = {
  scroll_top: number;
  is_near_bottom: boolean;
};

export type FloatingAiPanel = {
  open: (input: FloatingPanelOpenInput) => Promise<void>;
  close: () => void;
};

const PANEL_HOST_ID = 'saidr-floating-ai-panel-host';
const PANEL_LAYOUT_KEY = 'floating_panel_layout';
const BOTS_KEY = 'bot_presets';
const PROMPTS_KEY = 'custom_prompts';
const PANEL_WIDTH = 548;
const PANEL_HEIGHT = 392;
const MIN_PANEL_WIDTH = 360;
const MIN_PANEL_HEIGHT = 260;
const VIEWPORT_MARGIN = 16;

type PanelLayout = PanelPosition & PanelSize;

const DEFAULT_BOTS: BotPreset[] = [
  {
    id: 'default-openai',
    name: 'OpenAI',
    provider_id: 'openai',
    model_id: '',
    is_default: true
  }
];

const BUILT_IN_PROMPTS: StoredPrompt[] = [
  {
    id: 'chat',
    name: 'Chat',
    icon: '🗨️',
    content: 'Use the selected text as context and answer the user question.'
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: '文',
    content: 'Translate the selected text to the configured target language. Keep meaning and tone.'
  },
  {
    id: 'summarize',
    name: 'Summarize',
    icon: '▣',
    content: 'Summarize the selected text clearly and concisely.'
  },
  {
    id: 'explain',
    name: 'Explain',
    icon: '?',
    content: 'Explain the selected text in clear language, preserving important details.'
  },
  {
    id: 'rewrite',
    name: 'Rewrite',
    icon: '✎',
    content: 'Rewrite the selected text while preserving the original meaning.'
  }
];

export function create_floating_ai_panel(): FloatingAiPanel {
  const shadow_root = create_shadow_host(PANEL_HOST_ID);
  const panel = document.createElement('section');
  let state: FloatingPanelState = 'closed';
  let bots: BotPreset[] = [];
  let prompts: StoredPrompt[] = [];
  let messages: PanelMessage[] = [];
  let current_selection: SelectionSnapshot | null = null;
  let current_tool_id: ToolbarAction = 'chat';
  let current_session_id = '';
  let last_request_prompt = '';
  let selected_bot_id = '';
  let panel_layout: PanelLayout = {
    x: VIEWPORT_MARGIN,
    y: VIEWPORT_MARGIN,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT
  };
  let detach_drag: (() => void) | null = null;
  let detach_resize: (() => void) | null = null;

  shadow_root.innerHTML = '';
  shadow_root.appendChild(create_style_element());
  shadow_root.appendChild(panel);

  panel.className = 'saidr-panel';
  panel.hidden = true;

  async function open(input: FloatingPanelOpenInput) {
    state = 'open';
    current_selection = input.selection;
    current_tool_id = input.tool_id;
    current_session_id = '';
    last_request_prompt = '';
    messages = [];
    await load_panel_options();
    panel_layout = await get_panel_layout(input.selection);
    render();
    panel.hidden = false;
    apply_panel_layout();

    if (input.tool_id !== 'chat') {
      await run_tool_prompt();
    }
  }

  function close() {
    state = 'closed';
    current_selection = null;
    messages = [];
    panel.hidden = true;
  }

  async function load_panel_options() {
    [bots, prompts] = await Promise.all([get_content_bots(), get_content_prompts()]);
    selected_bot_id = bots.find((bot) => bot.is_default)?.id ?? bots[0]?.id ?? '';
  }

  function render(options: RenderOptions = {}) {
    const selected_bot = get_selected_bot();
    const scroll_state = get_messages_scroll_state();
    const stick_to_bottom = options.stick_to_bottom ?? scroll_state.is_near_bottom;

    panel.innerHTML = `
      <header class="saidr-panel-header">
        <button class="saidr-drag-handle" type="button" aria-label="Move panel">☰</button>
        <strong>${escape_html(get_tool_label(current_tool_id, prompts))}</strong>
        <select class="saidr-bot-select" aria-label="Bot">
          ${bots.map((bot) => `
            <option value="${escape_html(bot.id)}" ${bot.id === selected_bot_id ? 'selected' : ''}>
              ${escape_html(bot.name)}
            </option>
          `).join('')}
        </select>
        <button class="saidr-icon-button" type="button" data-action="minimize" aria-label="Minimize">_</button>
        <button class="saidr-icon-button" type="button" data-action="close" aria-label="Close">×</button>
      </header>

      <div class="saidr-panel-body" ${state === 'minimized' ? 'hidden' : ''}>
        <details class="saidr-selection-preview" open>
          <summary>Selected text</summary>
          <p>${escape_html(truncate_text(current_selection?.text ?? '', 420))}</p>
        </details>
        <div class="saidr-messages">
          ${render_messages()}
        </div>
      </div>

      <form class="saidr-panel-footer" ${state === 'minimized' ? 'hidden' : ''}>
        <textarea class="saidr-follow-up" placeholder="Ask follow-up..."></textarea>
        <button class="saidr-send-button" type="submit">Send</button>
        <div class="saidr-response-actions">
          <button class="saidr-action-button" type="button" data-action="copy-response">Copy</button>
          <button class="saidr-action-button" type="button" data-action="regenerate">Regenerate</button>
          <button class="saidr-action-button" type="button" data-action="save-session">Save</button>
          <button class="saidr-action-button" type="button" data-action="open-sidebar">Open in Sidebar</button>
        </div>
      </form>
      <button class="saidr-resize-handle" type="button" aria-label="Resize panel"></button>
    `;

    detach_drag?.();
    detach_resize?.();
    panel.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener('click', close);
    panel.querySelector<HTMLButtonElement>('[data-action="minimize"]')?.addEventListener('click', toggle_minimized);
    panel.querySelector<HTMLButtonElement>('[data-action="copy-response"]')?.addEventListener('click', copy_last_response);
    panel.querySelector<HTMLButtonElement>('[data-action="save-session"]')?.addEventListener('click', () => {
      save_current_session().catch(() => {
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Não foi possível salvar a sessão.'
          }
        ];
        render({ stick_to_bottom: true });
      });
    });
    panel.querySelector<HTMLButtonElement>('[data-action="regenerate"]')?.addEventListener('click', () => {
      regenerate_last_response().catch(() => {
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Não foi possível regenerar a resposta.'
          }
        ];
        render({ stick_to_bottom: true });
      });
    });
    panel.querySelector<HTMLButtonElement>('[data-action="open-sidebar"]')?.addEventListener('click', () => {
      open_current_session_in_sidebar().catch(() => {
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Não foi possível abrir a sessão no sidebar.'
          }
        ];
        render({ stick_to_bottom: true });
      });
    });
    panel.querySelector<HTMLSelectElement>('.saidr-bot-select')?.addEventListener('change', (event) => {
      selected_bot_id = (event.target as HTMLSelectElement).value;
      render();
    });
    panel.querySelector<HTMLFormElement>('.saidr-panel-footer')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const textarea = panel.querySelector<HTMLTextAreaElement>('.saidr-follow-up');
      const prompt = textarea?.value.trim() ?? '';

      if (!prompt) {
        return;
      }

      if (textarea) {
        textarea.value = '';
      }

      await send_prompt(prompt);
    });
    panel.querySelector<HTMLTextAreaElement>('.saidr-follow-up')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();
      panel.querySelector<HTMLFormElement>('.saidr-panel-footer')?.requestSubmit();
    });
    attach_interactions();
    restore_messages_scroll(scroll_state, stick_to_bottom);
  }

  function render_messages(): string {
    if (messages.length === 0) {
      return '<p class="saidr-empty">Choose a bot and ask a follow-up.</p>';
    }

    return messages.map((message) => {
      const meta = message.role === 'assistant' && message.model_id
        ? `<small>${escape_html(message.bot_name ? `${message.bot_name} · ${message.model_id}` : message.model_id)}</small>`
        : '';
      const thinking = message.role === 'assistant'
        ? `
          <details class="saidr-thinking" data-message-thinking ${message.thinking_content ? '' : 'hidden'} ${message.is_thinking_open ? 'open' : ''}>
            <summary>Thinking</summary>
            <p data-message-thinking-content>${escape_html(message.thinking_content ?? '')}</p>
          </details>
        `
        : '';
      const loading = message.role === 'assistant'
        ? `
          <div class="saidr-loading" data-message-loading ${message.is_loading && !message.content ? '' : 'hidden'}>
            <span></span>
            <span>Thinking...</span>
          </div>
        `
        : '';

      return `
        <article class="saidr-message saidr-message-${message.role}" data-message-id="${escape_attribute(message.id)}">
          <div class="saidr-message-heading">
            <span>${message.role === 'user' ? 'You' : 'Assistant'}</span>
            ${meta}
          </div>
          ${thinking}
          ${loading}
          <div class="saidr-message-markdown" data-message-content>${render_markdown(message.content)}</div>
        </article>
      `;
    }).join('');
  }

  function toggle_minimized() {
    state = state === 'minimized' ? 'open' : 'minimized';
    render();
  }

  async function run_tool_prompt() {
    const prompt = prompts.find((stored_prompt) => stored_prompt.id === current_tool_id);
    const selected_text = current_selection?.text ?? '';
    const prompt_content = prompt?.content ?? 'Use the selected text as context.';

    await send_prompt(`${prompt_content}\n\nSelected text:\n${selected_text}`, false);
  }

  async function send_prompt(prompt: string, include_user_message = true) {
    const selected_bot = get_selected_bot();

    if (!selected_bot?.model_id) {
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Configure a bot with provider and model before sending prompts.'
        }
      ];
      render({ stick_to_bottom: true });
      return;
    }

    if (include_user_message) {
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: prompt
        }
      ];
    }

    const assistant_message: PanelMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      bot_name: selected_bot.name,
      model_id: selected_bot.model_id,
      thinking_content: '',
      is_thinking_open: true,
      is_loading: true
    };

    messages = [
      ...messages,
      assistant_message
    ];
    render({ stick_to_bottom: true });

    const request_prompt = build_contextual_prompt(prompt);
    last_request_prompt = prompt;

    try {
      await stream_completion({
        provider_id: selected_bot.provider_id,
        model_id: selected_bot.model_id,
        prompt: request_prompt,
        message_id: assistant_message.id
      });
      await auto_save_current_session();
    } catch (error: unknown) {
      update_message(assistant_message.id, {
        content: error instanceof Error ? error.message : 'Não foi possível gerar a resposta.',
        is_loading: false,
        is_thinking_open: false
      });
    }
  }

  function stream_completion(input: {
    provider_id: BotPreset['provider_id'];
    model_id: string;
    prompt: string;
    message_id: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({
        name: 'saidr:provider:stream'
      });

      port.onMessage.addListener((message: { type: string; payload?: unknown }) => {
        if (message.type === 'saidr:provider:stream:chunk') {
          append_stream_chunk(input.message_id, message.payload as ProviderCompletionChunk);
          return;
        }

        if (message.type === 'saidr:provider:stream:done') {
          update_message(input.message_id, {
            is_loading: false,
            is_thinking_open: false
          });
          port.disconnect();
          resolve();
          return;
        }

        if (message.type === 'saidr:provider:stream:error') {
          port.disconnect();
          reject(new Error(get_stream_error_message(message.payload)));
        }
      });

      port.postMessage({
        type: 'saidr:provider:stream:start',
        payload: {
          provider_id: input.provider_id,
          model_id: input.model_id,
          prompt: input.prompt
        }
      });
    });
  }

  function append_stream_chunk(message_id: string, chunk: ProviderCompletionChunk) {
    const message = messages.find((item) => item.id === message_id);

    if (!message) {
      return;
    }

    if (chunk.type === 'thinking_delta') {
      update_message(message_id, {
        thinking_content: `${message.thinking_content ?? ''}${chunk.text}`,
        is_thinking_open: true
      });
      return;
    }

    update_message(message_id, {
      content: `${message.content}${chunk.text}`
    });
  }

  function update_message(message_id: string, patch: Partial<PanelMessage>) {
    const scroll_state = get_messages_scroll_state();
    const stick_to_bottom = scroll_state.is_near_bottom;
    let updated_message: PanelMessage | null = null;

    messages = messages.map((message) => {
      if (message.id !== message_id) {
        return message;
      }

      updated_message = {
        ...message,
        ...patch
      };

      return updated_message;
    });

    if (!updated_message || !update_message_element(updated_message)) {
      render({ stick_to_bottom });
      return;
    }

    restore_messages_scroll(scroll_state, stick_to_bottom);
  }

  function update_message_element(message: PanelMessage): boolean {
    const message_element = panel.querySelector<HTMLElement>(
      `[data-message-id="${css_escape(message.id)}"]`
    );

    if (!message_element) {
      return false;
    }

    const thinking_element = message_element.querySelector<HTMLDetailsElement>('[data-message-thinking]');
    const thinking_content_element = message_element.querySelector<HTMLElement>('[data-message-thinking-content]');
    const loading_element = message_element.querySelector<HTMLElement>('[data-message-loading]');
    const content_element = message_element.querySelector<HTMLElement>('[data-message-content]');

    if (thinking_element && thinking_content_element) {
      thinking_element.hidden = !message.thinking_content;
      thinking_element.open = Boolean(message.is_thinking_open);
      thinking_content_element.textContent = message.thinking_content ?? '';
    }

    if (loading_element) {
      loading_element.hidden = !message.is_loading || Boolean(message.content);
    }

    if (content_element) {
      content_element.innerHTML = render_markdown(message.content);
    }

    return true;
  }

  function get_stream_error_message(payload: unknown): string {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
    ) {
      return payload.message;
    }

    return 'Não foi possível gerar a resposta.';
  }

  async function regenerate_last_response() {
    if (!last_request_prompt) {
      return;
    }

    if (messages[messages.length - 1]?.role === 'assistant') {
      messages = messages.slice(0, -1);
    }

    await send_prompt(last_request_prompt, false);
  }

  async function copy_last_response() {
    const last_response = [...messages].reverse().find((message) => message.role === 'assistant');

    if (!last_response || last_response.is_loading || !last_response.content) {
      return;
    }

    await navigator.clipboard.writeText(last_response.content);
  }

  async function save_current_session(show_confirmation = true): Promise<ContextualSession | null> {
    const response = await chrome.runtime.sendMessage({
      type: 'saidr:sessions:save',
      payload: build_session_payload()
    }) as RuntimeResponse<ContextualSession>;

    if (response.status === 'error') {
      throw new Error(response.message);
    }

    current_session_id = response.payload.id;

    if (!show_confirmation) {
      return response.payload;
    }

    messages = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Session saved.'
      }
    ];
    render({ stick_to_bottom: true });
    return response.payload;
  }

  async function open_current_session_in_sidebar() {
    const session = await save_current_session(false);

    if (!session) {
      return;
    }

    const active_response = await chrome.runtime.sendMessage({
      type: 'saidr:active_session:set',
      payload: session
    }) as RuntimeResponse<ContextualSession>;

    if (active_response.status === 'error') {
      throw new Error(active_response.message);
    }

    const open_response = await chrome.runtime.sendMessage({
      type: 'saidr:side_panel:open'
    }) as RuntimeResponse<{ opened: boolean }>;

    if (open_response.status === 'error') {
      throw new Error(open_response.message);
    }
  }

  async function auto_save_current_session() {
    const settings = await get_app_settings();

    if (!settings?.save_history) {
      return;
    }

    await save_current_session(false);
  }

  async function get_app_settings(): Promise<AppSettings | null> {
    const response = await chrome.runtime.sendMessage({
      type: 'saidr:settings:get'
    }) as RuntimeResponse<AppSettings>;

    return response.status === 'ok' ? response.payload : null;
  }

  function build_session_payload(): SaveSessionPayload {
    const selected_bot = get_selected_bot();

    if (!current_selection || messages.length === 0) {
      throw new Error('There is no session to save.');
    }

    return {
      id: current_session_id || undefined,
      tool_id: current_tool_id,
      source_url: current_selection.source_url,
      page_title: current_selection.page_title,
      selected_text: current_selection.text,
      action_prompt: get_current_action_prompt(),
      provider_id: selected_bot?.provider_id,
      model_id: selected_bot?.model_id,
      bot_name: selected_bot?.name,
      messages: messages
        .filter((message) => !message.is_loading)
        .filter((message) => message.content !== 'Session saved.')
        .map((message) => ({
          id: crypto.randomUUID(),
          role: message.role,
          content: message.content,
          created_at: new Date().toISOString()
        }))
    };
  }

  function get_current_action_prompt(): string {
    if (current_tool_id === 'chat') {
      return '';
    }

    return prompts.find((prompt) => prompt.id === current_tool_id)?.content ?? '';
  }

  function build_contextual_prompt(prompt: string): string {
    const selected_text = current_selection?.text ?? '';
    const conversation = messages
      .filter((message) => !message.is_loading)
      .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
      .join('\n\n');

    return [
      selected_text ? `Selected text:\n${selected_text}` : '',
      conversation ? `Conversation:\n${conversation}` : '',
      `Current request:\n${prompt}`
    ].filter(Boolean).join('\n\n');
  }

  function get_selected_bot(): BotPreset | undefined {
    return bots.find((bot) => bot.id === selected_bot_id) ?? bots[0];
  }

  function attach_interactions() {
    const drag_handle = panel.querySelector<HTMLElement>('.saidr-drag-handle');
    const resize_handle = panel.querySelector<HTMLElement>('.saidr-resize-handle');

    if (drag_handle) {
      detach_drag = attach_panel_drag({
        handle: drag_handle,
        get_position: () => ({ x: panel_layout.x, y: panel_layout.y }),
        on_move: (position) => {
          panel_layout = normalize_panel_layout({
            ...panel_layout,
            ...position
          });
          apply_panel_layout();
        },
        on_commit: () => {
          save_panel_layout(panel_layout).catch(() => {});
        }
      });
    }

    if (resize_handle) {
      detach_resize = attach_panel_resize({
        handle: resize_handle,
        get_size: () => ({ width: panel_layout.width, height: panel_layout.height }),
        on_resize: (size) => {
          panel_layout = normalize_panel_layout({
            ...panel_layout,
            ...size
          });
          apply_panel_layout();
        },
        on_commit: () => {
          save_panel_layout(panel_layout).catch(() => {});
        }
      });
    }
  }

  function apply_panel_layout() {
    panel.style.transform = `translate(${panel_layout.x}px, ${panel_layout.y}px)`;
    panel.style.width = `${panel_layout.width}px`;
    panel.style.height = state === 'minimized' ? '48px' : `${panel_layout.height}px`;
  }

  function get_messages_scroll_element(): HTMLElement | null {
    return panel.querySelector<HTMLElement>('.saidr-messages');
  }

  function get_messages_scroll_state(): MessagesScrollState {
    const messages_element = get_messages_scroll_element();

    if (!messages_element) {
      return {
        scroll_top: 0,
        is_near_bottom: true
      };
    }

    return {
      scroll_top: messages_element.scrollTop,
      is_near_bottom:
        messages_element.scrollHeight - messages_element.scrollTop - messages_element.clientHeight < 32
    };
  }

  function restore_messages_scroll(state: MessagesScrollState, stick_to_bottom: boolean) {
    const messages_element = get_messages_scroll_element();

    if (!messages_element) {
      return;
    }

    messages_element.scrollTop = stick_to_bottom
      ? messages_element.scrollHeight
      : Math.min(state.scroll_top, messages_element.scrollHeight);
  }

  return {
    open,
    close
  };
}

async function get_panel_layout(selection: SelectionSnapshot): Promise<PanelLayout> {
  const result = await chrome.storage.local.get(PANEL_LAYOUT_KEY);
  const stored_layout = result[PANEL_LAYOUT_KEY] as Partial<PanelLayout> | undefined;

  if (is_panel_layout(stored_layout)) {
    return normalize_panel_layout(stored_layout);
  }

  return get_default_panel_layout(selection);
}

async function save_panel_layout(layout: PanelLayout): Promise<void> {
  await chrome.storage.local.set({
    [PANEL_LAYOUT_KEY]: layout
  });
}

function get_default_panel_layout(selection: SelectionSnapshot): PanelLayout {
  const preferred_x = selection.rect.right + 12;
  const fallback_x = selection.rect.left;
  const resolved_x = preferred_x + PANEL_WIDTH + VIEWPORT_MARGIN <= window.innerWidth
    ? preferred_x
    : fallback_x;

  return normalize_panel_layout({
    x: resolved_x,
    y: selection.rect.top,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT
  });
}

function normalize_panel_layout(layout: PanelLayout): PanelLayout {
  const max_width = Math.max(MIN_PANEL_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const max_height = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
  const width = clamp(layout.width, MIN_PANEL_WIDTH, max_width);
  const height = clamp(layout.height, MIN_PANEL_HEIGHT, max_height);

  return {
    width,
    height,
    x: clamp(layout.x, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    y: clamp(layout.y, VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)
  };
}

function is_panel_layout(value: Partial<PanelLayout> | undefined): value is PanelLayout {
  return (
    typeof value?.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function get_tool_label(tool_id: ToolbarAction, prompts: StoredPrompt[]): string {
  const prompt = prompts.find((stored_prompt) => stored_prompt.id === tool_id);

  if (prompt?.name) {
    return prompt.name;
  }

  const labels: Record<string, string> = {
    chat: 'Chat',
    translate: 'Translate',
    summarize: 'Summarize',
    explain: 'Explain',
    rewrite: 'Rewrite'
  };

  return labels[tool_id] ?? 'Action';
}

function truncate_text(text: string, max_length: number): string {
  if (text.length <= max_length) {
    return text;
  }

  return `${text.slice(0, max_length).trim()}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function css_escape(value: string): string {
  return CSS.escape(value);
}

function escape_html(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function render_markdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence_match = line.match(/^```(\S*)\s*$/);

    if (fence_match) {
      const language = fence_match[1] ?? '';
      const code_lines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        code_lines.push(lines[index] ?? '');
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      const language_class = language ? ` class="language-${escape_attribute(language)}"` : '';
      blocks.push(`<pre><code${language_class}>${escape_html(code_lines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading_match = line.match(/^(#{1,3})\s+(.+)$/);

    if (heading_match) {
      const level = heading_match[1].length;
      blocks.push(`<h${level}>${render_inline_markdown(heading_match[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }

      blocks.push(`<ul>${items.map((item) => `<li>${render_inline_markdown(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }

      blocks.push(`<ol>${items.map((item) => `<li>${render_inline_markdown(item)}</li>`).join('')}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote_lines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quote_lines.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }

      blocks.push(`<blockquote>${quote_lines.map(render_inline_markdown).join('<br>')}</blockquote>`);
      continue;
    }

    const paragraph_lines: string[] = [];

    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !is_markdown_block_start(lines[index] ?? '')
    ) {
      paragraph_lines.push(lines[index] ?? '');
      index += 1;
    }

    blocks.push(`<p>${paragraph_lines.map(render_inline_markdown).join('<br>')}</p>`);
  }

  return blocks.join('');
}

function is_markdown_block_start(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^(#{1,3})\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^>\s?/.test(line)
  );
}

function render_inline_markdown(value: string): string {
  let output = escape_html(value);

  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/_([^_]+)_/g, '<em>$1</em>');
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const safe_url = get_safe_url(url);

    if (!safe_url) {
      return label;
    }

    return `<a href="${escape_attribute(safe_url)}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  return output;
}

function get_safe_url(url: string): string {
  const trimmed_url = url.trim();

  if (
    trimmed_url.startsWith('https://') ||
    trimmed_url.startsWith('http://') ||
    trimmed_url.startsWith('mailto:') ||
    trimmed_url.startsWith('#')
  ) {
    return trimmed_url;
  }

  return '';
}

function escape_attribute(value: string): string {
  return escape_html(value).replace(/`/g, '&#096;');
}

async function get_content_bots(): Promise<BotPreset[]> {
  const result = await chrome.storage.local.get(BOTS_KEY);
  const stored_bots = result[BOTS_KEY];

  return Array.isArray(stored_bots) && stored_bots.length > 0 ? stored_bots : DEFAULT_BOTS;
}

async function get_content_prompts(): Promise<StoredPrompt[]> {
  const result = await chrome.storage.local.get(PROMPTS_KEY);
  const custom_prompts = Array.isArray(result[PROMPTS_KEY]) ? result[PROMPTS_KEY] : [];
  const custom_prompt_by_id = new Map(
    custom_prompts.filter((prompt) => typeof prompt?.id === 'string').map((prompt) => [prompt.id, prompt])
  );
  const built_in_prompts = BUILT_IN_PROMPTS.map((prompt) => custom_prompt_by_id.get(prompt.id) ?? prompt);
  const user_prompts = custom_prompts.filter(
    (prompt) => typeof prompt?.id === 'string' && !BUILT_IN_PROMPTS.some((built_in_prompt) => built_in_prompt.id === prompt.id)
  );

  return [...built_in_prompts, ...user_prompts];
}

function create_style_element(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .saidr-panel {
      background: #202020;
      border: 1px solid #3a3a3a00;
      border-radius: 12px;
      box-shadow: 0px 0px 15px 10px rgb(0 0 0 / 34%);
      box-sizing: border-box;
      color: #f1f1f1;
      display: flex;
      flex-direction: column;
      height: ${PANEL_HEIGHT}px;
      left: 0;
      overflow: hidden;
      pointer-events: auto;
      position: fixed;
      top: 0;
      width: ${PANEL_WIDTH}px;
      z-index: 2147483647;
    }

    .saidr-panel[hidden] {
      display: none;
    }

    [hidden] {
      display: none !important;
    }

    .saidr-panel-header {
      align-items: center;
      border-bottom: 1px dashed #37373700;
      display: grid;
      gap: 8px;
      grid-template-columns: 24px 1fr auto 28px 28px;
      min-height: 48px;
      padding: 8px 12px;
    }

    .saidr-drag-handle,
    .saidr-icon-button {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 8px;
      color: #c8c8c8;
      cursor: pointer;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      width: 28px;
    }

    .saidr-drag-handle {
      cursor: grab;
      touch-action: none;
    }

    .saidr-drag-handle:active {
      cursor: grabbing;
    }

    .saidr-drag-handle:hover,
    .saidr-icon-button:hover {
      background: #333333;
      color: #ffffff;
    }

    .saidr-bot-select {
      background: #252525;
      border: 1px solid #3f3f3f00;
      border-radius: 999px;
      color: #dddddd;
      font: inherit;
      font-size: 13px;
      max-width: 180px;
      min-width: 0;
      padding: 6px 40px 6px 12px;
    }

    .saidr-panel-body {
      background-color: #191919;
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
      overflow: hidden;
      padding: 14px 16px;
    }

    .saidr-selection-preview {
      color: #5a5a5a;
      flex-shrink: 0;
      font-size: 13px;
      line-height: 1.55;
    }

    .saidr-selection-preview summary {
      cursor: pointer;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .saidr-selection-preview p {
      margin: 0;
    }

    .saidr-messages {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
      overflow-y: auto;
      padding-right: 4px;
      scrollbar-color: #333333 #19191a;
    }

    .saidr-empty {
      color: #8f8f8f;
      font-size: 14px;
      margin: 0;
    }

    .saidr-message {
      border-radius: 10px;
      font-size: 14px;
      padding: 12px 18px;
      white-space: normal;
    }

    .saidr-message span {
      color: #a78bfa;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .saidr-message-heading {
      align-items: baseline;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-bottom: 4px;
      min-width: 0;
    }

    .saidr-message-heading small {
      color: #555555;
      flex: 1;
      font-size: 11px;
      overflow: hidden;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .saidr-message p {
      margin: 0;
    }

    .saidr-message-markdown {
      color: #f1f1f1;
      line-height: 1.6;
    }

    .saidr-message-markdown > * {
      margin: 0;
    }

    .saidr-message-markdown > * + * {
      margin-top: 10px;
    }

    .saidr-message-markdown h1,
    .saidr-message-markdown h2,
    .saidr-message-markdown h3 {
      font-weight: 700;
      line-height: 1.25;
    }

    .saidr-message-markdown h1 {
      font-size: 18px;
    }

    .saidr-message-markdown h2 {
      font-size: 16px;
    }

    .saidr-message-markdown h3 {
      font-size: 15px;
    }

    .saidr-message-markdown ul,
    .saidr-message-markdown ol {
      padding-left: 20px;
    }

    .saidr-message-markdown ul {
      list-style: disc;
    }

    .saidr-message-markdown ol {
      list-style: decimal;
    }

    .saidr-message-markdown li + li {
      margin-top: 4px;
    }

    .saidr-message-markdown pre {
      background: #121212;
      border: 1px solid #2b2b2b;
      border-radius: 8px;
      overflow-x: auto;
      padding: 10px;
    }

    .saidr-message-markdown code {
      background: #121212;
      border-radius: 5px;
      font-size: 12px;
      padding: 2px 4px;
    }

    .saidr-message-markdown pre code {
      background: transparent;
      padding: 0;
    }

    .saidr-message-markdown blockquote {
      border-left: 3px solid #3a3a3a;
      color: #bdbdbd;
      padding-left: 10px;
    }

    .saidr-message-markdown a {
      color: #93c5fd;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .saidr-thinking {
      background: #1e1f1f;
      border-radius: 8px;
      color: #666666;
      font-size: 12px;
      line-height: 1.5;
      margin: 8px 0;
      padding: 8px 10px;
    }

    .saidr-thinking summary {
      color: #777777;
      cursor: pointer;
      font-weight: 700;
    }

    .saidr-thinking p {
      margin-top: 6px;
      white-space: pre-wrap;
    }

    .saidr-loading {
      align-items: center;
      color: #777777;
      display: flex;
      font-size: 13px;
      gap: 8px;
      margin-top: 8px;
    }

    .saidr-loading span:first-child {
      animation: saidr-spin 0.8s linear infinite;
      border: 2px solid #3a3a3a;
      border-top-color: #a78bfa;
      border-radius: 999px;
      display: inline-block;
      height: 14px;
      width: 14px;
    }

    @keyframes saidr-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .saidr-message-user {
      background: #252525;
    }

    .saidr-message-assistant {
      background: transparent;
      padding-inline: 0;
    }

    .saidr-panel-footer {
      border-top: 1px dashed #37373700;
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr auto;
      padding: 10px 12px;
    }

    .saidr-follow-up {
      border: 0;
      color: #f1f1f1;
      font: inherit;
      min-height: 34px;
      outline: none;
      resize: none;
      background-color: #222323;
      border-radius: 8px;
      padding: 8px;
      font-size: 14px;
    }

    .saidr-send-button {
      background: #184674;
      border: 0;
      border-radius: 8px;
      color: #ffffff;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 0 14px;
    }

    .saidr-response-actions {
      display: flex;
      gap: 6px;
      grid-column: 1 / -1;
    }

    .saidr-action-button {
      background: #191919;
      border: 0;
      border-radius: 8px;
      color: #9b9b9b;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      padding: 4px 8px;
    }

    .saidr-action-button:hover {
      background: #252525;
      color: #f1f1f1;
    }

    .saidr-resize-handle {
      background: transparent;
      border: 0;
      bottom: 0;
      cursor: nwse-resize;
      height: 18px;
      padding: 0;
      position: absolute;
      right: 0;
      touch-action: none;
      width: 18px;
      opacity: 0;
    }

    .saidr-resize-handle::after {
      border-bottom: 2px solid #6f6f6f;
      border-right: 2px solid #6f6f6f;
      bottom: 4px;
      content: "";
      height: 8px;
      position: absolute;
      right: 4px;
      width: 8px;
    }
  `;

  return style;
}
