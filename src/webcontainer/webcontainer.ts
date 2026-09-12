import { WebContainer } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let webcontainerBootPromise: Promise<WebContainer> | null = null;

/**
 * Returns the single shared WebContainer instance.
 *
 * WebContainer.boot() is intentionally centralized here so multiple
 * parts of CODEFORGE can request the container at the same time without
 * creating multiple WebContainer instances.
 */
export async function getWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  if (webcontainerBootPromise) {
    return webcontainerBootPromise;
  }

  webcontainerBootPromise = WebContainer.boot()
    .then((container) => {
      webcontainerInstance = container;
      return container;
    })
    .catch((error) => {
      webcontainerInstance = null;
      webcontainerBootPromise = null;
      throw error;
    });

  return webcontainerBootPromise;
}

/**
 * Returns true once the shared WebContainer instance is available.
 */
export function isWebContainerReady(): boolean {
  return webcontainerInstance !== null;
}

/**
 * Writes a UTF-8 text file to the WebContainer filesystem.
 */
export async function writeFile(
  path: string,
  content: string,
): Promise<void> {
  if (!path.trim()) {
    throw new Error('Cannot write a file without a path.');
  }

  const container = await getWebContainer();

  await container.fs.writeFile(path, content);
}

/**
 * Writes raw binary data to the WebContainer filesystem.
 */
export async function writeBinaryFile(
  path: string,
  content: Uint8Array,
): Promise<void> {
  if (!path.trim()) {
    throw new Error('Cannot write a file without a path.');
  }

  const container = await getWebContainer();

  await container.fs.writeFile(path, content);
}

/**
 * Reads a UTF-8 text file from the WebContainer filesystem.
 */
export async function readFile(
  path: string,
): Promise<string> {
  if (!path.trim()) {
    throw new Error('Cannot read a file without a path.');
  }

  const container = await getWebContainer();

  return container.fs.readFile(path, 'utf-8');
}

/**
 * Reads a file as raw binary data.
 */
export async function readBinaryFile(
  path: string,
): Promise<Uint8Array> {
  if (!path.trim()) {
    throw new Error('Cannot read a file without a path.');
  }

  const container = await getWebContainer();

  return container.fs.readFile(path);
}

/**
 * Creates a directory and all missing parent directories.
 */
export async function mkdir(
  path: string,
): Promise<void> {
  if (!path.trim()) {
    throw new Error('Cannot create a directory without a path.');
  }

  const container = await getWebContainer();

  await container.fs.mkdir(path, {
    recursive: true,
  });
}

/**
 * Removes a file or directory recursively.
 */
export async function rm(
  path: string,
): Promise<void> {
  if (!path.trim()) {
    throw new Error('Cannot remove a file or directory without a path.');
  }

  const container = await getWebContainer();

  await container.fs.rm(path, {
    recursive: true,
  });
}

/**
 * Reads the direct children of a directory.
 */
export async function readdir(
  path: string,
): Promise<string[]> {
  const container = await getWebContainer();

  return container.fs.readdir(path);
}

/**
 * Runs a command inside WebContainer and waits for its exit code.
 *
 * Output is always consumed so the process output stream does not
 * remain unattended. When an output callback is supplied, each chunk
 * is forwarded to the caller.
 *
 * This function preserves the existing runCommand() API used by the
 * rest of CODEFORGE.
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  onOutput?: (output: string) => void,
): Promise<number> {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
    throw new Error('Cannot run an empty WebContainer command.');
  }

  const container = await getWebContainer();

  const process = await container.spawn(
    trimmedCommand,
    args,
  );

  const outputPromise = process.output.pipeTo(
    new WritableStream<string>({
      write(data) {
        onOutput?.(data);
      },
    }),
  );

  let exitCode: number;

  try {
    exitCode = await process.exit;
  } catch (error) {
    try {
      await outputPromise;
    } catch {
      // Ignore output-stream cleanup errors when the process itself
      // has already failed.
    }

    throw error;
  }

  await outputPromise;

  return exitCode;
}