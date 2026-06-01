export type ToolId = string;

export type ToolDefinition = {
  id: ToolId;
  name: string;
  icon: string;
  system_prompt: string;
  user_prompt_template: string;
};
