export type SelectionSnapshot = {
  text: string;
  rect: SelectionRect;
  source_url: string;
  page_title: string;
  created_at: string;
};

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type SelectionDetectorOptions = {
  debounce_ms?: number;
  on_change: (snapshot: SelectionSnapshot | null) => void;
};

export type SelectionDetector = {
  start: () => void;
  stop: () => void;
  get_snapshot: () => SelectionSnapshot | null;
};

const DEFAULT_DEBOUNCE_MS = 80;

export function create_selection_detector(options: SelectionDetectorOptions): SelectionDetector {
  let current_snapshot: SelectionSnapshot | null = null;
  let debounce_timeout: number | undefined;
  const debounce_ms = options.debounce_ms ?? DEFAULT_DEBOUNCE_MS;

  function start() {
    document.addEventListener('selectionchange', schedule_selection_update);
    document.addEventListener('mouseup', schedule_selection_update);
    document.addEventListener('keyup', schedule_selection_update);
    window.addEventListener('scroll', schedule_selection_update, true);
  }

  function stop() {
    document.removeEventListener('selectionchange', schedule_selection_update);
    document.removeEventListener('mouseup', schedule_selection_update);
    document.removeEventListener('keyup', schedule_selection_update);
    window.removeEventListener('scroll', schedule_selection_update, true);

    if (debounce_timeout) {
      window.clearTimeout(debounce_timeout);
    }
  }

  function get_snapshot(): SelectionSnapshot | null {
    return current_snapshot;
  }

  function schedule_selection_update() {
    if (debounce_timeout) {
      window.clearTimeout(debounce_timeout);
    }

    debounce_timeout = window.setTimeout(update_selection, debounce_ms);
  }

  function update_selection() {
    const snapshot = get_current_selection_snapshot();

    if (!has_snapshot_changed(current_snapshot, snapshot)) {
      return;
    }

    current_snapshot = snapshot;
    options.on_change(snapshot);
  }

  return {
    start,
    stop,
    get_snapshot
  };
}

function get_current_selection_snapshot(): SelectionSnapshot | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const text = selection.toString().trim();

  if (!text) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = get_range_rect(range);

  if (!rect || rect.width === 0 || rect.height === 0) {
    return null;
  }

  return {
    text,
    rect,
    source_url: window.location.href,
    page_title: document.title,
    created_at: new Date().toISOString()
  };
}

function get_range_rect(range: Range): SelectionRect | null {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const rect = rects[0] ?? range.getBoundingClientRect();

  if (!rect) {
    return null;
  }

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left
  };
}

function has_snapshot_changed(
  previous_snapshot: SelectionSnapshot | null,
  next_snapshot: SelectionSnapshot | null
): boolean {
  if (!previous_snapshot && !next_snapshot) {
    return false;
  }

  if (!previous_snapshot || !next_snapshot) {
    return true;
  }

  return (
    previous_snapshot.text !== next_snapshot.text ||
    previous_snapshot.source_url !== next_snapshot.source_url ||
    previous_snapshot.rect.top !== next_snapshot.rect.top ||
    previous_snapshot.rect.left !== next_snapshot.rect.left
  );
}
