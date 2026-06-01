<script lang="ts">
  import { onMount } from 'svelte';
  import Chat from './chat.svelte';
  import History from './history.svelte';
  import Settings from './settings.svelte';
  import { ACTIVE_CHAT_SESSION_KEY, type ContextualSession } from '../storage/session_storage';
  import {
    DEFAULT_SETTINGS,
    get_settings,
    reset_settings,
    resolve_theme,
    save_settings,
    type AppSettings
  } from '../storage/settings_storage';

  const app_name = 'Saidr';
  type SidePanelTab = 'chat' | 'history' | 'settings';

  let settings: AppSettings = DEFAULT_SETTINGS;
  let preview_theme = DEFAULT_SETTINGS.theme;
  let is_loading = true;
  let is_saving = false;
  let active_tab: SidePanelTab = 'chat';
  let session_to_open: ContextualSession | null = null;

  $: active_theme = resolve_theme(preview_theme);

  onMount(() => {
    get_settings().then((stored_settings) => {
      settings = stored_settings;
      preview_theme = settings.theme;
      is_loading = false;
    });

    if (typeof chrome !== 'undefined') {
      chrome.storage?.onChanged.addListener(handle_storage_change);
    }

    return () => {
      if (typeof chrome !== 'undefined') {
        chrome.storage?.onChanged.removeListener(handle_storage_change);
      }
    };
  });

  async function persist_settings(next_settings: AppSettings) {
    is_saving = true;

    try {
      settings = await save_settings(next_settings);
      preview_theme = settings.theme;
    } finally {
      is_saving = false;
    }
  }

  async function restore_default_settings() {
    is_saving = true;

    try {
      settings = await reset_settings();
      preview_theme = settings.theme;
    } finally {
      is_saving = false;
    }
  }

  function open_session_in_chat(session: ContextualSession) {
    session_to_open = session;
    active_tab = 'chat';
  }

  function handle_storage_change(changes: Record<string, chrome.storage.StorageChange>, area_name: string) {
    if (area_name !== 'local' || !changes[ACTIVE_CHAT_SESSION_KEY]?.newValue) {
      return;
    }

    open_session_in_chat(changes[ACTIVE_CHAT_SESSION_KEY].newValue as ContextualSession);
  }
</script>

<main class="h-screen bg-base-100 text-base-content" data-theme={active_theme}>
  <section class="flex h-screen flex-col gap-5 overflow-hidden px-4 py-5">
    <header class="shrink-0 space-y-1">
      <p class="text-xs font-medium uppercase tracking-wide text-primary">Browser AI Assistant</p>
      <h1 class="text-2xl font-semibold">{app_name}</h1>
      <p class="text-sm leading-6 text-base-content/70">
        Selection toolbar, floating panel, history, prompts, and settings.
      </p>
    </header>

    {#if is_loading}
      <div class="flex min-h-40 items-center justify-center">
        <span class="loading loading-spinner loading-md text-primary"></span>
      </div>
    {:else}
      <div class="join grid shrink-0 grid-cols-3">
        <button
          class:btn-primary={active_tab === 'chat'}
          class="btn join-item btn-sm"
          type="button"
          on:click={() => {
            active_tab = 'chat';
          }}
        >
          Chat
        </button>
        <button
          class:btn-primary={active_tab === 'history'}
          class="btn join-item btn-sm"
          type="button"
          on:click={() => {
            active_tab = 'history';
          }}
        >
          History
        </button>
        <button
          class:btn-primary={active_tab === 'settings'}
          class="btn join-item btn-sm"
          type="button"
          on:click={() => {
            active_tab = 'settings';
          }}
        >
          Settings
        </button>
      </div>

      <div class="min-h-0 flex-1 {active_tab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}">
        {#if active_tab === 'chat'}
          <Chat session={session_to_open} />
        {:else if active_tab === 'history'}
          <History on_open_session={open_session_in_chat} />
        {:else}
          <Settings
            {settings}
            {is_saving}
            on_save={persist_settings}
            on_reset={restore_default_settings}
            on_theme_preview={(theme) => {
              preview_theme = theme;
            }}
          />
        {/if}
      </div>
    {/if}
  </section>
</main>
