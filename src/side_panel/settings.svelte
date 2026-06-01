<script lang="ts">
  import { onMount } from 'svelte';
  import ThemeSelector from '../components/theme_selector.svelte';
  import {
    create_bot,
    delete_bot,
    get_bots,
    set_default_bot,
    type BotPreset
  } from '../storage/bot_storage';
  import {
    create_prompt,
    delete_prompt,
    get_prompts,
    move_prompt,
    update_prompt,
    type StoredPrompt
  } from '../storage/prompt_storage';
  import type { AppSettings, ProviderPreference } from '../storage/settings_storage';
  import { PROVIDER_OPTIONS } from '../storage/settings_storage';

  export let settings: AppSettings;
  export let is_saving = false;
  export let on_save: (settings: AppSettings) => Promise<void>;
  export let on_reset: () => Promise<void>;
  export let on_theme_preview: (theme: AppSettings['theme']) => void;

  type SettingsSection = 'bots' | 'providers' | 'prompts' | 'appearance';

  let active_section: SettingsSection = 'bots';
  let draft_settings: AppSettings = { ...settings };
  let bots: BotPreset[] = [];
  let prompts: StoredPrompt[] = [];
  let new_bot_name = '';
  let new_bot_provider: ProviderPreference = 'openai';
  let new_bot_model = '';
  let new_prompt_name = '';
  let new_prompt_icon = '•';
  let new_prompt_content = '';
  let new_prompt_show_in_toolbar = false;
  let settings_error_message = '';
  let bot_error_message = '';
  let prompt_error_message = '';
  let expanded_prompt_ids = new Set<string>();

  const provider_labels: Record<ProviderPreference, string> = {
    openai: 'OpenAI',
    ollama: 'Ollama',
    lm_studio: 'LM Studio'
  };

  $: draft_settings = { ...settings };

  onMount(async () => {
    const [stored_bots, stored_prompts] = await Promise.all([get_bots(), get_prompts()]);
    bots = stored_bots;
    prompts = stored_prompts;
  });

  async function submit_settings() {
    settings_error_message = '';

    try {
      await on_save({
        ...draft_settings,
        openai_api_key: draft_settings.openai_api_key?.trim() ?? '',
        ollama_base_url: draft_settings.ollama_base_url.trim(),
        lm_studio_base_url: draft_settings.lm_studio_base_url.trim(),
        global_prompt: draft_settings.global_prompt.trim()
      });
    } catch {
      settings_error_message = 'Não foi possível salvar as configurações.';
    }
  }

  async function reset_form() {
    settings_error_message = '';

    try {
      await on_reset();
    } catch {
      settings_error_message = 'Não foi possível restaurar os padrões.';
    }
  }

  async function submit_bot() {
    bot_error_message = '';

    if (!new_bot_name.trim() || !new_bot_model.trim()) {
      bot_error_message = 'Informe nome e modelo do bot.';
      return;
    }

    try {
      bots = await create_bot({
        name: new_bot_name,
        provider_id: new_bot_provider,
        model_id: new_bot_model
      });
      new_bot_name = '';
      new_bot_model = '';
    } catch {
      bot_error_message = 'Não foi possível criar o bot.';
    }
  }

  async function remove_bot(bot_id: string) {
    bot_error_message = '';

    try {
      bots = await delete_bot(bot_id);
    } catch {
      bot_error_message = 'Não foi possível apagar o bot.';
    }
  }

  async function make_default_bot(bot_id: string) {
    bot_error_message = '';

    try {
      bots = await set_default_bot(bot_id);
    } catch {
      bot_error_message = 'Não foi possível definir o bot padrão.';
    }
  }

  async function submit_prompt() {
    prompt_error_message = '';

    if (!new_prompt_name.trim() || !new_prompt_content.trim()) {
      prompt_error_message = 'Informe nome e conteúdo do prompt.';
      return;
    }

    try {
      prompts = await create_prompt({
        name: new_prompt_name,
        icon: new_prompt_icon,
        show_in_toolbar: new_prompt_show_in_toolbar,
        content: new_prompt_content
      });
      new_prompt_name = '';
      new_prompt_icon = '•';
      new_prompt_content = '';
      new_prompt_show_in_toolbar = false;
    } catch {
      prompt_error_message = 'Não foi possível criar o prompt.';
    }
  }

  async function save_prompt(prompt: StoredPrompt) {
    prompt_error_message = '';

    if (!prompt.name.trim() || !prompt.content.trim()) {
      prompt_error_message = 'Informe nome e conteúdo do prompt.';
      return;
    }

    try {
      prompts = await update_prompt(prompt.id, {
        name: prompt.name,
        icon: prompt.icon,
        content: prompt.content,
        show_in_toolbar: prompt.show_in_toolbar
      });
    } catch {
      prompt_error_message = 'Não foi possível salvar o prompt.';
    }
  }

  async function remove_prompt(prompt_id: string) {
    prompt_error_message = '';

    try {
      prompts = await delete_prompt(prompt_id);
    } catch {
      prompt_error_message = 'Não foi possível apagar o prompt.';
    }
  }

  async function reorder_prompt(prompt_id: string, direction: 'up' | 'down') {
    prompt_error_message = '';

    try {
      prompts = await move_prompt(prompt_id, direction);
    } catch {
      prompt_error_message = 'Não foi possível reordenar o prompt.';
    }
  }

  function toggle_prompt(prompt_id: string) {
    const next_expanded_prompt_ids = new Set(expanded_prompt_ids);

    if (next_expanded_prompt_ids.has(prompt_id)) {
      next_expanded_prompt_ids.delete(prompt_id);
    } else {
      next_expanded_prompt_ids.add(prompt_id);
    }

    expanded_prompt_ids = next_expanded_prompt_ids;
  }
