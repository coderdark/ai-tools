import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class McpConfigError extends Error {}

type JsonObject = Record<string, unknown>;

const PRIVATE_FILE_MODE = 0o600;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readConfig(path: string): Promise<JsonObject> {
  let text: string;

  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) {
      return {};
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new McpConfigError(`${path} is not valid JSON, so it was left unchanged.`);
  }

  if (!isObject(parsed)) {
    throw new McpConfigError(`${path} does not hold a JSON object, so it was left unchanged.`);
  }

  return parsed;
}

function readServers(config: JsonObject, key: string, path: string): JsonObject {
  const servers = config[key];

  if (servers === undefined) {
    return {};
  }

  if (!isObject(servers)) {
    throw new McpConfigError(`${path} has a "${key}" entry that is not an object, so it was left unchanged.`);
  }

  return servers;
}

async function readFreeServers(path: string, key: string, name: string): Promise<{ config: JsonObject; servers: JsonObject }> {
  const config = await readConfig(path);
  const servers = readServers(config, key, path);

  if (Object.hasOwn(servers, name)) {
    throw new McpConfigError(`${path} already has a server named "${name}".`);
  }

  return { config, servers };
}

/** The reason a write would be refused, or undefined when it would go ahead. Changes nothing. */
export async function checkJsonConfig(path: string, key: string, name: string): Promise<string | undefined> {
  try {
    await readFreeServers(path, key, name);

    return undefined;
  } catch (error) {
    if (error instanceof McpConfigError) {
      return error.message;
    }

    throw error;
  }
}

async function writeThroughTemporaryFile(target: string, text: string, existingMode: number | undefined): Promise<void> {
  const temporary = `${target}.${process.pid}.tmp`;
  const mode = existingMode ?? PRIVATE_FILE_MODE;

  try {
    await writeFile(temporary, text, { mode });
    await chmod(temporary, mode);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });

    throw error;
  }
}

/**
 * Adds one server to the object under `key`, keeping everything else in the file.
 * Refuses, and leaves the file as it was, when the file cannot be read as JSON
 * or already has a server with that name.
 */
export async function addToJsonConfig(path: string, key: string, name: string, entry: JsonObject): Promise<void> {
  const target = await realpath(path).catch(() => path);
  const { config, servers } = await readFreeServers(target, key, name);
  const existingMode = await stat(target).then(
    (stats) => stats.mode & 0o777,
    () => undefined,
  );
  const next = { ...config, [key]: { ...servers, [name]: entry } };

  await mkdir(dirname(target), { recursive: true });
  await writeThroughTemporaryFile(target, `${JSON.stringify(next, null, 2)}\n`, existingMode);
}
