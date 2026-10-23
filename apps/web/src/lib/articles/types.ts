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
  sections: readonly ArticleSection[];
  /**
   * Public path to a downloadable PDF (files live under apps/web/public/articles/).
   * Same pattern as NeoZip blog PDFs under public/blog/.
   */
  pdfPath?: string;
};
