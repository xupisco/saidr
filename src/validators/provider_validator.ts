import { z } from 'zod';
import { provider_schema } from './settings_validator';

export const provider_completion_request_schema = z.object({
  provider_id: provider_schema,
  model_id: z.string().trim().min(1, 'Model is required.'),
  prompt: z.string().trim().min(1, 'Prompt is required.')
});

export const provider_connection_request_schema = z.object({
  provider_id: provider_schema
});
