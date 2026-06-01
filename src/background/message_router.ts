import { z } from 'zod';
import {
  provider_completion_request_schema,
  provider_connection_request_schema
} from '../validators/provider_validator';
import {
  delete_session,
  get_active_chat_session,
  get_sessions,
  save_session,
  set_active_chat_session
} from '../storage/session_storage';
import { get_settings } from '../storage/settings_storage';
import { create_provider_completion, test_provider_connection } from './provider_gateway';

export type BackgroundMessage = {
  type: string;
  payload?: unknown;
};

export async function route_background_message(message: BackgroundMessage): Promise<unknown> {
  if (message.type === 'saidr:ping') {
    return {
      status: 'ok',
      source: 'background'
    };
  }

  if (message.type === 'saidr:selection:changed') {
    return {
      status: 'received'
    };
  }

  if (message.type === 'saidr:toolbar:action_selected') {
    return {
      status: 'received'
    };
  }

  if (message.type === 'saidr:provider:complete') {
    return create_provider_completion(provider_completion_request_schema.parse(message.payload));
  }

  if (message.type === 'saidr:provider:test_connection') {
    return test_provider_connection(provider_connection_request_schema.parse(message.payload));
  }

  if (message.type === 'saidr:settings:get') {
    return get_settings();
  }

  if (message.type === 'saidr:sessions:list') {
    return get_sessions();
  }

  if (message.type === 'saidr:sessions:save') {
    return save_session(message.payload as Parameters<typeof save_session>[0]);
  }

  if (message.type === 'saidr:active_session:get') {
    return get_active_chat_session();
  }

  if (message.type === 'saidr:active_session:set') {
    return set_active_chat_session(message.payload as Parameters<typeof set_active_chat_session>[0]);
  }

  if (message.type === 'saidr:sessions:delete') {
    return delete_session(String(message.payload));
  }

  throw new Error('Unknown background message.');
}

export function serialize_background_error(error: unknown): { status: 'error'; message: string } {
  if (error instanceof z.ZodError) {
    return {
      status: 'error',
      message: error.issues[0]?.message ?? 'Invalid request.'
    };
  }

  if (error instanceof Error) {
    return {
      status: 'error',
      message: error.message
    };
  }

  return {
    status: 'error',
    message: 'Unexpected error.'
  };
}
