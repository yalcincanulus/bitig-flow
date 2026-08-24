type InteractiveInput = Readonly<{
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
}>;

export function requireInteractiveInvocation(arguments_: string[], input: NodeJS.ReadStream) {
  if (arguments_.length > 0) {
    throw new Error("This command does not accept command-line arguments");
  }
  if (!input.isTTY) throw new Error("This command requires an interactive TTY");
}

export async function hiddenPrompt(prompt: string, { input, output }: InteractiveInput) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Hidden input requires an interactive TTY");
  }

  output.write(prompt);
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";

    function cleanup() {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    }

    function onData(chunk: string | Buffer) {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    }

    input.on("data", onData);
  });
}
