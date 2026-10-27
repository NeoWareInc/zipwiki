import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { setChainArchiveModule } from "@zipwiki/zipwiki/chain";
import { mint, stamp, upgrade, verify, type ToolResult } from "./handlers.js";
import {
  CHAIN_AGENT_INSTRUCTION,
  formatChainPlanDisplay,
  resolveChainPreview,
  shortDigest,
} from "./chain-preview.js";

const ROOT = "ab12".repeat(16);
const settings = { env: {} as NodeJS.ProcessEnv, skipNeozipConnection: true };

function body(r: ToolResult): Record<string, any> {
  return JSON.parse(r.content[0]!.text);
}

describe("chain approval tools", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipwiki-mcp-chain-"));
  const pkg = join(dir, "kb.zipwiki");
  const calls: string[] = [];
  const prevHome = process.env.ZIPWIKI_HOME;

  beforeEach(() => {
    process.env.ZIPWIKI_HOME = dir;
    writeFileSync(pkg, "not a real zip");
    calls.length = 0;
    setChainArchiveModule({
      resolveMerkleRoot: (async () => ROOT) as never,
      stampArchive: (async () => {
        calls.push("stamp");
        return { merkleRoot: ROOT, sidecar: {}, written: true };
      }) as never,
      upgradeTimestamp: (async () => {
        calls.push("upgrade");
        return { status: "pending", merkleRoot: ROOT };
      }) as never,
      mintDirect: (async () => {
        calls.push("mintDirect");
        return { merkleRoot: ROOT, mintingResult: {} };
      }) as never,
      mintTimestampProof: (async () => {
        calls.push("mintTimestampProof");
        return { merkleRoot: ROOT, tokenId: "1", transactionHash: "0x1", owner: "0xo" };
      }) as never,
      verifyArchive: (async (_p: string, o: { online?: boolean }) => {
        calls.push(`verify:${o.online}`);
        return { kind: "timestamp", merkle: { match: true, root: ROOT }, status: "confirmed-offline" };
      }) as never,
    });
  });
  afterEach(() => setChainArchiveModule(null));
  after(() => {
    if (prevHome === undefined) delete process.env.ZIPWIKI_HOME;
    else process.env.ZIPWIKI_HOME = prevHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it("stamp preview is a masked table and does nothing", async () => {
    const r = await stamp({ package: pkg, email: "steve@example.com", network: "base", settings });
    assert.equal(r.isError, undefined);
    const b = body(r);
    assert.equal(b.status, "preview");
    assert.equal(b.awaitingHumanApproval, true);
    assert.equal(b.agentInstruction, CHAIN_AGENT_INSTRUCTION);
    assert.match(b.displayForUser, /\| Action \| Package \| Network \| Merkle root \| Email \| Next step \|/);
    assert.match(b.displayForUser, /st\*\*\*@example\.com/);
    assert.ok(!b.displayForUser.includes("steve@example.com"));
    assert.ok(b.displayForUser.includes(shortDigest(ROOT)));
    assert.ok(!b.displayForUser.includes(ROOT));
    assert.deepEqual(calls, []);
  });

  it("confirm without humanApproved stays a preview (error) and does nothing", async () => {
    const r = await stamp({ package: pkg, email: "a@example.com", confirm: true, settings });
    assert.equal(r.isError, true);
    assert.equal(body(r).code, "stamp_needs_human_approval");
    assert.deepEqual(calls, []);
  });

  it("confirm + humanApproved executes stamp", async () => {
    const r = await stamp({
      package: pkg,
      email: "a@example.com",
      confirm: true,
      humanApproved: true,
      settings,
    });
    assert.equal(r.isError, undefined);
    const b = body(r);
    assert.equal(b.status, "stamped");
    assert.equal(b.merkleRoot, ROOT);
    assert.deepEqual(calls, ["stamp"]);
  });

  it("stamp execute without an email fails clearly", async () => {
    const r = await stamp({ package: pkg, confirm: true, humanApproved: true, settings });
    assert.equal(r.isError, true);
    assert.equal(body(r).code, "missing_email");
    assert.deepEqual(calls, []);
  });

  it("upgrade is gated the same way", async () => {
    assert.equal(body(await upgrade({ package: pkg, settings })).status, "preview");
    assert.deepEqual(calls, []);
    const done = body(
      await upgrade({ package: pkg, confirm: true, humanApproved: true, settings }),
    );
    assert.equal(done.status, "pending");
    assert.deepEqual(calls, ["upgrade"]);
  });

  it("mint preview warns about gas and a missing wallet; never takes a key arg", async () => {
    const b = body(await mint({ package: pkg, direct: true, settings }));
    assert.equal(b.status, "preview");
    assert.match(b.displayForUser, /\| Wallet \|/);
    assert.ok(b.warnings.some((w: string) => /gas/i.test(w)));
    assert.ok(b.warnings.some((w: string) => /No wallet key/.test(w)));
    assert.deepEqual(calls, []);
    const r = await mint({ package: pkg, direct: true, confirm: true, humanApproved: true, settings });
    assert.equal(r.isError, true);
    assert.equal(body(r).code, "missing_wallet_key");
    assert.deepEqual(calls, []);
  });

  it("mint executes direct vs timestamp-proof after approval", async () => {
    const withKey = { env: { ZIPWIKI_WALLET_KEY: "0x" + "11".repeat(32) }, skipNeozipConnection: true };
    const d = body(
      await mint({ package: pkg, direct: true, confirm: true, humanApproved: true, settings: withKey }),
    );
    assert.equal(d.mode, "direct");
    const t = body(
      await mint({ package: pkg, confirm: true, humanApproved: true, settings: withKey }),
    );
    assert.equal(t.mode, "timestamp-proof");
    assert.deepEqual(calls, ["mintDirect", "mintTimestampProof"]);
  });

  it("verify is read-only and offline by default", async () => {
    const off = body(await verify({ package: pkg }));
    assert.equal(off.online, false);
    assert.equal(off.status, "confirmed-offline");
    assert.equal(off.merkle.match, true);
    await verify({ package: pkg, online: true });
    assert.deepEqual(calls, ["verify:false", "verify:true"]);
  });

  it("formats a table row with action, package, network, digest, who, next step", async () => {
    const p = await resolveChainPreview("stamp", { package: pkg, email: "a@example.com", settings });
    const text = formatChainPlanDisplay(p.plan, [], p.cliCommand);
    assert.match(text, /\| stamp \(Token Service timestamp\) \|/);
    assert.match(p.cliCommand, /^zipwiki stamp .*--network base-sepolia --email <email>$/);
  });
});
