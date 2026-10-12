/**
 * Run zipwiki-mcp the way a person and an agent do.
 * Help must include the startup header and the install config.
 * A piped start must stay silent so MCP stdout stays a protocol stream.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(pkgRoot, "src", "stdio.ts");

function run(args, { hangMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], {
      cwd: pkgRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", reject);
    let timer = null;
    if (hangMs != null) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        timer = setTimeout(() => child.kill("SIGKILL"), 500);
      }, hangMs);
    }
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

function fail(message, out) {
  console.error(message);
  console.error("---");
  console.error(out);
  process.exit(1);
}

function assertIncludes(out, needle) {
  if (!out.includes(needle)) fail(`missing ${JSON.stringify(needle)}`, out);
}

const help = await run(["--help"]);
if (help.code !== 0) fail(`zipwiki-mcp --help exited ${help.code}`, help.out);
assertIncludes(help.out, "ZipWiki MCP Version:");
assertIncludes(help.out, "beta");
assertIncludes(help.out, "Copyright © 2026 by NeoWare Inc, All rights reserved.");
assertIncludes(help.out, '"command": "zipwiki-mcp"');
assertIncludes(help.out, "https://zipwiki.ai/install");
process.stdout.write(help.out.endsWith("\n") ? help.out : `${help.out}\n`);

const quiet = await run(["--help", "-q"]);
if (quiet.code !== 0) fail(`zipwiki-mcp --help -q exited ${quiet.code}`, quiet.out);
if (quiet.out.includes("ZipWiki MCP Version:")) {
  fail("quiet help still printed the header", quiet.out);
}
assertIncludes(quiet.out, "https://zipwiki.ai/install");

const piped = await run([], { hangMs: 400 });
if (piped.out.includes("zipwiki.ai/install") || piped.out.includes("ZipWiki MCP Version:")) {
  fail("piped start printed the install screen", piped.out);
}

console.log("zipwiki-mcp help screen ok");
