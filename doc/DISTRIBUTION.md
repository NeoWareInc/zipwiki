# Distribution notices

Checked when packaging ZipWiki for customers. Do this before the first
installer, binary, or hosted image that includes LiteParse.

## LiteParse

`@llamaindex/liteparse` (source: https://github.com/run-llama/liteparse) is
**Apache License 2.0**. ZipWiki may ship it inside a closed-source app, as
the npm package or the compiled native binary. Apache 2.0 does not require
ZipWiki itself to be open source.

The repo root has `LICENSE` and no `NOTICE` file. When a build includes
LiteParse:

1. Ship a copy of the Apache License 2.0 with the app.
2. If ZipWiki changes LiteParse files, mark those files as changed.
3. Keep existing copyright, patent, trademark, and attribution notices in any
   LiteParse source that is shipped.
4. Use the names LiteParse and LlamaIndex only to identify the origin of that
   component.

Put this in a `THIRD_PARTY_NOTICES` file or an about/licenses screen, next to
the full Apache 2.0 text:

```text
LiteParse
https://github.com/run-llama/liteparse
Copyright LlamaIndex
Licensed under the Apache License, Version 2.0.
You may obtain a copy of the License at
http://www.apache.org/licenses/LICENSE-2.0
```

The npm package also bundles **PDFium** (BSD-style) and **Tesseract**
(Apache 2.0). Name both in the same notices file and include their license
texts. EasyOCR and PaddleOCR are optional HTTP servers and are not part of
the default library.

Dependency today: `@llamaindex/liteparse` in `apps/zipwiki/package.json`.

## Update reminder

The website always serves the current deploy. The reminder is for the
installed **zipwiki** CLI (and later the Rust binary).

On startup, compare the version baked into that build with a small public
manifest you publish when you cut a release. Print one line and keep going.
Do not download or replace the binary.

Publish this at a stable URL you control, for example
`https://zipwiki.ai/releases/latest.json` (a static file is enough; no login):

```json
{
  "version": "0.2.0",
  "url": "https://github.com/NeoWare/zipwiki/releases/tag/v0.2.0"
}
```

Behavior:

1. Read the running version from the package (today both CLIs report `0.1.0`).
2. If `~/.zipwiki/update-check.json` was written in the last 24 hours, skip
   the network. `ZIPWIKI_HOME` relocates that directory.
3. Otherwise GET the manifest with a short timeout. On any failure, continue
   silently.
4. If the manifest version is newer, write one line to stderr:

   `[zipwiki] 0.2.0 is available (you have 0.1.0). https://…`

5. Skip the check when `ZIPWIKI_NO_UPDATE_CHECK=1`, in CI, or when the command
   is quiet. MCP can use the same check and the same cache so agents are not
   nagged on every tool call.

Ship the check with the first packaged CLI. Until then, bump the manifest only
when a release customers can install actually exists.
