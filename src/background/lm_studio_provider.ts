import { z } from 'zod';
import type { ProviderCompletionChunk, ProviderCompletionResponse } from '../types/provider_messages';

export type LmStudioProviderConfig = {
  base_url: string;
  model_id: string;
};

type LmStudioCompletionInput = LmStudioProviderConfig & {
  prompt: string;
};

const lm_studio_chat_completion_schema = z
  .object({
    choices: z.array(
      z
        .object({
          message: z
            .object({
              content: z.union([z.string(), z.array(z.unknown())]).optional()
            })
            .optional()
        })
        .passthrough()
    )
  })
  .passthrough();

const lm_studio_stream_chunk_schema = z
  .object({
    choices: z.array(
      z
        .object({
          delta: z.record(z.string(), z.unknown()).optional()
        })
        .passthrough()
    )
  })
  .passthrough();

export async function create_lm_studio_completion(
  input: LmStudioCompletionInput
): Promise<ProviderCompletionResponse> {
  const response = await fetch(`${normalize_base_url(input.base_url)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model_id,
      messages: [
        {
          role: 'user',
          content: input.prompt
        }
      ],
      stream: false
    })
  });

  const response_body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(get_lm_studio_error_message(response_body, 'LM Studio request failed.'));
  }

  const parsed_response = lm_studio_chat_completion_schema.parse(response_body);
  const text = extract_lm_studio_text(parsed_response);

  if (!text) {
    throw new Error('LM Studio returned an empty response.');
  }

  return {
    text,
    provider_id: 'lm_studio',
    model_id: input.model_id
  };
}

export async function stream_lm_studio_completion(
  input: LmStudioCompletionInput,
  on_chunk: (chunk: ProviderCompletionChunk) => void
): Promise<void> {
  const response = await fetch(`${normalize_base_url(input.base_url)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model_id,
      messages: [
        {
          role: 'user',
          content: input.prompt
        }
      ],
      stream: true
    })
  });

  if (!response.ok) {
    const response_body = await response.json().catch(() => null);
    throw new Error(get_lm_studio_error_message(response_body, 'LM Studio request failed.'));
  }

  if (!response.body) {
    throw new Error('LM Studio returned an empty stream.');
  }

  await read_server_sent_events(response.body, (event_data) => {
    if (event_data === '[DONE]') {
      return false;
    }

    const chunk_body = parse_json(event_data);

    if (!chunk_body) {
      return true;
    }

    const parsed_chunk = lm_studio_stream_chunk_schema.safeParse(chunk_body);

    if (!parsed_chunk.success) {
      return true;
    }

    const delta = parsed_chunk.data.choices[0]?.delta;

    if (!delta) {
      return true;
    }

    const thinking = get_string_field(delta, ['reasoning_content', 'reasoning', 'thinking']);

    if (thinking) {
      on_chunk({
        type: 'thinking_delta',
        text: thinking
      });
    }

    const text = get_string_field(delta, ['content']);

    if (text) {
      on_chunk({
        type: 'text_delta',
        text
      });
    }

    return true;
  });
}

export async function test_lm_studio_connection(base_url: string): Promise<void> {
  const response = await fetch(`${normalize_base_url(base_url)}/models`);

  if (!response.ok) {
    throw new Error('LM Studio connection test failed.');
  }
}

function normalize_base_url(base_url: string): string {
  const normalized_base_url = base_url.trim().replace(/\/+$/, '');

  if (normalized_base_url.endsWith('/v1')) {
    return normalized_base_url;
  }

  return `${normalized_base_url}/v1`;
}

function extract_lm_studio_text(
  response: z.infer<typeof lm_studio_chat_completion_schema>
): string {
  const content = response.choices[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (is_record(item) && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

function get_lm_studio_error_message(response_body: unknown, fallback: string): string {
  if (
    is_record(response_body) &&
    is_record(response_body.error) &&
    typeof response_body.error.message === 'string'
  ) {
    return response_body.error.message;
  }

  if (is_record(response_body) && typeof response_body.error === 'string') {
    return response_body.error;
  }

  return fallback;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function read_server_sent_events(
  stream: ReadableStream<Uint8Array>,
  on_event: (data: string) => boolean
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''))
          .join('\n')
          .trim();

        if (data) {
          const should_continue = on_event(data);

          if (!should_continue) {
            return;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parse_json(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function get_string_field(record: Record<string, unknown>, field_names: string[]): string {
  for (const field_name of field_names) {
    const value = record[field_name];

    if (typeof value === 'string') {
      return value;
    }
  }

  return '';
}
