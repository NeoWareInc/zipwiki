# OKF rules

Pack reads this directory when it writes concept cards and topic pages. Edit these files to change indexing. The OKF language itself stays in `doc/OKF_SPEC.md`.

| File | What it controls |
| --- | --- |
| `package.md` | Every file in a `.zipwiki` package: the model prompt, the topic catalog, and tags used when AI is off |
| `types/<id>.md` | One data type. The body is the extra instruction for that kind of file |
| `types/earnings.md` | Stock earnings reports. Auto-selects `*-10-k*.pdf` and `*-10-q*.pdf` |

`auto` uses `types/generic.md`, except a file that matches another type. `types/book.md` matches `*.epub`. `types/earnings.md` matches 10-K and 10-Q filenames.

## Add a data type

Create `types/<id>.md`:

```markdown
---
id: sec-filing
okfType: Financial Report
match: "*10-k*.pdf"
sample: prefix
typeRule: Financial Report.
keyFacts: 3–8 concrete bullets from the profile instructions above. No prose paragraphs.
citeSample: true
---

This file is an SEC filing. keyFacts are the issuer, the form, the period, and the filing date.
```

- `id` is the `--okf-profile` name.
- `match` is optional. `*` is a wildcard, and commas separate patterns (`*-10-k-*.pdf,*-10-q-*.pdf`). Leave it off when the type should apply only with `--okf-profile <id>`.
- `sample: edges` sends the opening and the ending of a long parse. `prefix` sends the opening.
- `citeSample: true` adds the shared “do not invent” rule from `package.md`.

A package of one kind of file can pass `--okf-profile <id>` so every file uses that type.
