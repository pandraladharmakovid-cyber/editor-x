import { getWebContainer } from './webcontainer';
import { defaultTemplate, FileSystemTree } from './template';
import { useStore } from '../store/useStore';
import {
  writeToTerminal,
  executeTerminalCommand,
  runTerminalProcess,
} from './terminalManager';
import {
  buildFileTree,
  watchFileSystem,
} from './fileWatcher';

export interface WebContainerInitializationOptions {
  /**
   * Filesystem tree to mount into the WebContainer.
   *
   * When omitted, the existing default project template is used.
   * Later, the workspace/project loader will provide the user's
   * persisted project tree here.
   */
  fileSystemTree?: FileSystemTree;

  /**
   * Whether dependencies should be installed when node_modules
   * does not already exist.
   *
   * Defaults to true.
   */
  installDependencies?: boolean;

  /**
   * Whether the development server should be started.
   *
   * Defaults to true.
   */
  startDevServer?: boolean;

  /**
   * Whether the filesystem watcher should be started.
   *
   * Defaults to true.
   */
  startFileWatcher?: boolean;
}

let initializationPromise: Promise<void> | null =
  null;

let devServerStarted = false;

let fileWatcherStarted = false;

/**
 * Mounts a filesystem tree into the shared WebContainer.
 */
async function mountFiles(
  tree: FileSystemTree,
): Promise<void> {
  const container =
    await getWebContainer();

  await container.mount(
    tree as any,
  );
}

/**
 * Checks whether node_modules already exists
 * in the project.
 */
async function checkDependenciesInstalled(): Promise<boolean> {
  try {
    const container =
      await getWebContainer();

    const entries =
      await container.fs.readdir('.');

    return entries.includes(
      'node_modules',
    );
  } catch {
    return false;
  }
}

/**
 * Installs project dependencies using the
 * terminal process manager.
 */
async function installDependencies(): Promise<void> {
  const {
    setInstalling,
  } = useStore.getState();

  setInstalling(true);

  writeToTerminal(
    '\r\n📦 Installing dependencies with pnpm...\r\n',
  );

  writeToTerminal(
    '─────────────────────────────────\r\n',
  );

  try {
    const exitCode =
      await executeTerminalCommand(
        'pnpm',
        ['install'],
      );

    if (exitCode !== 0) {
      throw new Error(
        `pnpm install failed with exit code ${exitCode}`,
      );
    }

    writeToTerminal(
      '✅ Dependencies installed successfully\r\n',
    );
  } finally {
    setInstalling(false);
  }
}

/**
 * Starts the project's development server.
 *
 * The process is registered with the terminal manager so it
 * can be tracked and terminated later.
 */
async function startDevServer(): Promise<void> {
  if (devServerStarted) {
    writeToTerminal(
      '\r\nℹ️ Dev server is already running\r\n',
    );

    return;
  }

  const {
    setRunning,
  } = useStore.getState();

  const container =
    await getWebContainer();

  devServerStarted = true;

  setRunning(true);

  writeToTerminal(
    '\r\n🔥 Starting dev server...\r\n',
  );

  writeToTerminal(
    '─────────────────────────────────\r\n',
  );

  try {
    container.on(
      'server-ready',
      (_port, url) => {
        writeToTerminal(
          '\r\n✅ Dev server ready!\r\n',
        );

        writeToTerminal(
          `🌐 Preview: ${url}\r\n`,
        );

        useStore
          .getState()
          .setPreviewUrl(url);
      },
    );

    await runTerminalProcess(
      'pnpm',
      ['run', 'dev'],
      {
        id: 'codeforge-dev-server',

        onExit: (exitCode) => {
          devServerStarted = false;

          useStore
            .getState()
            .setRunning(false);

          if (exitCode !== 0) {
            writeToTerminal(
              `\r\n❌ Dev server exited with code ${exitCode}\r\n`,
            );
          } else {
            writeToTerminal(
              '\r\nℹ️ Dev server stopped\r\n',
            );
          }
        },
      },
    );
  } catch (error) {
    devServerStarted = false;

    setRunning(false);

    throw error;
  }
}

