import type { ResourceArticle } from "./types";

export const introducingZipwiki: ResourceArticle = {
  slug: "introducing-zipwiki",
  title: "Introducing ZipWiki: Portable, AI-Searchable Knowledge Packages",
  excerpt:
    "How pairing compressed document storage with AI-friendly text lets AI agents query your archives instantly—while shrinking files to a fraction of their original size.",
  date: "October 26, 2026",
  category: "Product & Vision",
  readTimeMinutes: 4,
  pdfPath: "/articles/introducing-zipwiki.pdf",
  headerImage: "/articles/introducing-zipwiki-header.svg",
  sections: [
    {
      heading: "Why long-term archives need an AI upgrade",
      paragraphs: [
        "Every team accumulates folders of PDFs, Word documents, spreadsheets, and slide decks—session laws, quarterly earnings filings, clinical records, contracts, or reference books.",
        "We traditionally pack these into ZIP files to save space. But to an AI agent, a standard ZIP file is just a blind box. The AI can only see filenames. To actually read the contents or answer a question, the entire archive must be unpacked, and the AI has to chew through massive, heavy files from scratch every single time.",
        "ZipWiki solves this problem. It is portable document memory with an embedded AI index—not another cloud drive, and not a complex database you have to maintain. When you pack a folder into a .zipwiki file, ZipWiki reads your documents once, pulls out the clean text, and writes a smart index right inside the ZIP container.",
      ],
    },
    {
      heading: "What lives inside a ZipWiki package?",
      paragraphs: [
        "A .zipwiki is still a standard ZIP file that opens with normal unzipping tools on any computer, but organized specifically for AI:",
      ],
      bullets: [
        "An AI Digest (The Summary): A quick overview of what is inside the archive, so an AI agent knows what is in the box before doing a deep dive.",
        "The Smart Index: Lightweight “concept cards” for each document. This acts like the index at the back of a textbook, helping an AI instantly locate key facts without reading every page.",
        "Clean Text (Extracted Markdown): AI models struggle with complex PDFs and binary files. ZipWiki converts documents into clean, structured text that AI can read rapidly.",
        "The Originals (Optional): Bulky original PDFs can stay bundled right next to the text, or they can be omitted to save space while keeping a verified web link to the original source.",
      ],
    },
    {
      heading: "How AI reads a ZipWiki (Without getting overwhelmed)",
      paragraphs: [
        "Asking an AI a question about a massive archive shouldn’t require loading the entire collection into memory at once.",
        "ZipWiki is built for selective reading. When an AI interacts with a ZipWiki package, it follows a simple path:",
      ],
      bullets: [
        "It reads the overall summary.",
        "It searches the smart index to identify which documents hold the answer.",
        "It streams only the specific text needed to answer your question.",
        "If it absolutely requires the original file, it knows exactly where to retrieve it.",
      ],
    },
    {
      heading: "Shrinking knowledge to 1/100th the size",
      paragraphs: [
        "Because ZipWiki captures the text, tables, and headings an AI actually uses, bulky original files don’t always need to travel with the archive.",
        "Linking out to original files (such as state law portals or SEC databases) instead of packing them directly inside routinely shrinks an archive’s size by upwards of 99%. That translates to roughly 1/100th of the original file size, while preserving full citation integrity and source verifiability. When full offline access is required, the original binaries can simply remain bundled inside.",
      ],
    },
    {
      heading: "Trust the archive, not a hosted database",
      paragraphs: [
        "ZipWiki puts data back in your hands. There is no external database to manage or keep in sync. You can share, sync, email, and back up .zipwiki archives like any standard ZIP file, confident that your knowledge remains instantly accessible to both humans and AI models.",
        "ZipWiki is now available in Beta. To explore the format, download the tools, and start packaging your archives, visit zipwiki.ai.",
      ],
    },
  ],
};