</script>

<section class="flex flex-col gap-4">
  <header class="space-y-1">
    <h2 class="text-lg font-semibold">Settings</h2>
    <p class="text-sm leading-6 text-base-content/70">
      Configure bots, providers, prompts, and appearance.
    </p>
  </header>

  <div class="grid grid-cols-2 gap-2">
    <button class:btn-primary={active_section === 'bots'} class="btn btn-sm" type="button" on:click={() => active_section = 'bots'}>
      Bots
    </button>
    <button class:btn-primary={active_section === 'providers'} class="btn btn-sm" type="button" on:click={() => active_section = 'providers'}>
      Providers
    </button>
    <button class:btn-primary={active_section === 'prompts'} class="btn btn-sm" type="button" on:click={() => active_section = 'prompts'}>
      Prompts
    </button>
    <button class:btn-primary={active_section === 'appearance'} class="btn btn-sm" type="button" on:click={() => active_section = 'appearance'}>
      Appearance
    </button>
  </div>

  {#if active_section === 'bots'}
    <section class="flex flex-col gap-3">
      <header class="space-y-1">
        <h3 class="text-sm font-semibold">Bots</h3>
        <p class="text-sm leading-6 text-base-content/70">
          Presets that combine provider and model for chat, toolbar actions, and regenerate.
        </p>
      </header>

      <div class="flex flex-col gap-2">
        {#each bots as bot}
          <article class="rounded-box border border-base-300 bg-base-200 p-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h4 class="text-sm font-semibold">{bot.name}</h4>
                <p class="mt-1 text-xs leading-5 text-base-content/60">
                  {provider_labels[bot.provider_id]} · {bot.model_id || 'No model configured'}
                </p>
              </div>
              {#if bot.is_default}
                <span class="badge badge-primary badge-sm">Default</span>
              {/if}
            </div>
            <div class="mt-3 flex gap-2">
              <button class="btn btn-ghost btn-xs" type="button" disabled={bot.is_default} on:click={() => make_default_bot(bot.id)}>
                Set default
              </button>
              <button class="btn btn-ghost btn-xs" type="button" on:click={() => remove_bot(bot.id)}>
                Delete
              </button>
            </div>
          </article>
        {/each}
      </div>

      <form class="flex flex-col gap-3" on:submit|preventDefault={submit_bot}>
        <label class="form-control gap-2">
          <span class="label-text text-sm font-medium">Bot name</span>
          <input class="input input-bordered input-sm w-full" placeholder="Bot GPT" bind:value={new_bot_name} />
        </label>

        <label class="form-control gap-2">
          <span class="label-text text-sm font-medium">Provider</span>
          <select class="select select-bordered select-sm w-full" bind:value={new_bot_provider}>
            {#each PROVIDER_OPTIONS as provider}
              <option value={provider}>{provider_labels[provider]}</option>
            {/each}
          </select>
        </label>

        <label class="form-control gap-2">
          <span class="label-text text-sm font-medium">Model</span>
          <input class="input input-bordered input-sm w-full" placeholder="gpt-5-mini, llama3.2, local-model" bind:value={new_bot_model} />
        </label>

        {#if bot_error_message}
          <div class="alert alert-error py-2 text-sm">{bot_error_message}</div>
        {/if}

        <button class="btn btn-secondary btn-sm" type="submit">Create bot</button>
      </form>
    </section>
  {:else if active_section === 'providers'}
    <form class="flex flex-col gap-4" on:submit|preventDefault={submit_settings}>
      <label class="form-control gap-2">
        <span class="label-text text-sm font-medium">OpenAI API key</span>
        <input
          class="input input-bordered input-sm w-full"
          type="password"
          autocomplete="off"
          placeholder="Stored only in chrome.storage.local"
          bind:value={draft_settings.openai_api_key}
        />
      </label>

      <label class="form-control gap-2">
        <span class="label-text text-sm font-medium">Ollama URL</span>
        <input class="input input-bordered input-sm w-full" bind:value={draft_settings.ollama_base_url} />
      </label>

      <label class="form-control gap-2">
        <span class="label-text text-sm font-medium">LM Studio URL</span>
        <input
          class="input input-bordered input-sm w-full"
          placeholder="http://localhost:1234/v1"
          bind:value={draft_settings.lm_studio_base_url}
        />
      </label>

      <label class="form-control gap-2">
        <span class="label-text text-sm font-medium">Global prompt</span>
        <textarea
          class="textarea textarea-bordered min-h-28 w-full resize-y"
          placeholder="Instructions sent with every request."
          bind:value={draft_settings.global_prompt}
        ></textarea>
      </label>

      <label class="flex items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200 px-3 py-2">
        <span class="text-sm font-medium">Save history</span>
        <input class="toggle toggle-primary toggle-sm" type="checkbox" bind:checked={draft_settings.save_history} />
      </label>

      {#if settings_error_message}
        <div class="alert alert-error py-2 text-sm">{settings_error_message}</div>
      {/if}

      <button class="btn btn-primary btn-sm" type="submit" disabled={is_saving}>
        {is_saving ? 'Saving...' : 'Save providers'}
      </button>
    </form>
  {:else if active_section === 'prompts'}
    <section class="flex flex-col gap-3 settings-prompts">
      <div class="flex flex-col gap-2">
        {#each prompts as prompt, index}
          <article class="rounded-box border border-base-300 bg-base-200">
            <div class="grid grid-cols-[1fr_auto] items-center gap-2 p-2">
              <button
                class="flex min-w-0 items-center gap-3 rounded-box px-2 py-2 text-left hover:bg-base-300"
                type="button"
                aria-expanded={expanded_prompt_ids.has(prompt.id)}
                on:click={() => toggle_prompt(prompt.id)}
              >
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-box bg-base-100 text-sm font-semibold">
                  {prompt.icon || '•'}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold">{prompt.name}</span>
                  <span class="block text-xs leading-5 text-base-content/50">
                    {prompt.is_built_in ? 'Built-in action' : 'Custom action'}
                  </span>
                </span>
                <span class="text-xs text-base-content/50">
                  {expanded_prompt_ids.has(prompt.id) ? 'Collapse' : 'Edit'}
                </span>
              </button>

              <div class="flex justify-end gap-1">
                <button
                  class="btn btn-ghost btn-xs"
                  type="button"
                  aria-label="Move action up"
                  disabled={index === 0}
                  on:click={() => reorder_prompt(prompt.id, 'up')}
                >
                  ↑
                </button>
                <button
                  class="btn btn-ghost btn-xs"
                  type="button"
                  aria-label="Move action down"
                  disabled={index === prompts.length - 1}
                  on:click={() => reorder_prompt(prompt.id, 'down')}
                >
                  ↓
                </button>
              </div>
            </div>

            {#if expanded_prompt_ids.has(prompt.id)}
              <div class="border-t border-base-300 p-3">
                <div class="grid grid-cols-[4rem_1fr] gap-2">
                  <label class="form-control gap-2">
                    <span class="label-text text-xs font-medium">Icon</span>
                    <input class="input input-bordered input-sm w-full text-center" bind:value={prompt.icon} />
                  </label>

                  <label class="form-control gap-2">
                    <span class="label-text text-xs font-medium">Name</span>
                    <input class="input input-bordered input-sm w-full" bind:value={prompt.name} />
                  </label>
                </div>

                <label class="mt-3 flex items-center justify-between gap-3 rounded-box border border-base-300 bg-base-100 px-3 py-2">
                  <span class="text-sm font-medium">Show in toolbar</span>
                  <input class="toggle toggle-primary toggle-sm" type="checkbox" bind:checked={prompt.show_in_toolbar} />
                </label>

                <label class="form-control mt-3 gap-2">
                  <span class="label-text text-xs font-medium">Prompt text</span>
                  <textarea
                    class="textarea textarea-bordered min-h-24 w-full resize-none"
                    bind:value={prompt.content}
                  ></textarea>
                </label>

                <div class="mt-3 flex gap-2">
                  <button class="btn btn-primary btn-sm flex-1" type="button" on:click={() => save_prompt(prompt)}>
                    Save action
                  </button>
                  {#if !prompt.is_built_in}
                    <button class="btn btn-ghost btn-sm" type="button" on:click={() => remove_prompt(prompt.id)}>
                      Delete
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          </article>
        {/each}
      </div>

      <form class="flex flex-col gap-3 new-prompt-form" on:submit|preventDefault={submit_prompt}>
        <label class="form-control gap-2">
          <span class="label-text text-sm font-medium">New prompt name</span>
          <input class="input input-bordered input-sm w-full" bind:value={new_prompt_name} />
        </label>

        <label class="form-control gap-2">
          <span class="label-text text-sm font-medium">New prompt icon</span>
          <input class="input input-bordered input-sm w-full" bind:value={new_prompt_icon} />
        </label>

        <label class="flex items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200 px-3 py-2">
          <span class="text-sm font-medium">Show in toolbar</span>
          <input class="toggle toggle-primary toggle-sm" type="checkbox" bind:checked={new_prompt_show_in_toolbar} />
        </label>

        <label class="form-control gap-2">
          <span class="label-text text-sm font-medium">New prompt content</span>
          <textarea class="textarea textarea-bordered min-h-24 w-full resize-none" bind:value={new_prompt_content}></textarea>
        </label>

        {#if prompt_error_message}
          <div class="alert alert-error py-2 text-sm">{prompt_error_message}</div>
        {/if}

        <button class="btn btn-secondary btn-sm" type="submit">Create prompt</button>
      </form>
    </section>
  {:else}
    <form class="flex flex-col gap-4" on:submit|preventDefault={submit_settings}>
      <ThemeSelector bind:value={draft_settings.theme} on_change={on_theme_preview} />

      {#if settings_error_message}
        <div class="alert alert-error py-2 text-sm">{settings_error_message}</div>
      {/if}

      <div class="flex gap-2">
        <button class="btn btn-primary btn-sm flex-1" type="submit" disabled={is_saving}>
          {is_saving ? 'Saving...' : 'Save appearance'}
        </button>
        <button class="btn btn-ghost btn-sm" type="button" disabled={is_saving} on:click={reset_form}>
          Reset
        </button>
      </div>
    </form>
  {/if}
</section>