/**
 * Starts the filesystem watcher once.
 */
async function startFileWatcher(): Promise<void> {
  if (fileWatcherStarted) {
    return;
  }

  const {
    setFileTree,
  } = useStore.getState();

  fileWatcherStarted = true;

  try {
    const initialTree =
      await buildFileTree();

    setFileTree(
      initialTree,
    );

    watchFileSystem(
      (tree) => {
        setFileTree(tree);
      },
      2000,
    );
  } catch (error) {
    fileWatcherStarted = false;

    throw error;
  }
}

/**
 * Initializes the WebContainer runtime.
 *
 * The initialization process is protected by a shared promise so
 * multiple components calling this function at the same time do not
 * boot, mount, install, or start the runtime multiple times.
 *
 * The function remains backwards compatible with:
 *
 *     initializeWebContainer()
 *
 * A persisted workspace can later be supplied with:
 *
 *     initializeWebContainer({
 *       fileSystemTree: projectTree,
 *     });
 */
export async function initializeWebContainer(
  options: WebContainerInitializationOptions = {},
): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise =
    initializeInternal(
      options,
    ).catch((error) => {
      initializationPromise = null;

      throw error;
    });

  return initializationPromise;
}

async function initializeInternal(
  options: WebContainerInitializationOptions,
): Promise<void> {
  const {
    fileSystemTree = defaultTemplate,

    installDependencies:
      shouldInstallDependencies = true,

    startDevServer:
      shouldStartDevServer = true,

    startFileWatcher:
      shouldStartFileWatcher = true,
  } = options;

  const {
    setBooting,
    setInstalling,
    setRunning,
    setFileTree,
    setPreviewUrl,
  } = useStore.getState();

  try {
    // -----------------------------------------------------------------------
    // Boot WebContainer
    // -----------------------------------------------------------------------

    setBooting(true);

    writeToTerminal(
      '🚀 Booting WebContainer...\r\n',
    );

    await getWebContainer();

    writeToTerminal(
      '✅ WebContainer booted successfully\r\n',
    );

    setBooting(false);

    // -----------------------------------------------------------------------
    // Mount project
    // -----------------------------------------------------------------------

    writeToTerminal(
      '📁 Mounting project file system...\r\n',
    );

    await mountFiles(
      fileSystemTree,
    );

    writeToTerminal(
      '✅ Project file system mounted\r\n',
    );

    // -----------------------------------------------------------------------
    // Build initial file tree
    // -----------------------------------------------------------------------

    const tree =
      await buildFileTree();

    setFileTree(tree);

    // -----------------------------------------------------------------------
    // Dependencies
    // -----------------------------------------------------------------------

    if (
      shouldInstallDependencies
    ) {
      const depsInstalled =
        await checkDependenciesInstalled();

      if (depsInstalled) {
        setInstalling(false);

        writeToTerminal(
          '\r\n✅ Dependencies already installed (using cache)\r\n',
        );
      } else {
        await installDependencies();
      }
    } else {
      setInstalling(false);

      writeToTerminal(
        '\r\n⏭️ Dependency installation skipped\r\n',
      );
    }

    // -----------------------------------------------------------------------
    // Development server
    // -----------------------------------------------------------------------

    if (
      shouldStartDevServer
    ) {
      await startDevServer();
    } else {
      setRunning(false);

      setPreviewUrl(null);

      writeToTerminal(
        '\r\n⏭️ Development server start skipped\r\n',
      );
    }

    // -----------------------------------------------------------------------
    // Filesystem watcher
    // -----------------------------------------------------------------------

    if (
      shouldStartFileWatcher
    ) {
      await startFileWatcher();
    }

    writeToTerminal(
      '\r\n🎉 WebContainer initialization complete\r\n',
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    writeToTerminal(
      `\r\n❌ WebContainer initialization failed: ${errorMessage}\r\n`,
    );

    setBooting(false);
    setInstalling(false);
    setRunning(false);
    setPreviewUrl(null);

    throw error;
  }
}