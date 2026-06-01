<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get_bots, type BotPreset } from '../storage/bot_storage';
  import {
    ACTIVE_CHAT_SESSION_KEY,
    type ContextualMessage,
    type ContextualSession
  } from '../storage/session_storage';
  import type { AppSettings, ProviderPreference } from '../storage/settings_storage';
  import type { ProviderCompletionChunk } from '../types/provider_messages';
  import { render_markdown } from '../utils/markdown';

  type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    bot_name?: string;
    provider_id?: ProviderPreference;
    model_id?: string;
    thinking_content?: string;
    is_thinking_open?: boolean;
    is_loading?: boolean;
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

  export let session: ContextualSession | null = null;

  let bots: BotPreset[] = [];
  let selected_bot_id = '';
  let prompt = '';
  let messages: ChatMessage[] = [];
  let current_session: ContextualSession | null = null;
  let loaded_session_id = '';
  let status_message = '';
  let error_message = '';
  let is_sending = false;
  let messages_container: HTMLDivElement;

  const provider_labels: Record<ProviderPreference, string> = {
    openai: 'OpenAI',
    ollama: 'Ollama',
    lm_studio: 'LM Studio'
  };

  $: selected_bot = bots.find((bot) => bot.id === selected_bot_id) ?? bots[0];
  $: if (session && session.id !== loaded_session_id) {
    load_session(session);
  }

  onMount(async () => {
    bots = await get_bots();
    selected_bot_id = bots.find((bot) => bot.is_default)?.id ?? bots[0]?.id ?? '';
    const active_session = await get_active_session();

    if (active_session) {
      load_session(active_session);
    }
  });

  async function send_prompt() {
    error_message = '';
    status_message = '';

    if (!prompt.trim() || is_sending) {
      return;
    }

    if (!has_runtime_messaging()) {
      error_message = 'Provider calls are available only inside the installed extension.';
      return;
    }

    is_sending = true;
    const selected_provider_id = selected_bot?.provider_id;
    const selected_model_id = selected_bot?.model_id;

    if (!selected_provider_id || !selected_model_id) {
      error_message = 'Selecione um bot com provider e modelo configurados.';
      is_sending = false;
      return;
    }

    const user_message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt.trim()
    };
    const request_prompt = build_conversation_prompt([...messages, user_message]);
    const assistant_message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      bot_name: selected_bot?.name,
      provider_id: selected_provider_id,
      model_id: selected_model_id,
      thinking_content: '',
      is_thinking_open: true,
      is_loading: true
    };

    messages = [...messages, user_message, assistant_message];
    prompt = '';
    await scroll_messages_to_bottom();

    try {
      await stream_completion({
        provider_id: selected_provider_id,
        model_id: selected_model_id,
        prompt: request_prompt,
        message_id: assistant_message.id
      });

      status_message = `${provider_labels[selected_provider_id]} · ${selected_model_id}`;
      await sync_active_session();
      await auto_save_session();
    } catch (error: unknown) {
      error_message = error instanceof Error ? error.message : 'Não foi possível enviar o prompt.';
      remove_message(assistant_message.id);
    } finally {
      is_sending = false;
    }
  }

  function stream_completion(input: {
    provider_id: ProviderPreference;
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
          finish_stream_message(input.message_id);
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
    messages = messages.map((message) => {
      if (message.id !== message_id) {
        return message;
      }

      if (chunk.type === 'thinking_delta') {
        return {
          ...message,
          thinking_content: `${message.thinking_content ?? ''}${chunk.text}`,
          is_thinking_open: true
        };
      }

      return {
        ...message,
        content: `${message.content}${chunk.text}`
      };
    });

    void scroll_messages_to_bottom();
  }

  function finish_stream_message(message_id: string) {
    messages = messages.map((message) => {
      if (message.id !== message_id) {
        return message;
      }

      return {
        ...message,
        is_loading: false,
        is_thinking_open: false
      };
    });

    void scroll_messages_to_bottom();
  }

  function remove_message(message_id: string) {
    messages = messages.filter((message) => message.id !== message_id);
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

    return 'Não foi possível enviar o prompt.';
  }

  async function start_new_chat() {
    error_message = '';
    status_message = '';
    prompt = '';
    messages = [];
    current_session = null;
    loaded_session_id = '';

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(ACTIVE_CHAT_SESSION_KEY);
      return;
    }

    globalThis.localStorage?.removeItem(ACTIVE_CHAT_SESSION_KEY);
  }

  async function get_active_session(): Promise<ContextualSession | null> {
    if (!has_runtime_messaging()) {
      return null;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'saidr:active_session:get'
    }) as RuntimeResponse<ContextualSession | null>;

    return response.status === 'ok' ? response.payload : null;
  }

  function load_session(next_session: ContextualSession) {
    current_session = next_session;
    loaded_session_id = next_session.id;
    messages = next_session.messages
      .filter(is_chat_contextual_message)
      .map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        bot_name: next_session.bot_name,
        provider_id: next_session.provider_id as ProviderPreference | undefined,
        model_id: next_session.model_id,
        is_loading: false,
        is_thinking_open: false
      }));

    const matching_bot = bots.find(
      (bot) => bot.provider_id === next_session.provider_id && bot.model_id === next_session.model_id
    );

    if (matching_bot) {
      selected_bot_id = matching_bot.id;
    }

    void scroll_messages_to_bottom();
  }

  async function sync_active_session(): Promise<ContextualSession | null> {
    if (!has_runtime_messaging()) {
      return null;
    }

    const next_session = build_contextual_session();

    const response = await chrome.runtime.sendMessage({
      type: 'saidr:active_session:set',
      payload: next_session
    }) as RuntimeResponse<ContextualSession>;

    if (response.status === 'ok') {
      current_session = response.payload;
      loaded_session_id = response.payload.id;
      return response.payload;
    }

    return null;
  }

  async function auto_save_session() {
    if (!has_runtime_messaging()) {
      return;
    }

    const settings = await get_app_settings();

    if (!settings?.save_history) {
      return;
    }

    const session_payload = build_contextual_session();
    const response = await chrome.runtime.sendMessage({
      type: 'saidr:sessions:save',
      payload: session_payload
    }) as RuntimeResponse<ContextualSession>;

    if (response.status === 'ok') {
      current_session = response.payload;
      loaded_session_id = response.payload.id;
      await chrome.runtime.sendMessage({
        type: 'saidr:active_session:set',
        payload: response.payload
      });
    }
  }

  async function get_app_settings(): Promise<AppSettings | null> {
    const response = await chrome.runtime.sendMessage({
      type: 'saidr:settings:get'
    }) as RuntimeResponse<AppSettings>;

    return response.status === 'ok' ? response.payload : null;
  }

  function build_contextual_session(): ContextualSession {
    const now = new Date().toISOString();
    const selected_provider_id = selected_bot?.provider_id;
    const selected_model_id = selected_bot?.model_id;

    return {
      id: current_session?.id ?? crypto.randomUUID(),
      tool_id: current_session?.tool_id ?? 'chat',
      source_url: current_session?.source_url ?? '',
      page_title: current_session?.page_title ?? 'Chat',
      selected_text: current_session?.selected_text ?? '',
      action_prompt: current_session?.action_prompt ?? '',
      provider_id: selected_provider_id,
      model_id: selected_model_id,
      bot_name: selected_bot?.name,
      messages: messages
        .filter((message) => !message.is_loading)
        .map(to_contextual_message),
      created_at: current_session?.created_at ?? now,
      updated_at: now
    };
  }

  function to_contextual_message(message: ChatMessage): ContextualMessage {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      created_at: new Date().toISOString()
    };
  }

  function is_chat_contextual_message(
    message: ContextualMessage
  ): message is ContextualMessage & { role: 'user' | 'assistant' } {
    return message.role === 'user' || message.role === 'assistant';
  }

  function has_runtime_messaging(): boolean {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);
  }

  function build_conversation_prompt(conversation_messages: ChatMessage[]): string {
    const conversation = conversation_messages
      .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
      .join('\n\n');

    return [
      current_session?.action_prompt ? `Action prompt:\n${current_session.action_prompt}` : '',
      current_session?.selected_text ? `Selected text:\n${current_session.selected_text}` : '',
      conversation
    ].filter(Boolean).join('\n\n');
  }

  async function scroll_messages_to_bottom() {
    await tick();

    if (!messages_container) {
      return;
    }

    messages_container.scrollTop = messages_container.scrollHeight;
  }

  function handle_message_keydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void send_prompt();
  }
