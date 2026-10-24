import { createPrompt, isEnterKey, useKeypress, usePrefix, useState } from "@inquirer/core";
import { styleText } from "node:util";

export interface TextPromptConfig {
  message: string;
  /** The line shown under the field while the user types, such as the keys that work. */
  footer: string;
  /** Resolves to `true` when the value is acceptable, or to the message to show when it is not. */
  validate(value: string): Promise<true | string>;
}

const EMPTY_VALUE_MESSAGE = "You must provide a value";

/**
 * A required text field with a footer line, like the footer of the lists.
 * `@inquirer/input` has no footer, so this is a small prompt of our own.
 */
export const textPromptWithFooter = createPrompt<string, TextPromptConfig>((config, done) => {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const prefix = usePrefix({ status });

  useKeypress(async (key, readline) => {
    if (status !== "idle") {
      return;
    }

    if (!isEnterKey(key)) {
      setValue(readline.line);
      setError(undefined);

      return;
    }

    setStatus("loading");

    const result = value ? await config.validate(value) : EMPTY_VALUE_MESSAGE;

    if (result === true) {
      setStatus("done");
      done(value);

      return;
    }

    readline.write(value);
    setError(result);
    setStatus("idle");
  });

  const answer = status === "done" ? styleText("cyan", value) : value;
  const question = [prefix, styleText("bold", config.message), answer].join(" ");
  const errorLine = error ? styleText("red", `> ${error}`) : undefined;
  const bottom = status === "done" ? "" : [errorLine, config.footer].filter(Boolean).join("\n");

  return [question, bottom];
});
