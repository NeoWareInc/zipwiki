import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { ZIPWIKI_HOME_ENV } from "../config/home.js";
import { setChainArchiveModule } from "./archive-module.js";
import {
  ChainError,
  chainConfigPath,
  loadChainConfig,
  maskEmail,
  maskMiddle,
  normalizeChainNetwork,
  resolveChainSettings,
  saveChainConfig,
} from "./config.js";
import { mintPackage } from "./mint.js";
import { stampPackage } from "./stamp.js";
import { upgradePackage } from "./upgrade.js";
import { archiveMerkleRoot, verifyPackage } from "./verify.js";

const ROOT = "ab".repeat(32);
const noEnv = { env: {} as NodeJS.ProcessEnv, skipNeozipConnection: true };

describe("chain config", () => {
  const dirs: string[] = [];
  beforeEach(() => {
    const d = mkdtempSync(join(tmpdir(), "zipwiki-chain-"));
    dirs.push(d);
    process.env[ZIPWIKI_HOME_ENV] = d;
  });
  after(() => {
    delete process.env[ZIPWIKI_HOME_ENV];
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it("writes only non-secret fields to chain.json", () => {
    saveChainConfig({
      network: "base",
      email: "a@example.com",
      tokenServiceUrl: "https://ts.example",
      // @ts-expect-error secrets must be dropped
      walletKey: "0xdeadbeef",
      accessToken: "tok",
    });
    const raw = readFileSync(chainConfigPath(), "utf8");
    assert.ok(!/deadbeef|tok"|walletKey|accessToken/i.test(raw));
    assert.deepEqual(loadChainConfig(), {
      network: "base",
      email: "a@example.com",
      tokenServiceUrl: "https://ts.example",
    });
    saveChainConfig({ email: "" });
    assert.equal(loadChainConfig().email, undefined);
  });

  it("ignores secrets already present in a hand-edited chain.json", () => {
    writeFileSync(
      chainConfigPath(),
      JSON.stringify({ network: "base", walletKey: "0xabc" }),
    );
    assert.deepEqual(loadChainConfig(), { network: "base" });
  });

  it("merges arg > env > chain.json > neozip connection > default", async () => {
    saveChainConfig({ network: "base", email: "file@example.com" });
    const loadConnection = () => ({
      email: "conn@example.com",
      network: "base-sepolia",
      tokenServiceUrl: "https://conn.example",
      walletPrivateKey: "0xconn",
    });
    const fileOnly = await resolveChainSettings({ env: {}, loadConnection });
    assert.equal(fileOnly.network, "base");
    assert.equal(fileOnly.email, "file@example.com");
    assert.equal(fileOnly.tokenServiceUrl, "https://conn.example");
    assert.equal(fileOnly.sources.email, "chain.json");
    assert.equal(fileOnly.sources.tokenServiceUrl, "neozip");
    assert.equal(fileOnly.walletKey, "0xconn");

    const env = {
      NEOZIP_RECIPIENT_EMAIL: "env@example.com",
      TOKEN_SERVICE_URL: "https://env.example",
      ZIPWIKI_WALLET_KEY: "0xzip",
      NEOZIP_WALLET_PASSKEY: "0xpass",
      NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN: "bearer",
    };
    const withEnv = await resolveChainSettings({ env, loadConnection });
    assert.equal(withEnv.email, "env@example.com");
    assert.equal(withEnv.tokenServiceUrl, "https://env.example");
    assert.equal(withEnv.walletKey, "0xzip");
    assert.equal(withEnv.accessToken, "bearer");

    const withArg = await resolveChainSettings({
      env,
      loadConnection,
      overrides: { email: "arg@example.com", network: "base-sepolia" },
    });
    assert.equal(withArg.email, "arg@example.com");
    assert.equal(withArg.network, "base-sepolia");
    assert.equal(withArg.sources.email, "arg");

    const passkey = await resolveChainSettings({
      env: { NEOZIP_WALLET_PASSKEY: "0xpass" },
      skipNeozipConnection: true,
    });
    assert.equal(passkey.walletKey, "0xpass");
    saveChainConfig({ network: "", email: "" });
    const empty = await resolveChainSettings(noEnv);
    assert.equal(empty.network, "base-sepolia");
    assert.equal(empty.sources.network, "default");
  });

  it("validates networks and masks values", () => {
    assert.equal(normalizeChainNetwork("BASE"), "base");
    assert.equal(normalizeChainNetwork(undefined), undefined);
    assert.throws(() => normalizeChainNetwork("mainnet"), ChainError);
    assert.equal(maskEmail("steve@example.com"), "st***@example.com");
    assert.equal(maskMiddle("0x1234567890abcdef1234", 6, 4), "0x1234…1234");
  });
});

describe("chain wrappers (mocked archive module)", () => {
  const calls: Record<string, unknown[]> = {};
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
    setChainArchiveModule({
      stampArchive: (async (path: string, o: unknown) => {
        calls.stamp = [path, o];
        return { merkleRoot: ROOT, sidecar: {}, written: true };
      }) as never,
      upgradeTimestamp: (async (path: string, o: unknown) => {
        calls.upgrade = [path, o];
        return { status: "confirmed", merkleRoot: ROOT };
      }) as never,
      mintTimestampProof: (async (path: string, o: unknown) => {
        calls.mint = [path, o];
        return { merkleRoot: ROOT, tokenId: "1", transactionHash: "0x1", owner: "0xo" };
      }) as never,
      mintDirect: (async (path: string, o: unknown) => {
        calls.direct = [path, o];
        return { merkleRoot: ROOT, mintingResult: {} };
      }) as never,
      verifyArchive: (async (path: string, o: unknown) => {
        calls.verify = [path, o];
        return { kind: "none", merkle: { match: false }, status: "none" };
      }) as never,
      resolveMerkleRoot: (async () => ROOT) as never,
    });
  });
  afterEach(() => setChainArchiveModule(null));

  it("stamp requires an email and forwards network/force", async () => {
    await assert.rejects(
      stampPackage("/p.zipwiki", { settings: noEnv }),
      (e: unknown) => e instanceof ChainError && e.code === "missing_email",
    );
    assert.equal(calls.stamp, undefined);
    const r = await stampPackage("/p.zipwiki", {
      email: "a@example.com",
      network: "base",
      force: true,
      merkleRoot: ROOT,
      settings: noEnv,
    });
    assert.equal(r.stamp.merkleRoot, ROOT);
    assert.deepEqual(calls.stamp, [
      "/p.zipwiki",
      { email: "a@example.com", network: "base", merkleRoot: ROOT, force: true },
    ]);
  });

  it("stamp --wait chains upgrade with wait:true", async () => {
    const r = await stampPackage("/p.zipwiki", {
      email: "a@example.com",
      wait: true,
      settings: noEnv,
    });
    assert.equal(r.upgrade?.status, "confirmed");
    assert.deepEqual((calls.upgrade as unknown[])[1], {
      wait: true,
      merkleRoot: ROOT,
    });
  });

  it("upgrade passes wait", async () => {
    await upgradePackage("/p.zipwiki", { wait: true, settings: noEnv });
    assert.deepEqual((calls.upgrade as unknown[])[1], { wait: true });
  });

  it("mint needs a wallet key; default is TimestampProof, --direct uses mintDirect", async () => {
    await assert.rejects(
      mintPackage("/p.zipwiki", { settings: noEnv }),
      (e: unknown) => e instanceof ChainError && e.code === "missing_wallet_key",
    );
    const env = { ZIPWIKI_WALLET_KEY: "0xkey", NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN: "t" };
    const tp = await mintPackage("/p.zipwiki", {
      network: "base",
      settings: { env, skipNeozipConnection: true },
    });
    assert.equal(tp.mode, "timestamp-proof");
    assert.deepEqual((calls.mint as unknown[])[1], {
      walletPrivateKey: "0xkey",
      accessToken: "t",
      network: "base",
    });
    const d = await mintPackage("/p.zipwiki", {
      direct: true,
      walletKey: "0xarg",
      settings: noEnv,
    });
    assert.equal(d.mode, "direct");
    assert.deepEqual((calls.direct as unknown[])[1], {
      walletPrivateKey: "0xarg",
      network: "base-sepolia",
    });
  });

  it("verify is offline by default and online on request", async () => {
    await verifyPackage("/p.zipwiki");
    assert.deepEqual((calls.verify as unknown[])[1], { online: false });
    await verifyPackage("/p.zipwiki", { online: true, serverUrl: "https://s" });
    assert.deepEqual((calls.verify as unknown[])[1], {
      online: true,
      serverUrl: "https://s",
    });
    assert.equal(await archiveMerkleRoot("/p.zipwiki"), ROOT);
  });

});
