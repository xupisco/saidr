import type { SelectionSnapshot } from './selection_detector';
import { create_shadow_host } from './shadow_root';

export type ToolbarAction = string;

type ToolbarTool = {
  id: ToolbarAction;
  label: string;
  icon: string;
  content: string;
  show_in_toolbar?: boolean;
  sort_order?: number;
};

export type FloatingToolbar = {
  show: (selection: SelectionSnapshot) => void;
  hide: () => void;
};

type FloatingToolbarOptions = {
  on_action: (tool_id: ToolbarAction, selection: SelectionSnapshot) => void;
};

const TOOLBAR_HOST_ID = 'saidr-floating-toolbar-host';
const PROMPTS_KEY = 'custom_prompts';
const TOOLBAR_WIDTH = 236;
const TOOLBAR_HEIGHT = 38;
const MAX_VISIBLE_TOOLS = 5;
const VIEWPORT_MARGIN = 8;

const TOOLS: ToolbarTool[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: '🗨️',
    content: 'Use the selected text as context and answer the user question.',
    sort_order: 0
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: '文',
    content: 'Translate the selected text to the configured target language. Keep meaning and tone.',
    sort_order: 1
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '▣',
    content: 'Summarize the selected text clearly and concisely.',
    sort_order: 2
  },
  {
    id: 'explain',
    label: 'Explain',
    icon: '?',
    content: 'Explain the selected text in clear language, preserving important details.',
    sort_order: 3
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    icon: '✎',
    content: 'Rewrite the selected text while preserving the original meaning.',
    sort_order: 4
  }
];

export function create_floating_toolbar(options: FloatingToolbarOptions): FloatingToolbar {
  const shadow_root = create_shadow_host(TOOLBAR_HOST_ID);
  let current_selection: SelectionSnapshot | null = null;
  let toolbar_tools: ToolbarTool[] = TOOLS;
  const toolbar = document.createElement('div');
  let is_more_menu_open = false;

  shadow_root.innerHTML = '';
  shadow_root.appendChild(create_style_element());
  shadow_root.appendChild(toolbar);

  toolbar.className = 'saidr-toolbar';
  toolbar.hidden = true;
  render_toolbar();

  function render_toolbar() {
    toolbar.innerHTML = '';
    const visible_tools = toolbar_tools.slice(0, MAX_VISIBLE_TOOLS);
    const overflow_tools = toolbar_tools.slice(MAX_VISIBLE_TOOLS);

    for (const tool of visible_tools) {
      append_tool_button(tool);
    }

    if (overflow_tools.length > 0) {
      append_more_menu(overflow_tools);
    }
  }

  function append_tool_button(tool: ToolbarTool) {
    const item = document.createElement('span');
    const button = document.createElement('button');
    const tooltip = document.createElement('span');

    item.className = 'saidr-toolbar-item';
    button.className = 'saidr-toolbar-button';
    button.type = 'button';
    button.setAttribute('aria-label', tool.label);
    button.textContent = tool.icon;
    tooltip.className = 'saidr-toolbar-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = tool.label;
    button.addEventListener('click', () => {
      select_tool(tool);
    });
    item.appendChild(button);
    item.appendChild(tooltip);
    toolbar.appendChild(item);
  }

  function append_more_menu(overflow_tools: ToolbarTool[]) {
    const divider = document.createElement('span');
    const more_item = document.createElement('span');
    const more_button = document.createElement('button');
    const more_tooltip = document.createElement('span');
    const menu = document.createElement('div');

    divider.className = 'saidr-toolbar-divider';
    toolbar.appendChild(divider);

    more_item.className = 'saidr-toolbar-item';
    more_button.className = 'saidr-toolbar-button saidr-toolbar-more';
    more_button.type = 'button';
    more_button.setAttribute('aria-label', 'More actions');
    more_button.setAttribute('aria-expanded', String(is_more_menu_open));
    more_button.textContent = '⋯';
    more_tooltip.className = 'saidr-toolbar-tooltip';
    more_tooltip.setAttribute('role', 'tooltip');
    more_tooltip.textContent = 'More';
    menu.className = 'saidr-more-menu';
    menu.hidden = !is_more_menu_open;

    for (const tool of overflow_tools) {
      const menu_button = document.createElement('button');
      const icon = document.createElement('span');
      const label = document.createElement('span');

      menu_button.className = 'saidr-more-menu-item';
      menu_button.type = 'button';
      icon.className = 'saidr-more-menu-icon';
      icon.textContent = tool.icon;
      label.textContent = tool.label;
      menu_button.appendChild(icon);
      menu_button.appendChild(label);
      menu_button.addEventListener('click', () => {
        select_tool(tool);
      });
      menu.appendChild(menu_button);
    }

    more_button.addEventListener('click', (event) => {
      event.stopPropagation();
      is_more_menu_open = !is_more_menu_open;
      render_toolbar();
    });
    more_item.appendChild(more_button);
    more_item.appendChild(more_tooltip);
    more_item.appendChild(menu);
    toolbar.appendChild(more_item);
  }

  function select_tool(tool: ToolbarTool) {
    if (!current_selection) {
      return;
    }

    is_more_menu_open = false;
    options.on_action(tool.id, current_selection);
  }

  async function show(selection: SelectionSnapshot) {
    current_selection = selection;
    is_more_menu_open = false;
    toolbar_tools = await get_toolbar_tools();
    render_toolbar();
    const position = get_toolbar_position(selection);

    toolbar.style.transform = `translate(${position.x}px, ${position.y}px)`;
    toolbar.hidden = false;
  }

  function hide() {
    current_selection = null;
    is_more_menu_open = false;
    toolbar.hidden = true;
  }

  return {
    show,
    hide
  };
}

