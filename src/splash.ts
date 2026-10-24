import boxen from "boxen";
import type { ChalkInstance } from "chalk";
import type { AppInfo } from "./app-info.ts";

const MAX_WIDTH = 60;
const UNKNOWN_WIDTH_COLUMNS = 80;

/** The splash as lines to print: the name and version, then the description, in a box, and a blank line. */
export function formatSplash({ name, version, description }: AppInfo, colors: ChalkInstance, columns?: number): string[] {
  const title = `${colors.bold.magenta(name)} ${colors.yellow(`v${version}`)}`;
  const box = boxen([title, "", description].join("\n"), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "round",
    width: Math.min(MAX_WIDTH, columns || UNKNOWN_WIDTH_COLUMNS),
    ...(colors.level > 0 && { borderColor: "cyan" }),
  });

  return [...box.split("\n"), ""];
}
