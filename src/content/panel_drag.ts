export type PanelPosition = {
  x: number;
  y: number;
};

export type PanelDragOptions = {
  handle: HTMLElement;
  get_position: () => PanelPosition;
  on_move: (position: PanelPosition) => void;
  on_commit: (position: PanelPosition) => void;
};

export function attach_panel_drag(options: PanelDragOptions): () => void {
  function handle_pointer_down(event: PointerEvent) {
    event.preventDefault();
    const start_x = event.clientX;
    const start_y = event.clientY;
    const start_position = options.get_position();

    options.handle.setPointerCapture(event.pointerId);

    function handle_pointer_move(move_event: PointerEvent) {
      options.on_move({
        x: start_position.x + move_event.clientX - start_x,
        y: start_position.y + move_event.clientY - start_y
      });
    }

    function handle_pointer_up(up_event: PointerEvent) {
      options.handle.releasePointerCapture(up_event.pointerId);
      options.handle.removeEventListener('pointermove', handle_pointer_move);
      options.handle.removeEventListener('pointerup', handle_pointer_up);
      options.handle.removeEventListener('pointercancel', handle_pointer_up);
      options.on_commit(options.get_position());
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