async function get_toolbar_tools(): Promise<ToolbarTool[]> {
  const result = await chrome.storage.local.get(PROMPTS_KEY);
  const custom_prompts = Array.isArray(result[PROMPTS_KEY]) ? result[PROMPTS_KEY] : [];
  const stored_prompts = normalize_toolbar_prompts(custom_prompts);
  const stored_prompt_by_id = new Map(stored_prompts.map((prompt) => [prompt.id, prompt]));
  const built_in_tools = TOOLS.map((tool) => stored_prompt_by_id.get(tool.id) ?? tool);
  const custom_tools = stored_prompts.filter((prompt) => !TOOLS.some((tool) => tool.id === prompt.id));

  return [...built_in_tools, ...custom_tools]
    .filter((tool) => tool.show_in_toolbar !== false)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
}

function normalize_toolbar_prompts(prompts: Array<Partial<ToolbarTool> & { show_in_toolbar?: boolean }>): Array<ToolbarTool & { show_in_toolbar?: boolean }> {
  return prompts
    .filter((prompt): prompt is Partial<ToolbarTool> & { id: string; name?: string } => typeof prompt.id === 'string')
    .map((prompt) => {
      const built_in_tool = TOOLS.find((tool) => tool.id === prompt.id);

      return {
        id: prompt.id,
        label: prompt.label ?? prompt.name ?? built_in_tool?.label ?? 'Action',
        icon: prompt.icon ?? built_in_tool?.icon ?? '•',
        content: prompt.content ?? built_in_tool?.content ?? '',
        show_in_toolbar: prompt.show_in_toolbar ?? true,
        sort_order: prompt.sort_order ?? built_in_tool?.sort_order ?? 999
      };
    });
}

