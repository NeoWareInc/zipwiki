export type ArticleSection = {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  code?: {
    caption: string;
    snippet: string;
  };
};

export type ResourceArticle = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTimeMinutes: number;
  /** Short credit under the meta line, e.g. "ZipWiki by NeoWare". */
  byline?: string;
  sections: readonly ArticleSection[];
  /**
   * Public path to a downloadable PDF (files live under apps/web/public/articles/).
   * Same pattern as NeoZip blog PDFs under public/blog/.
   */
  pdfPath?: string;
  /**
   * Public path to a header image that already contains the article title.
   * When set, the article page shows it instead of the visible title heading.
   */
  headerImage?: string;
  /**
   * Public path for Open Graph / Twitter preview (prefer PNG/JPEG; crawlers
   * often skip SVG). Falls back to headerImage, then the site OG image.
   */
  ogImage?: string;
};
