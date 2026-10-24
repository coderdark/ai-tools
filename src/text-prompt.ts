import { createPrompt, isEnterKey, useKeypress, usePrefix, useState } from "@inquirer/core";
import { styleText } from "node:util";

export interface TextPromptConfig {
  message: string;
  /** The line shown under the field while the user types, such as the keys that work. */
  footer: string;
  /** Returns `true` when the value is acceptable, or the message to show when it is not. */
  validate(value: string): true | string | Promise<true | string>;
  /** Lets the user submit nothing, which resolves to an empty string. */
  allowEmpty?: boolean;
}

const EMPTY_VALUE_MESSAGE = "You must provide a value";

async function checkValue(config: TextPromptConfig, value: string): Promise<true | string> {
  if (value) {
    return config.validate(value);
  }

  return config.allowEmpty ? true : EMPTY_VALUE_MESSAGE;
}

/**
 * A text field, required unless `allowEmpty` is set, with a footer line like the footer of the lists.
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

    const result = await checkValue(config, value);

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
