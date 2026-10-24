import chalk, { Chalk, type ChalkInstance } from "chalk";

// chalk detects terminals and FORCE_COLOR, but not NO_COLOR (https://no-color.org).
export function createColors(
  env: NodeJS.ProcessEnv = process.env,
  base: ChalkInstance = chalk,
): ChalkInstance {
  return env.NO_COLOR ? new Chalk({ level: 0 }) : base;
}
