import { accessSync, constants, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { AGENTS, type Agent } from "./registry.ts";

export interface ScanEnv {
  home: string;
  pathDirs: string[];
  appDirs: string[];
}

export interface ScanResult {
  agent: Agent;
  found: boolean;
  skillsDir: string;
}

export function defaultScanEnv(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): ScanEnv {
  return {
    home,
    pathDirs: (env.PATH ?? "").split(delimiter).filter((dir) => dir !== ""),
    appDirs: ["/Applications", join(home, "Applications")],
  };
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);

    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function hasHomeDir(agent: Agent, env: ScanEnv): boolean {
  return agent.homeDirs.some((dir) => existsSync(join(env.home, dir)));
}

export function isOnPath(name: string, pathDirs: string[]): boolean {
  return pathDirs.some((dir) => isExecutableFile(join(dir, name)));
}

function hasBinary(agent: Agent, env: ScanEnv): boolean {
  return agent.binaries.some((name) => isOnPath(name, env.pathDirs));
}

function hasApp(agent: Agent, env: ScanEnv): boolean {
  return agent.apps.some((name) =>
    env.appDirs.some((dir) => existsSync(join(dir, name))),
  );
}

export function scanAgents(env: ScanEnv): ScanResult[] {
  return AGENTS.map((agent) => ({
    agent,
    found: hasHomeDir(agent, env) || hasBinary(agent, env) || hasApp(agent, env),
    skillsDir: join(env.home, ...agent.skillsDir),
  }));
}
