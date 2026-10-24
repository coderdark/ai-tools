import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class McpConfigError extends Error {}

/** The settings file is fine, but it already has a server with that name. */
export class McpServerExistsError extends McpConfigError {}

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
    throw new McpServerExistsError(`${path} already has a server named "${name}".`);
  }

  return { config, servers };
}

export type JsonConfigState =
  | { state: "free" }
  | { state: "exists" }
  | { state: "unreadable"; message: string };

/** What a write would meet: a free name, a name that exists, or a file that cannot be used. Changes nothing. */
export async function checkJsonConfig(path: string, key: string, name: string): Promise<JsonConfigState> {
  try {
    await readFreeServers(path, key, name);

    return { state: "free" };
  } catch (error) {
    if (error instanceof McpServerExistsError) {
      return { state: "exists" };
    }

    if (error instanceof McpConfigError) {
      return { state: "unreadable", message: error.message };
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

/**
 * Removes one server from the object under `key`, keeping everything else in the file.
 * Returns false, and writes nothing, when the file or the server is not there.
 * Refuses, and leaves the file as it was, when the file cannot be read as JSON.
 */
export async function removeFromJsonConfig(path: string, key: string, name: string): Promise<boolean> {
  const target = await realpath(path).catch(() => path);
  const config = await readConfig(target);
  const servers = readServers(config, key, target);

  if (!Object.hasOwn(servers, name)) {
    return false;
  }

  const { [name]: _removed, ...remaining } = servers;
  const existingMode = await stat(target).then((stats) => stats.mode & 0o777);

  await writeThroughTemporaryFile(target, `${JSON.stringify({ ...config, [key]: remaining }, null, 2)}\n`, existingMode);

  return true;
}
