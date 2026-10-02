/**
 * Load package skills from a .zipwiki and resolve with built-ins / --skills.
 */

import {
  isPackageSkillPath,
  loadPackageSkillsFromEntries,
  resolveSkills,
  type ResolvedSkills,
  type SkillDoc,
  type SkillKind,
} from "@zipwiki/skills";
import {
  listZipEntries,
  readZipEntryVerified,
  useZipHandle,
} from "../archive/index.js";

export type OpenSkillsPayload = {
  base: Array<{
    name: string;
    description: string;
    kind: SkillKind;
    version?: string;
    path: string;
    markdown: string;
  }>;
  package: Array<{
    name: string;
    description: string;
    kind: SkillKind;
    version?: string;
    path: string;
    markdown: string;
  }>;
  replaced: boolean;
};

function serializeDoc(doc: SkillDoc) {
  return {
    name: doc.name,
    description: doc.description,
    kind: doc.kind,
    ...(doc.version ? { version: doc.version } : {}),
    path: doc.path,
    markdown: doc.markdown,
  };
}

/** Read `wiki/skills/*.md` from an open package. */
export function loadPackageSkillsFromZip(
  zipPath: string,
  aiRoot = "wiki",
): SkillDoc[] {
  return useZipHandle(zipPath, () => {
    const entries = listZipEntries(zipPath);
    const sources: Array<{ path: string; markdown: string }> = [];
    for (const e of entries) {
      if (!isPackageSkillPath(e.name, aiRoot) || !e.name.endsWith(".md")) {
        continue;
      }
      try {
        const data = readZipEntryVerified(zipPath, e.name).data;
        sources.push({ path: e.name, markdown: data.toString("utf8") });
      } catch {
        // skip unreadable
      }
    }
    return loadPackageSkillsFromEntries(sources, aiRoot);
  });
}

export function resolvePackageSkills(input: {
  kind: SkillKind;
  zipPath?: string;
  aiRoot?: string;
  skillsPath?: string | null;
  packageSkills?: SkillDoc[];
}): ResolvedSkills {
  const packageSkills =
    input.packageSkills ??
    (input.zipPath
      ? loadPackageSkillsFromZip(input.zipPath, input.aiRoot ?? "wiki")
      : []);
  return resolveSkills({
    kind: input.kind,
    skillsPath: input.skillsPath,
    packageSkills,
  });
}

export function toOpenSkillsPayload(resolved: ResolvedSkills): OpenSkillsPayload {
  return {
    base: resolved.base.map(serializeDoc),
    package: resolved.package.map(serializeDoc),
    replaced: resolved.replaced,
  };
}

/** True when an OKF-tree path should count as a concept (excludes skills + index/log). */
export function isOkfConceptEntryPath(
  entryPath: string,
  okfRoot: string,
  aiRoot = "wiki",
): boolean {
  const n = entryPath.replace(/\\/g, "/");
  if (isPackageSkillPath(n, aiRoot)) return false;
  if (!n.startsWith(okfRoot) || !n.endsWith(".md")) return false;
  if (n.endsWith("index.md") || n.endsWith("/log.md") || n.endsWith("/")) {
    return false;
  }
  return true;
}
