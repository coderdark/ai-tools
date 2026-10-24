type KeypressListener = (chunk: unknown, key?: { name?: string }) => void;

export interface KeySource {
  on(event: "keypress", listener: KeypressListener): unknown;
  off(event: "keypress", listener: KeypressListener): unknown;
}

/** Runs a prompt that can be cancelled with Esc. Resolves to `undefined` when the user pressed Esc. */
export async function runUntilEscape<T>(
  run: (signal: AbortSignal) => Promise<T>,
  keys: KeySource,
): Promise<T | undefined> {
  const controller = new AbortController();
  let escaped = false;

  const onKeypress: KeypressListener = (_chunk, key) => {
    if (key?.name === "escape") {
      escaped = true;
      controller.abort();
    }
  };

  keys.on("keypress", onKeypress);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (escaped) {
      return undefined;
    }

    throw error;
  } finally {
    keys.off("keypress", onKeypress);
  }
}