</script>

<section class="flex h-full min-h-0 flex-col gap-4">
  <header class="shrink-0 space-y-1">
    <h2 class="text-lg font-semibold">Chat</h2>
    <p class="text-sm leading-6 text-base-content/70">
      Open conversation. Toolbar actions will inject context and starter prompts here.
    </p>
  </header>

  <form class="flex min-h-0 flex-1 flex-col gap-4" on:submit|preventDefault={send_prompt}>
    <div class="grid shrink-0 grid-cols-1 gap-3">
      <label class="form-control gap-2">
        <span class="label-text text-sm font-medium">Bot</span>
        <select class="select select-bordered select-sm w-full" bind:value={selected_bot_id}>
          {#each bots as bot}
            <option value={bot.id}>{bot.name}</option>
          {/each}
        </select>
      </label>

      {#if selected_bot}
        <p class="text-xs leading-5 text-base-content/60">
          {provider_labels[selected_bot.provider_id]} · {selected_bot.model_id || 'No model configured'}
        </p>
      {/if}
    </div>

    <div
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-box"
      bind:this={messages_container}
    >
      {#if messages.length === 0}
        <p class="text-sm leading-6 text-base-content/60">
          Start a conversation here, or use a future page action to inject selected text as context.
        </p>
      {:else}
        {#each messages as message}
          <article class="rounded-box bg-base-200 p-3">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-base-content/90">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </h3>

              {#if message.role === 'assistant' && message.model_id}
                <p class="truncate text-[0.68rem] leading-4 text-base-content/45">
                  {message.bot_name ? `${message.bot_name} · ` : ''}{message.model_id}
                </p>
              {/if}
            </div>

            {#if message.role === 'assistant' && message.thinking_content}
              <details
                class="mt-2 rounded-box border border-base-300 bg-base-100 px-3 py-2"
                open={message.is_thinking_open}
              >
                <summary class="cursor-pointer text-xs font-medium text-base-content/50">
                  Thinking
                </summary>
                <p class="mt-2 whitespace-pre-wrap text-xs leading-5 text-base-content/50">
                  {message.thinking_content}
                </p>
              </details>
            {/if}

            {#if message.is_loading && !message.content}
              <div class="mt-3 flex items-center gap-2 text-sm text-base-content/60">
                <span class="loading loading-spinner loading-xs"></span>
                <span>Thinking...</span>
              </div>
            {/if}

            <div class="saidr-message-markdown mt-2 text-sm leading-6 text-base-content">
              {@html render_markdown(message.content)}
            </div>
          </article>
        {/each}
      {/if}
    </div>

    <div class="shrink-0 space-y-3">
      {#if error_message}
        <div class="alert alert-error py-2 text-sm">{error_message}</div>
      {/if}

      {#if status_message}
        <div class="alert alert-success py-2 text-sm">{status_message}</div>
      {/if}

      <label class="form-control gap-2">
        <span class="label-text text-sm font-medium">Message</span>
        <textarea
          class="textarea textarea-bordered min-h-24 w-full resize-none"
          placeholder="Ask anything..."
          bind:value={prompt}
          on:keydown={handle_message_keydown}
        ></textarea>
      </label>

      <div class="flex gap-2 pt-4">
        <button class="btn btn-primary btn-sm flex-1" type="submit" disabled={is_sending || !prompt.trim()}>
          {is_sending ? 'Sending...' : 'Send'}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" disabled={is_sending} on:click={start_new_chat}>
          New chat
        </button>
      </div>
    </div>
  </form>
</section>

<style>
  :global(.saidr-message-markdown > * + *) {
    margin-top: 0.75rem;
  }

  :global(.saidr-message-markdown h1),
  :global(.saidr-message-markdown h2),
  :global(.saidr-message-markdown h3) {
    font-weight: 700;
    line-height: 1.25;
  }

  :global(.saidr-message-markdown h1) {
    font-size: 1.15rem;
  }

  :global(.saidr-message-markdown h2) {
    font-size: 1.05rem;
  }

  :global(.saidr-message-markdown h3) {
    font-size: 0.95rem;
  }

  :global(.saidr-message-markdown p),
  :global(.saidr-message-markdown ul),
  :global(.saidr-message-markdown ol),
  :global(.saidr-message-markdown pre),
  :global(.saidr-message-markdown blockquote) {
    margin-bottom: 0;
  }

  :global(.saidr-message-markdown ul),
  :global(.saidr-message-markdown ol) {
    padding-left: 1.25rem;
  }

  :global(.saidr-message-markdown ul) {
    list-style: disc;
  }

  :global(.saidr-message-markdown ol) {
    list-style: decimal;
  }

  :global(.saidr-message-markdown li + li) {
    margin-top: 0.25rem;
  }

  :global(.saidr-message-markdown pre) {
    overflow-x: auto;
    border-radius: 0.5rem;
    background: var(--color-base-100);
    padding: 0.75rem;
  }

  :global(.saidr-message-markdown code) {
    border-radius: 0.35rem;
    background: var(--color-base-100);
    padding: 0.1rem 0.3rem;
    font-size: 0.85em;
  }

  :global(.saidr-message-markdown pre code) {
    background: transparent;
    padding: 0;
  }

  :global(.saidr-message-markdown blockquote) {
    border-left: 3px solid color-mix(in srgb, var(--color-base-content) 25%, transparent);
    padding-left: 0.75rem;
    color: color-mix(in srgb, var(--color-base-content) 70%, transparent);
  }

  :global(.saidr-message-markdown a) {
    color: var(--color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
