export type PanelSize = {
  width: number;
  height: number;
};

export type PanelResizeOptions = {
  handle: HTMLElement;
  get_size: () => PanelSize;
  on_resize: (size: PanelSize) => void;
  on_commit: (size: PanelSize) => void;
};

export function attach_panel_resize(options: PanelResizeOptions): () => void {
  function handle_pointer_down(event: PointerEvent) {
    event.preventDefault();
    const start_x = event.clientX;
    const start_y = event.clientY;
    const start_size = options.get_size();

    options.handle.setPointerCapture(event.pointerId);

    function handle_pointer_move(move_event: PointerEvent) {
      options.on_resize({
        width: start_size.width + move_event.clientX - start_x,
        height: start_size.height + move_event.clientY - start_y
      });
    }

    function handle_pointer_up(up_event: PointerEvent) {
      options.handle.releasePointerCapture(up_event.pointerId);
      options.handle.removeEventListener('pointermove', handle_pointer_move);
      options.handle.removeEventListener('pointerup', handle_pointer_up);
      options.handle.removeEventListener('pointercancel', handle_pointer_up);
      options.on_commit(options.get_size());
    }

    options.handle.addEventListener('pointermove', handle_pointer_move);
    options.handle.addEventListener('pointerup', handle_pointer_up);
    options.handle.addEventListener('pointercancel', handle_pointer_up);
  }

  options.handle.addEventListener('pointerdown', handle_pointer_down);

  return () => {
    options.handle.removeEventListener('pointerdown', handle_pointer_down);
  };
}
