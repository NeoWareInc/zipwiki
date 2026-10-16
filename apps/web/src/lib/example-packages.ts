/** Shared example archives the Query page can open in the browser. */
export type ExamplePackage = {
  name: string;
  title: string;
  description: string;
  queries: readonly string[];
};

export const EXAMPLE_PACKAGES: readonly ExamplePackage[] = [
  {
    name: "florida-laws-2025.zipwiki",
    title: "Florida Laws 2025",
    description:
      "253 Florida session laws from 2025, with links back to the official chapter PDFs.",
    queries: [
      "Give me a summary of this ZipWiki package",
      "Can restaurants stop third-party apps from selling fake reservations?",
      "Does Florida regulate pet insurance and wellness programs?",
      "Find any legislation related to Beach Erosion Control and give me links to open them",
      "Are there any references to the Gulf of America",
    ],
  },
  {
    name: "charles-dickens.zipwiki",
    title: "Charles Dickens",
    description:
      "67 Project Gutenberg works: novels, stories, sketches, and letters.",
    queries: [
      "Quote the opening of A Tale of Two Cities and Sydney Carton’s last line.",
      'Find the book and the quote that starts "It is a far, far better thing that I do, than I have ever done."',
      'Please find me the “The Wreck of the Golden Mary” and tell me the names of the characters. Then give me the link to download it.',
    ],
  },
  {
    name: "earnings-2025.zipwiki",
    title: "2025 Earnings",
    description:
      "28 SEC annual and quarterly reports for 2025, with links back to the official filings.",
    queries: [
      "Give me a summary of this ZipWiki package.",
      "Which companies are included, and what is the fiscal year-end for each annual report?",
      "What revenue did Apple, Microsoft, and Alphabet report in their latest annual filing?",
      "Find Uber’s most recent quarterly report and give me the link to open the SEC filing.",
      "What risks do Coinbase and Palantir mention about their businesses in the annual reports?",
    ],
  },
  {
    name: "medical-pdfs.zipwiki",
    title: "Medical PDFs",
    description:
      "Clinical records for two home-hospice patients, with the original PDFs included.",
    queries: [],
  },
];

export function examplePackageForFilename(
  filename: string,
): ExamplePackage | undefined {
  const base = filename.split(/[/\\]/).pop()?.trim().toLowerCase() ?? "";
  return EXAMPLE_PACKAGES.find((example) => example.name === base);
}
