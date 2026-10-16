---
id: earnings
okfType: Financial Report
match: "*-10-k*.pdf,*-10-q*.pdf"
sample: prefix
typeRule: Financial Report.
keyFacts: 3–8 concrete bullets from the profile instructions above. No prose paragraphs.
citeSample: true
---

This file is a stock earnings report (SEC Form 10-K or 10-Q). type is Financial Report. keyFacts are the company name, the ticker, the form, the fiscal year and quarter, and the period end or filing date when those strings are in the sample.

tags: sec-filing, financial-report, exactly one of 10-k or 10-q, exactly one of annual-report or quarterly-report, and fyYYYY for the fiscal year (for example fy2025). Do not tag the ticker or the company name. Do not tag pdf, and do not tag a bare quarter such as q1.
