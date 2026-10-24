import { readFileSync } from "node:fs";

export interface AppInfo {
  name: string;
  version: string;
  description: string;
}

type ReadFile = (url: URL) => string;

const FIELDS = ["name", "version", "description"] as const;

/** `../package.json` is the project's file from both src/ and dist/, because both sit one folder below it. */
const PACKAGE_JSON = new URL("../package.json", import.meta.url);

export function readAppInfo(read: ReadFile = (url) => readFileSync(url, "utf8")): AppInfo {
  const parsed: Partial<Record<(typeof FIELDS)[number], unknown>> = JSON.parse(read(PACKAGE_JSON));

  for (const field of FIELDS) {
    if (typeof parsed[field] !== "string") {
      throw new Error(`package.json has no "${field}"`);
    }
  }

  const { name, version, description } = parsed as AppInfo;

  return { name, version, description };
}
