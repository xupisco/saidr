import {
  route_background_message,
  serialize_background_error,
  type BackgroundMessage
} from './message_router';
import { provider_completion_request_schema } from '../validators/provider_validator';
import { stream_provider_completion } from './provider_gateway';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, send_response) => {
  if (!message?.type?.startsWith('saidr:')) {
    return false;
  }

  if (message.type === 'saidr:side_panel:open') {
    open_side_panel(sender)
      .then((payload) => {
        send_response({
          status: 'ok',
          payload
        });
      })
      .catch((error: unknown) => {
        send_response(serialize_background_error(error));
      });

    return true;
  }

  route_background_message(message)
    .then((payload) => {
      send_response({
        status: 'ok',
        payload
      });
    })
    .catch((error: unknown) => {
      send_response(serialize_background_error(error));
    });

  return true;
});

async function open_side_panel(sender: chrome.runtime.MessageSender): Promise<{ opened: boolean }> {
  if (!sender.tab?.id) {
    throw new Error('A browser tab is required to open the side panel.');
  }

  await chrome.sidePanel.open({
    tabId: sender.tab.id
  });

  return {
    opened: true
  };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'saidr:provider:stream') {
    return;
  }

  let is_disconnected = false;

  port.onDisconnect.addListener(() => {
    is_disconnected = true;
  });

  port.onMessage.addListener((message: BackgroundMessage) => {
    if (message.type !== 'saidr:provider:stream:start') {
      return;
    }

    stream_response(port, message, () => is_disconnected);
  });
});

async function stream_response(
  port: chrome.runtime.Port,
  message: BackgroundMessage,
  is_disconnected: () => boolean
): Promise<void> {
  try {
    const request = provider_completion_request_schema.parse(message.payload);

    await stream_provider_completion(request, (chunk) => {
      if (is_disconnected()) {
        return;
      }

      port.postMessage({
        type: 'saidr:provider:stream:chunk',
        payload: chunk
      });
    });

    if (!is_disconnected()) {
      port.postMessage({
        type: 'saidr:provider:stream:done'
      });
    }
  } catch (error: unknown) {
    if (is_disconnected()) {
      return;
    }

    port.postMessage({
      type: 'saidr:provider:stream:error',
      payload: serialize_background_error(error)
    });
  }
}
