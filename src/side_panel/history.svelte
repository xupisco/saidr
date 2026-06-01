<script lang="ts">
  import { onMount } from 'svelte';
  import type { ContextualSession } from '../storage/session_storage';

  export let on_open_session: (session: ContextualSession) => void;

  type RuntimeResponse<T> =
    | {
        status: 'ok';
        payload: T;
      }
    | {
        status: 'error';
        message: string;
      };

  let sessions: ContextualSession[] = [];
  let selected_session: ContextualSession | null = null;
  let error_message = '';
  let is_loading = true;

  onMount(async () => {
    await load_sessions();
  });

  async function load_sessions() {
    error_message = '';

    if (!has_runtime_messaging()) {
      is_loading = false;
      error_message = 'History is available only inside the installed extension.';
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'saidr:sessions:list'
      }) as RuntimeResponse<ContextualSession[]>;

      if (response.status === 'error') {
        error_message = response.message;
        return;
      }

      sessions = response.payload;
      selected_session = sessions[0] ?? null;
    } catch {
      error_message = 'Não foi possível carregar o histórico.';
    } finally {
      is_loading = false;
    }
  }

  async function remove_session(session_id: string) {
    error_message = '';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'saidr:sessions:delete',
        payload: session_id
      }) as RuntimeResponse<ContextualSession[]>;

      if (response.status === 'error') {
        error_message = response.message;
        return;
      }

      sessions = response.payload;
      selected_session = selected_session?.id === session_id
        ? null
        : sessions.find((session) => session.id === selected_session?.id) ?? null;
    } catch {
      error_message = 'Não foi possível apagar a sessão.';
    }
  }

  async function open_session(session: ContextualSession) {
    error_message = '';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'saidr:active_session:set',
        payload: session
      }) as RuntimeResponse<ContextualSession>;

      if (response.status === 'error') {
        error_message = response.message;
        return;
      }

      on_open_session(response.payload);
    } catch {
      error_message = 'Não foi possível abrir a sessão no chat.';
    }
  }

  function has_runtime_messaging(): boolean {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.sendMessage);
  }

  function format_date(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function toggle_selected_session(session: ContextualSession) {
    selected_session = selected_session?.id === session.id ? null : session;
  }
</script>

<section class="flex flex-col gap-4">
  <header class="space-y-1">
    <h2 class="text-lg font-semibold">History</h2>
    <p class="text-sm leading-6 text-base-content/70">
      Saved contextual sessions.
    </p>
  </header>

  {#if is_loading}
    <div class="flex min-h-32 items-center justify-center">
      <span class="loading loading-spinner loading-md text-primary"></span>
    </div>
  {:else if error_message}
    <div class="alert alert-error py-2 text-sm">{error_message}</div>
  {:else if sessions.length === 0}
    <div class="rounded-box border border-base-300 bg-base-200 p-4">
      <p class="text-sm leading-6 text-base-content/70">
        No saved conversations yet.
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each sessions as session}
        <article
          class="rounded-box border border-base-300 bg-base-200">
          <button
            class="w-full rounded-box p-3 text-left hover:cursor-pointer"
            class:bg-base-200={selected_session?.id === session.id}
            type="button"
            on:click={() => toggle_selected_session(session)}
          >
            <span class="block text-sm font-semibold">{session.page_title || 'Untitled page'}</span>
            <span class="mt-1 block text-xs text-base-content/60">
              <span class="text-base-content">{session.tool_id}</span> · {session.bot_name ?? session.model_id ?? 'No bot'} · {format_date(session.updated_at)}
            </span>
            {#if session.source_url}
              <span class="mt-1 block truncate text-xs text-primary">
                {session.source_url}
              </span>
            {/if}
            <span class="mt-2 block truncate text-sm text-base-content/70">
              {session.selected_text}
            </span>
          </button>

          {#if selected_session?.id === session.id}
            <div class="border-t border-base-300 p-3">
              <div class="flex gap-2">
                <button class="btn btn-primary btn-xs" type="button" on:click={() => open_session(session)}>
                  Open in Chat
                </button>
                <button class="btn btn-ghost btn-xs" type="button" on:click={() => remove_session(session.id)}>
                  Delete
                </button>
              </div>

              {#if session.action_prompt}
                <details class="mt-3">
                  <summary class="cursor-pointer text-sm font-medium text-base-content/60">Action prompt</summary>
                  <p class="mt-2 whitespace-pre-wrap text-sm leading-5 text-base-content/50">{session.action_prompt}</p>
                </details>
              {/if}

              <details class="mt-3" open>
                <summary class="cursor-pointer text-sm font-medium text-base-content/60">Selected text</summary>
                <p class="mt-2 text-sm leading-5 text-base-content/30">{session.selected_text}</p>
              </details>

              <div class="mt-3 flex flex-col gap-2">
                {#each session.messages as message}
                  <div class="rounded-box border border-base-300 bg-base-100 p-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-base-content/80">{message.role}</p>
                    <p class="mt-2 whitespace-pre-wrap text-sm leading-5 text-base-content">{message.content}</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>
