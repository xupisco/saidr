export type PageContext = {
  url: string;
  title: string;
};

export function get_page_context(): PageContext {
  return {
    url: window.location.href,
    title: document.title
  };
}
