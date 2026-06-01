import { create_selection_detector } from './selection_detector';
import { create_floating_ai_panel } from './floating_ai_panel';
import { create_floating_toolbar } from './floating_toolbar';

const CONTENT_SCRIPT_MARKER = 'data-saidr-content-script';

if (!document.documentElement.hasAttribute(CONTENT_SCRIPT_MARKER)) {
  document.documentElement.setAttribute(CONTENT_SCRIPT_MARKER, 'loaded');
  const floating_ai_panel = create_floating_ai_panel();
  const floating_toolbar = create_floating_toolbar({
    on_action: (tool_id, selection) => {
      floating_toolbar.hide();
      floating_ai_panel.open({
        tool_id,
        selection
      }).catch(() => {
        // Provider and storage errors are rendered inside the panel when possible.
      });

      chrome.runtime.sendMessage({
        type: 'saidr:toolbar:action_selected',
        payload: {
          tool_id,
          selection
        }
      }).catch(() => {
        // The background worker may be unavailable during extension reloads.
      });
    }
  });

  const selection_detector = create_selection_detector({
    on_change: (snapshot) => {
      if (snapshot) {
        floating_toolbar.show(snapshot);
      } else {
        floating_toolbar.hide();
      }

      chrome.runtime.sendMessage({
        type: 'saidr:selection:changed',
        payload: snapshot
      }).catch(() => {
        // The background worker may be unavailable during extension reloads.
      });
    }
  });

  selection_detector.start();

  chrome.runtime.onMessage.addListener((message, _sender, send_response) => {
    if (message?.type !== 'saidr:selection:get_current') {
      return false;
    }

    send_response({
      status: 'ok',
      payload: selection_detector.get_snapshot()
    });

    return true;
  });

  chrome.runtime.sendMessage({ type: 'saidr:ping' }).catch(() => {
    // The background worker may be unavailable during extension reloads.
  });
}
