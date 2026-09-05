// ─── Real AI news sources (verified live RSS feeds) ──────────────────
// Every source here was curl-tested and returns 200 with valid XML.
// Note: Anthropic / Meta AI do not publish RSS feeds — users can add
// them (or anything else) as custom sources from the News Radar UI.

export interface FeedSource {
  name: string
  url: string
  homepage: string
  category: string // company | lab | newsletter | blog
}

export const CURATED_FEEDS: FeedSource[] = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', homepage: 'https://openai.com', category: 'company' },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', homepage: 'https://huggingface.co', category: 'company' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', homepage: 'https://deepmind.google', category: 'lab' },
  { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', homepage: 'https://www.microsoft.com/en-us/research', category: 'lab' },
  { name: 'NVIDIA AI Blog', url: 'https://blogs.nvidia.com/feed/', homepage: 'https://blogs.nvidia.com', category: 'company' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', homepage: 'https://techcrunch.com', category: 'blog' },
  { name: 'TLDR AI', url: 'https://tldr.tech/api/rss/ai', homepage: 'https://tldr.tech/ai', category: 'newsletter' },
  { name: 'Import AI', url: 'https://importai.substack.com/feed', homepage: 'https://importai.substack.com', category: 'newsletter' },
  { name: 'Ahead of AI', url: 'https://sebastianraschka.substack.com/feed', homepage: 'https://sebastianraschka.com', category: 'newsletter' },
]

// Strip HTML tags & entities from RSS content into clean plain text.
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/https?:\/\/\S+/g, '') // bare links pollute summaries
    .replace(/\s+/g, ' ')
    .trim()
}