function get_toolbar_position(selection: SelectionSnapshot): { x: number; y: number } {
  const viewport_width = window.innerWidth;
  const viewport_height = window.innerHeight;
  const preferred_x = selection.rect.left + selection.rect.width / 2 - TOOLBAR_WIDTH / 2;
  const preferred_y = selection.rect.top - TOOLBAR_HEIGHT - 8;
  const fallback_y = selection.rect.bottom + 8;
  const x = clamp(preferred_x, VIEWPORT_MARGIN, viewport_width - TOOLBAR_WIDTH - VIEWPORT_MARGIN);
  const y = preferred_y >= VIEWPORT_MARGIN
    ? preferred_y
    : clamp(fallback_y, VIEWPORT_MARGIN, viewport_height - TOOLBAR_HEIGHT - VIEWPORT_MARGIN);

  return {
    x,
    y
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function create_style_element(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .saidr-toolbar {
      align-items: center;
      background: #202020;
      border: 1px solid #3a3a3a00;
      border-radius: 999px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
      box-sizing: border-box;
      display: flex;
      gap: 2px;
      height: ${TOOLBAR_HEIGHT}px;
      left: 0;
      padding: 4px;
      pointer-events: auto;
      position: fixed;
      top: 0;
      transition: opacity 120ms ease, transform 120ms ease;
      width: fit-content;
    }

    .saidr-toolbar[hidden] {
      display: none;
    }

    .saidr-toolbar-item {
      align-items: center;
      display: inline-flex;
      justify-content: center;
      position: relative;
    }

    .saidr-toolbar-button {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: #d6d6d6;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 14px;
      height: 28px;
      justify-content: center;
      line-height: 1;
      margin: 0;
      padding: 0;
      width: 28px;
    }

    .saidr-toolbar-tooltip {
      background: #111111;
      border: 1px solid #34343400;
      border-radius: 8px;
      box-shadow: 0 10px 24px rgb(0 0 0 / 30%);
      color: #f1f1f1;
      font-size: 12px;
      font-weight: 600;
      left: 50%;
      line-height: 1;
      opacity: 0;
      padding: 7px 9px;
      pointer-events: none;
      position: absolute;
      top: calc(100% + 8px);
      transform: translate(-50%, -2px);
      transition: opacity 90ms ease, transform 90ms ease;
      white-space: nowrap;
      z-index: 1;
    }

    .saidr-toolbar-tooltip::before {
      background: #111111;
      border-left: 1px solid #343434;
      border-top: 1px solid #343434;
      content: "";
      height: 7px;
      left: 50%;
      position: absolute;
      top: -4px;
      transform: translateX(-50%) rotate(45deg);
      width: 7px;
    }

    .saidr-toolbar-item:hover .saidr-toolbar-tooltip,
    .saidr-toolbar-item:focus-within .saidr-toolbar-tooltip {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    .saidr-toolbar-button:hover {
      background: #3a3a3a;
      color: #ffffff;
    }

    .saidr-toolbar-button:focus-visible {
      outline: 2px solid #7c909a;
      outline-offset: 2px;
    }

    .saidr-toolbar-divider {
      background: #454545;
      height: 18px;
      margin-inline: 10px;
      width: 1px;
    }

    .saidr-toolbar-more {
      background: #184674;
      color: #ffffff;
    }

    .saidr-more-menu {
      background: #202020;
      border: 1px solid #3a3a3a;
      border-radius: 10px;
      bottom: calc(100% + 8px);
      box-shadow: 0 14px 32px rgb(0 0 0 / 34%);
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 180px;
      padding: 6px;
      position: absolute;
      right: 0;
    }

    .saidr-more-menu[hidden] {
      display: none;
    }

    .saidr-more-menu-item {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 8px;
      color: #e8e8e8;
      cursor: pointer;
      display: grid;
      font: inherit;
      font-size: 13px;
      gap: 8px;
      grid-template-columns: 22px 1fr;
      padding: 8px;
      text-align: left;
      white-space: nowrap;
      width: 100%;
    }

    .saidr-more-menu-item:hover,
    .saidr-more-menu-item:focus-visible {
      background: #303030;
      outline: none;
    }

    .saidr-more-menu-icon {
      text-align: center;
    }
  `;

  return style;
}
