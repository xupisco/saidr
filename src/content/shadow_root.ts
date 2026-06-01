export type ShadowRootMode = 'open';

export function create_shadow_host(host_id: string): ShadowRoot {
  const existing_host = document.getElementById(host_id);

  if (existing_host?.shadowRoot) {
    return existing_host.shadowRoot;
  }

  const host = existing_host ?? document.createElement('div');
  host.id = host_id;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';

  if (!existing_host) {
    document.documentElement.appendChild(host);
  }

  return host.attachShadow({ mode: 'open' });
}
