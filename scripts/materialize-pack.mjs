/**
 * Turn a `pnpm deploy` tree into a classic node_modules directory.
 * npm drops symlinks when it extracts a tarball, and Node only resolves
 * packages from real directories it can see from the importing file.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";

const rootArg = process.argv[2];
if (!rootArg) {
  console.error("usage: node scripts/materialize-pack.mjs <deploy-dir>");
  process.exit(1);
}

const root = realpathSync(rootArg);
const store = join(root, "node_modules", ".pnpm");
if (!existsSync(store)) {
  console.error(`[zipwiki] ${store} is missing. Run pnpm deploy first.`);
  process.exit(1);
}

function readPkg(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function isPackageDir(dir) {
  try {
    return lstatSync(join(dir, "package.json")).isFile();
  } catch {
    return false;
  }
}

function depRootOf(realDir) {
  let dir = dirname(realDir);
  while (basename(dir) !== "node_modules") {
    dir = dirname(dir);
    if (dir === dirname(dir)) throw new Error(`no node_modules above ${realDir}`);
  }
  return dir;
}

function linkedPackages(depRoot, selfReal) {
  const found = [];
  for (const name of readdirSync(depRoot)) {
    if (name.startsWith(".")) continue;
    const path = join(depRoot, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(path);
      if (isPackageDir(real) && real !== selfReal) found.push(real);
      continue;
    }
    if (stat.isDirectory() && name.startsWith("@")) {
      for (const child of readdirSync(path)) {
        const childPath = join(path, child);
        if (!lstatSync(childPath).isSymbolicLink()) continue;
        const real = realpathSync(childPath);
        if (isPackageDir(real) && real !== selfReal) found.push(real);
      }
    }
  }
  return found;
}

function copyPackage(real, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(real, dest, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = src.slice(real.length);
      const parts = rel.split(sep);
      return !parts.includes("node_modules");
    },
  });
}

const staging = join(root, ".nm-flat");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging);

const topReal = new Map();
const placed = new Set();

function destFor(name, real, parentDest) {
  const parts = name.split("/");
  if (!topReal.has(name)) {
    topReal.set(name, real);
    return join(staging, ...parts);
  }
  if (topReal.get(name) === real) return join(staging, ...parts);
  if (!parentDest) {
    throw new Error(`version conflict for ${name} at the package root`);
  }
  return join(parentDest, "node_modules", ...parts);
}

function ensure(real, parentDest) {
  const name = readPkg(real).name;
  if (typeof name !== "string" || !name) {
    throw new Error(`package.json at ${real} has no name`);
  }
  const dest = destFor(name, real, parentDest);
  const key = `${real}=>${dest}`;
  if (placed.has(key)) return;
  placed.add(key);
  if (!existsSync(join(dest, "package.json"))) copyPackage(real, dest);
  for (const dep of linkedPackages(depRootOf(real), real)) {
    ensure(dep, dest);
  }
}

const rootPkg = readPkg(root);
for (const name of Object.keys(rootPkg.dependencies ?? {})) {
  const link = join(root, "node_modules", ...name.split("/"));
  ensure(realpathSync(link), null);
}

rmSync(join(root, "node_modules"), { recursive: true, force: true });
mkdirSync(join(root, "node_modules"));
for (const name of readdirSync(staging)) {
  cpSync(join(staging, name), join(root, "node_modules", name), {
    recursive: true,
    dereference: true,
  });
}
rmSync(staging, { recursive: true, force: true });

const left = [];
function countLinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) left.push(path);
    else if (entry.isDirectory()) countLinks(path);
  }
}
countLinks(root);
if (left.length > 0) {
  console.error(`[zipwiki] ${left.length} symlinks remain`);
  for (const path of left.slice(0, 10)) console.error(path);
  process.exit(1);
}
console.log(`[zipwiki] classic node_modules (${topReal.size} packages, no symlinks)`);
