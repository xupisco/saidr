import { get_settings } from '../storage/settings_storage';
import type {
  ProviderCompletionChunk,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse
} from '../types/provider_messages';
import { provider_completion_request_schema } from '../validators/provider_validator';
import {
  create_lm_studio_completion,
  stream_lm_studio_completion,
  test_lm_studio_connection
} from './lm_studio_provider';
import { create_ollama_completion, stream_ollama_completion, test_ollama_connection } from './ollama_provider';
import { create_openai_completion, stream_openai_completion } from './openai_provider';

export async function create_provider_completion(
  request: ProviderCompletionRequest
): Promise<ProviderCompletionResponse> {
  const parsed_request = provider_completion_request_schema.parse(request);
  const settings = await get_settings();
  const prompt = build_provider_prompt(settings.global_prompt, parsed_request.prompt);

  if (parsed_request.provider_id === 'openai') {
    return create_openai_completion({
      api_key: settings.openai_api_key ?? '',
      model_id: parsed_request.model_id,
      prompt
    });
  }

  if (parsed_request.provider_id === 'ollama') {
    return create_ollama_completion({
      base_url: settings.ollama_base_url,
      model_id: parsed_request.model_id,
      prompt
    });
  }

  if (parsed_request.provider_id === 'lm_studio') {
    return create_lm_studio_completion({
      base_url: settings.lm_studio_base_url,
      model_id: parsed_request.model_id,
      prompt
    });
  }

  throw new Error('Provider is not implemented yet.');
}

export async function stream_provider_completion(
  request: ProviderCompletionRequest,
  on_chunk: (chunk: ProviderCompletionChunk) => void
): Promise<void> {
  const parsed_request = provider_completion_request_schema.parse(request);
  const settings = await get_settings();
  const prompt = build_provider_prompt(settings.global_prompt, parsed_request.prompt);

  if (parsed_request.provider_id === 'openai') {
    await stream_openai_completion(
      {
        api_key: settings.openai_api_key ?? '',
        model_id: parsed_request.model_id,
        prompt
      },
      on_chunk
    );
    return;
  }

  if (parsed_request.provider_id === 'lm_studio') {
    await stream_lm_studio_completion(
      {
        base_url: settings.lm_studio_base_url,
        model_id: parsed_request.model_id,
        prompt
      },
      on_chunk
    );
    return;
  }

  if (parsed_request.provider_id === 'ollama') {
    await stream_ollama_completion(
      {
        base_url: settings.ollama_base_url,
        model_id: parsed_request.model_id,
        prompt
      },
      on_chunk
    );
    return;
  }

  const response = await create_provider_completion(parsed_request);

  on_chunk({
    type: 'text_delta',
    text: response.text
  });
}

function build_provider_prompt(global_prompt: string, request_prompt: string): string {
  const trimmed_global_prompt = global_prompt.trim();

  if (!trimmed_global_prompt) {
    return request_prompt;
  }

  return [
    `Global instructions:\n${trimmed_global_prompt}`,
    `User request:\n${request_prompt}`
  ].join('\n\n');
}

export async function test_provider_connection(
  request: ProviderConnectionRequest
): Promise<ProviderConnectionResponse> {
  const settings = await get_settings();

  if (request.provider_id === 'ollama') {
    await test_ollama_connection(settings.ollama_base_url);

    return {
      ok: true,
      message: 'Ollama connection is available.'
    };
  }

  if (request.provider_id === 'openai') {
    return {
      ok: Boolean(settings.openai_api_key),
      message: settings.openai_api_key
        ? 'OpenAI API key is configured.'
        : 'OpenAI API key is missing.'
    };
  }

  if (request.provider_id === 'lm_studio') {
    await test_lm_studio_connection(settings.lm_studio_base_url);

    return {
      ok: true,
      message: 'LM Studio connection is available.'
    };
  }

  return {
    ok: false,
    message: 'Provider is not implemented yet.'
  };
}
