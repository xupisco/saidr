import { z } from 'zod';
import type { ProviderCompletionChunk, ProviderCompletionResponse } from '../types/provider_messages';

export type OllamaProviderConfig = {
  base_url: string;
  model_id: string;
};

type OllamaCompletionInput = OllamaProviderConfig & {
  prompt: string;
};

const ollama_generate_response_schema = z.object({
  response: z.string()
});

const ollama_stream_chunk_schema = z.object({
  response: z.string().optional(),
  done: z.boolean().optional()
});

export async function create_ollama_completion(
  input: OllamaCompletionInput
): Promise<ProviderCompletionResponse> {
  const response = await fetch(`${normalize_base_url(input.base_url)}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model_id,
      prompt: input.prompt,
      stream: false
    })
  });

  const response_body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(get_ollama_error_message(response_body, 'Ollama request failed.'));
  }

  const parsed_response = ollama_generate_response_schema.parse(response_body);

  if (!parsed_response.response) {
    throw new Error('Ollama returned an empty response.');
  }

  return {
    text: parsed_response.response,
    provider_id: 'ollama',
    model_id: input.model_id
  };
}

export async function stream_ollama_completion(
  input: OllamaCompletionInput,
  on_chunk: (chunk: ProviderCompletionChunk) => void
): Promise<void> {
  const response = await fetch(`${normalize_base_url(input.base_url)}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model_id,
      prompt: input.prompt,
      stream: true
    })
  });

  if (!response.ok) {
    const response_body = await response.json().catch(() => null);
    throw new Error(get_ollama_error_message(response_body, 'Ollama request failed.'));
  }

  if (!response.body) {
    throw new Error('Ollama returned an empty stream.');
  }

  await read_json_lines(response.body, (line) => {
    const chunk_body = parse_json(line);

    if (!chunk_body) {
      return true;
    }

    const parsed_chunk = ollama_stream_chunk_schema.safeParse(chunk_body);

    if (!parsed_chunk.success) {
      return true;
    }

    if (parsed_chunk.data.done) {
      return false;
    }

    if (parsed_chunk.data.response) {
      on_chunk({
        type: 'text_delta',
        text: parsed_chunk.data.response
      });
    }

    return true;
  });
}

export async function test_ollama_connection(base_url: string): Promise<void> {
  const response = await fetch(`${normalize_base_url(base_url)}/api/tags`);

  if (!response.ok) {
    throw new Error('Ollama connection test failed.');
  }
}

function normalize_base_url(base_url: string): string {
  return base_url.replace(/\/+$/, '');
}

function get_ollama_error_message(response_body: unknown, fallback: string): string {
  if (
    typeof response_body === 'object' &&
    response_body !== null &&
    'error' in response_body &&
    typeof response_body.error === 'string'
  ) {
    return response_body.error;
  }

  return fallback;
}

async function read_json_lines(
  stream: ReadableStream<Uint8Array>,
  on_line: (line: string) => boolean
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
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed_line = line.trim();

        if (!trimmed_line) {
          continue;
        }

        const should_continue = on_line(trimmed_line);

        if (!should_continue) {
          return;
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
