import type { ProviderPreference } from '../storage/settings_storage';

export type ProviderCompletionRequest = {
  provider_id: ProviderPreference;
  model_id: string;
  prompt: string;
};

export type ProviderCompletionResponse = {
  text: string;
  provider_id: ProviderPreference;
  model_id: string;
};

export type ProviderCompletionChunk = {
  type: 'text_delta' | 'thinking_delta';
  text: string;
};

export type ProviderConnectionRequest = {
  provider_id: ProviderPreference;
};

export type ProviderConnectionResponse = {
  ok: boolean;
  message: string;
};
