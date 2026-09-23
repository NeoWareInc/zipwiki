import { Command, Help } from "commander";

/**
 * Commander 12 has no helpGroup(). Store a heading and render root help
 * as Create, Query, and Account.
 */
declare module "commander" {
  interface Command {
    helpGroup(heading: string): this;
  }
}

type GroupedCommand = Command & { _helpGroup?: string };

const GROUP_ORDER = ["Create", "Query", "Account"] as const;

Command.prototype.helpGroup = function helpGroup(this: Command, heading: string) {
  (this as GroupedCommand)._helpGroup = heading;
  return this;
};

export function installGroupedHelp(program: Command): void {
  program.configureHelp({
    formatHelp(cmd, helper) {
      const text = Help.prototype.formatHelp.call(helper, cmd, helper);
      if (cmd.parent) return text;
      const marker = "\nCommands:\n";
      const idx = text.lastIndexOf(marker);
      if (idx < 0) return text;
      return `${text.slice(0, idx)}\n${renderGroups(cmd, helper)}`;
    },
  });
}

function renderGroups(cmd: Command, helper: Help): string {
  const termWidth = helper.padWidth(cmd, helper);
  const itemIndent = "  ";
  const groups = new Map<string, Command[]>();
  const rest: Command[] = [];
  for (const sub of helper.visibleCommands(cmd)) {
    const heading = (sub as GroupedCommand)._helpGroup;
    if (!heading) {
      rest.push(sub);
      continue;
    }
    const list = groups.get(heading) ?? [];
    list.push(sub);
    groups.set(heading, list);
  }

  const lines: string[] = [];
  const ordered = [
    ...GROUP_ORDER.filter((name) => groups.has(name)),
    ...[...groups.keys()].filter(
      (name) => !GROUP_ORDER.includes(name as (typeof GROUP_ORDER)[number]),
    ),
  ];
  for (const heading of ordered) {
    lines.push(`${heading}:`);
    for (const sub of groups.get(heading) ?? []) {
      lines.push(itemIndent + formatItem(sub, helper, termWidth));
    }
    lines.push("");
  }
  if (rest.length > 0) {
    lines.push("Commands:");
    for (const sub of rest) {
      lines.push(itemIndent + formatItem(sub, helper, termWidth));
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatItem(cmd: Command, helper: Help, termWidth: number): string {
  const term = helper.subcommandTerm(cmd);
  const description = helper.subcommandDescription(cmd);
  const helpWidth = helper.helpWidth ?? 80;
  const separator = 2;
  if (!description) return term;
  const fullText = `${term.padEnd(termWidth + separator)}${description}`;
  return helper.wrap(fullText, helpWidth - 2, termWidth + separator);
}
