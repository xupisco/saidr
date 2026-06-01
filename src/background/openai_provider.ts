import { z } from 'zod';
import type { ProviderCompletionChunk, ProviderCompletionResponse } from '../types/provider_messages';

export type OpenAiProviderConfig = {
  api_key: string;
  model_id: string;
};

type OpenAiCompletionInput = OpenAiProviderConfig & {
  prompt: string;
};

const openai_response_schema = z
  .object({
    output_text: z.string().optional(),
    output: z.array(z.unknown()).optional()
  })
  .passthrough();

const openai_stream_event_schema = z
  .object({
    type: z.string(),
    delta: z.string().optional(),
    error: z
      .object({
        message: z.string().optional()
      })
      .optional(),
    response: z
      .object({
        error: z
          .object({
            message: z.string().optional()
          })
          .optional()
      })
      .optional()
  })
  .passthrough();

export async function create_openai_completion(
  input: OpenAiCompletionInput
): Promise<ProviderCompletionResponse> {
  if (!input.api_key) {
    throw new Error('OpenAI API key is required.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.api_key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model_id,
      input: input.prompt
    })
  });

  const response_body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(get_provider_error_message(response_body, 'OpenAI request failed.'));
  }

  const parsed_response = openai_response_schema.parse(response_body);
  const text = extract_openai_text(parsed_response);

  if (!text) {
    throw new Error('OpenAI returned an empty response.');
  }

  return {
    text,
    provider_id: 'openai',
    model_id: input.model_id
  };
}

export async function stream_openai_completion(
  input: OpenAiCompletionInput,
  on_chunk: (chunk: ProviderCompletionChunk) => void
): Promise<void> {
  if (!input.api_key) {
    throw new Error('OpenAI API key is required.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.api_key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model_id,
      input: input.prompt,
      stream: true
    })
  });

  if (!response.ok) {
    const response_body = await response.json().catch(() => null);
    throw new Error(get_provider_error_message(response_body, 'OpenAI request failed.'));
  }

  if (!response.body) {
    throw new Error('OpenAI returned an empty stream.');
  }

  await read_server_sent_events(response.body, (event_data) => {
    if (event_data === '[DONE]') {
      return false;
    }

    const parsed_json = parse_json(event_data);

    if (!parsed_json) {
      return true;
    }

    const parsed_event = openai_stream_event_schema.safeParse(parsed_json);

    if (!parsed_event.success) {
      return true;
    }

    if (parsed_event.data.type === 'error') {
      throw new Error(parsed_event.data.error?.message ?? 'OpenAI stream failed.');
    }

    if (parsed_event.data.type === 'response.failed') {
      throw new Error(parsed_event.data.response?.error?.message ?? 'OpenAI stream failed.');
    }

    if (parsed_event.data.type === 'response.output_text.delta' && parsed_event.data.delta) {
      on_chunk({
        type: 'text_delta',
        text: parsed_event.data.delta
      });
    }

    if (
      parsed_event.data.type === 'response.reasoning_summary_text.delta' &&
      parsed_event.data.delta
    ) {
      on_chunk({
        type: 'thinking_delta',
        text: parsed_event.data.delta
      });
    }

    return true;
  });
}

function extract_openai_text(response: z.infer<typeof openai_response_schema>): string {
  if (response.output_text) {
    return response.output_text;
  }

  const output = response.output ?? [];
  const text_parts: string[] = [];

  for (const item of output) {
    if (!is_record(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content_item of item.content) {
      if (is_record(content_item) && typeof content_item.text === 'string') {
        text_parts.push(content_item.text);
      }
    }
  }

  return text_parts.join('\n').trim();
}

function get_provider_error_message(response_body: unknown, fallback: string): string {
  if (
    is_record(response_body) &&
    is_record(response_body.error) &&
    typeof response_body.error.message === 'string'
  ) {
    return response_body.error.message;
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
