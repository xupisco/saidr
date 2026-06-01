<script lang="ts">
  import type { ThemePreference } from '../storage/settings_storage';
  import { THEME_OPTIONS } from '../storage/settings_storage';

  export let value: ThemePreference;
  export let on_change: (theme: ThemePreference) => void = () => {};

  const theme_labels: Record<ThemePreference, string> = {
    system: 'System',
    business: 'Business',
    saidr: 'Saidr',
    light: 'Light',
    dark: 'Dark',
    corporate: 'Corporate',
    dracula: 'Dracula'
  };
</script>

<label class="form-control gap-2">
  <span class="label-text text-sm font-medium">Theme</span>
  <select class="select select-bordered select-sm w-full" bind:value on:change={() => on_change(value)}>
    {#each THEME_OPTIONS as theme}
      <option value={theme}>{theme_labels[theme]}</option>
    {/each}
  </select>
</label>
