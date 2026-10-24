export type AgentId = "cursor" | "claude" | "chatgpt" | "gemini" | "grok";

export interface Agent {
  id: AgentId;
  name: string;
  /** Config directories in the home folder, such as ".cursor". */
  homeDirs: string[];
  /** Command names looked up on PATH. */
  binaries: string[];
  /** App bundle names looked up in the Applications folders. */
  apps: string[];
  /** User skills directory, relative to the home folder. */
  skillsDir: string[];
}

export const AGENTS: readonly Agent[] = [
  {
    id: "cursor",
    name: "Cursor",
    homeDirs: [".cursor"],
    binaries: ["cursor"],
    apps: ["Cursor.app"],
    skillsDir: [".cursor", "skills"],
  },
  {
    id: "claude",
    name: "Claude",
    homeDirs: [".claude"],
    binaries: ["claude"],
    apps: ["Claude.app"],
    skillsDir: [".claude", "skills"],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    homeDirs: [".codex"],
    binaries: ["codex"],
    apps: ["ChatGPT.app"],
    skillsDir: [".codex", "skills"],
  },
  {
    id: "gemini",
    name: "Gemini",
    homeDirs: [".gemini"],
    binaries: ["gemini"],
    apps: ["Gemini.app"],
    skillsDir: [".gemini", "skills"],
  },
  {
    id: "grok",
    name: "Grok",
    homeDirs: [".grok"],
    binaries: ["grok"],
    apps: ["Grok.app"],
    skillsDir: [".grok", "skills"],
  },
];
