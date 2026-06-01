import { z } from 'zod';

export const theme_schema = z.enum(['system', 'saidr', 'light', 'dark', 'corporate', 'business', 'dracula']);

export const provider_schema = z.enum(['openai', 'ollama', 'lm_studio']);

export const settings_schema = z.object({
  theme: theme_schema,
  openai_api_key: z.string().optional(),
  ollama_base_url: z.string().url(),
  lm_studio_base_url: z.string().url(),
  global_prompt: z.string(),
  save_history: z.boolean(),
  panel_position_x: z.number(),
  panel_position_y: z.number(),
  panel_width: z.number(),
  panel_height: z.number()
});
