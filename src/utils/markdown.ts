export function render_markdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence_match = line.match(/^```(\S*)\s*$/);

    if (fence_match) {
      const language = fence_match[1] ?? '';
      const code_lines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
        code_lines.push(lines[index] ?? '');
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      const language_class = language ? ` class="language-${escape_attribute(language)}"` : '';
      blocks.push(`<pre><code${language_class}>${escape_html(code_lines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading_match = line.match(/^(#{1,3})\s+(.+)$/);

    if (heading_match) {
      const level = heading_match[1].length;
      blocks.push(`<h${level}>${render_inline_markdown(heading_match[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }

      blocks.push(`<ul>${items.map((item) => `<li>${render_inline_markdown(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }

      blocks.push(`<ol>${items.map((item) => `<li>${render_inline_markdown(item)}</li>`).join('')}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote_lines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quote_lines.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }

      blocks.push(`<blockquote>${quote_lines.map(render_inline_markdown).join('<br>')}</blockquote>`);
      continue;
    }

    const paragraph_lines: string[] = [];

    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !is_block_start(lines[index] ?? '')
    ) {
      paragraph_lines.push(lines[index] ?? '');
      index += 1;
    }

    blocks.push(`<p>${paragraph_lines.map(render_inline_markdown).join('<br>')}</p>`);
  }

  return blocks.join('');
}

function is_block_start(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^(#{1,3})\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^>\s?/.test(line)
  );
}

function render_inline_markdown(value: string): string {
  let output = escape_html(value);

  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/_([^_]+)_/g, '<em>$1</em>');
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const safe_url = get_safe_url(url);

    if (!safe_url) {
      return label;
    }

    return `<a href="${escape_attribute(safe_url)}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  return output;
}

function get_safe_url(url: string): string {
  const trimmed_url = url.trim();

  if (
    trimmed_url.startsWith('https://') ||
    trimmed_url.startsWith('http://') ||
    trimmed_url.startsWith('mailto:') ||
    trimmed_url.startsWith('#')
  ) {
    return trimmed_url;
  }

  return '';
}

function escape_html(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escape_attribute(value: string): string {
  return escape_html(value).replace(/`/g, '&#096;');
}
