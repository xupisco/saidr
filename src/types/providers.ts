export type Provider = {
  id: string;
  name: string;
  models: Model[];
};

export type Model = {
  id: string;
  name: string;
  provider_id: string;
  supports_streaming: boolean;
};
