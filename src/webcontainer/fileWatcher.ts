import { getWebContainer } from './webcontainer';
import type { FileTreeNode } from '../store/useStore';

const DEFAULT_WATCH_INTERVAL = 2000;
const MIN_WATCH_INTERVAL = 250;
const MAX_WATCH_INTERVAL = 15000;
const ERROR_BACKOFF_MULTIPLIER = 2;
const MAX_SCAN_DEPTH = 100;

let activeWatcherCleanup: (() => void) | null = null;
let activeWatcherRefresh: (() => void) | null = null;
let activeWatcherStatus: (() => FileWatcherStatus) | null = null;

export interface BuildFileTreeOptions {
  maxDepth?: number;
  includeHidden?: boolean;
}

export interface FileWatcherOptions {
  intervalMs?: number;
  maxDepth?: number;
  includeHidden?: boolean;
  immediate?: boolean;
}

export interface FileWatcherStatus {
  isWatching: boolean;
  scanInProgress: boolean;
  lastScanAt: number | null;
  lastChangeAt: number | null;
  scanCount: number;
  changeCount: number;
  errorCount: number;
  intervalMs: number;
  currentIntervalMs: number;
}

function normalizeDepth(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return MAX_SCAN_DEPTH;
  }

  return Math.max(
    0,
    Math.min(
      MAX_SCAN_DEPTH,
      Math.floor(value as number),
    ),
  );
}

function normalizeInterval(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WATCH_INTERVAL;
  }

  return Math.max(
    MIN_WATCH_INTERVAL,
    Math.min(
      MAX_WATCH_INTERVAL,
      Math.floor(value as number),
    ),
  );
}

function shouldIncludeEntry(
  name: string,
  includeHidden: boolean,
): boolean {
  if (includeHidden) {
    return true;
  }

  return !name.startsWith('.') || name === '.env';
}

function joinFileTreePath(
  parentPath: string,
  name: string,
): string {
  if (parentPath === '.' || parentPath === '') {
    return name;
  }

  return `${parentPath.replace(/\/+$/, '')}/${name}`;
}

/**
 * Builds a complete FileTreeNode representation of the
 * WebContainer filesystem.
 *
 * Directories are listed before files and each group is sorted
 * alphabetically. This preserves the existing Explorer/store contract.
 *
 * The optional options object is deliberately additive: existing callers
 * can continue using buildFileTree(path) without any changes.
 */
export async function buildFileTree(
  path = '.',
  options: BuildFileTreeOptions = {},
): Promise<FileTreeNode[]> {
  const container = await getWebContainer();
  const maxDepth = normalizeDepth(options.maxDepth);
  const includeHidden = options.includeHidden ?? true;

  async function build(
    currentPath: string,
    depth: number,
  ): Promise<FileTreeNode[]> {
    try {
      const entries = await container.fs.readdir(
        currentPath,
        {
          withFileTypes: true,
        },
      );

      const nodes: FileTreeNode[] = [];

      for (const entry of entries) {
        if (
          !shouldIncludeEntry(
            entry.name,
            includeHidden,
          )
        ) {
          continue;
        }

        const fullPath = joinFileTreePath(
          currentPath,
          entry.name,
        );

        if (entry.isDirectory()) {
          const children =
            depth < maxDepth
              ? await build(
                  fullPath,
                  depth + 1,
                )
              : [];

          nodes.push({
            name: entry.name,
            path: fullPath,
            type: 'directory',
            children,
          });
        } else {
          nodes.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
          });
        }
      }

      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }

        return a.name.localeCompare(
          b.name,
          undefined,
          {
            sensitivity: 'base',
            numeric: true,
          },
        );
      });
    } catch (error) {
      console.error(
        `Error building file tree for "${currentPath}":`,
        error,
      );

      return [];
    }
  }

  return build(path, 0);
}

/**
 * Produces a stable representation of the Explorer tree.
 *
 * JSON is intentionally used here rather than a lossy hash. The Explorer
 * trees are normally small enough for this operation, and exact comparison
 * avoids false-positive UI updates after bulk filesystem changes.
 */
function serializeFileTree(
  tree: FileTreeNode[],
): string {
  return JSON.stringify(tree);
}

/**
 * Reads the current filesystem tree once and returns it.
 *
 * This is useful after a large Smart Paste/project import when the caller
 * wants an explicit refresh rather than waiting for the polling interval.
 */
export async function refreshFileTree(
  options: BuildFileTreeOptions = {},
): Promise<FileTreeNode[]> {
  return buildFileTree('.', options);
}

/**
 * Requests an immediate watcher scan.
 *
 * Returns true when a watcher is currently active and the scan request was
 * accepted. The active watcher owns the actual filesystem read so callers do
 * not create competing recursive scans.
 */
export function requestFileSystemRefresh(): boolean {
  if (!activeWatcherRefresh) {
    return false;
  }

  activeWatcherRefresh();
  return true;
}

/**
 * Returns the status of the active watcher, or a safe inactive snapshot when
 * no watcher is running.
 */
export function getFileWatcherStatus(): FileWatcherStatus {
  if (activeWatcherStatus) {
    return activeWatcherStatus();
  }

  return {
    isWatching: false,
    scanInProgress: false,
    lastScanAt: null,
    lastChangeAt: null,
    scanCount: 0,
    changeCount: 0,
    errorCount: 0,
    intervalMs: DEFAULT_WATCH_INTERVAL,
    currentIntervalMs: DEFAULT_WATCH_INTERVAL,
  };
}

/**
 * Watches the WebContainer filesystem using controlled polling.
 *
 * The WebContainer browser API does not expose a normal browser-side
 * fs.watch equivalent, so polling is used here.
 *
 * Protections:
 * - Only one watcher is active at a time.
 * - Scans cannot overlap.
 * - UI updates happen only when the tree actually changes.
 * - A manual refresh can trigger one immediate scan.
 * - Errors use bounded exponential backoff instead of hot-looping.
 * - Cleanup stops all future scans and invalidates queued work.
 */
export async function watchFileSystem(
  onUpdate: (tree: FileTreeNode[]) => void,
  intervalMsOrOptions:
    | number
    | FileWatcherOptions = DEFAULT_WATCH_INTERVAL,
): Promise<() => void> {
  if (activeWatcherCleanup) {
    activeWatcherCleanup();
    activeWatcherCleanup = null;
  }

  const options: FileWatcherOptions =
    typeof intervalMsOrOptions === 'number'
      ? { intervalMs: intervalMsOrOptions }
      : intervalMsOrOptions;

  const baseInterval = normalizeInterval(
    options.intervalMs,
  );

  const maxDepth = normalizeDepth(
    options.maxDepth,
  );

  const includeHidden =
    options.includeHidden ?? true;

  let isWatching = true;
  let scanInProgress = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let previousSerializedTree: string | null = null;
  let scanQueued = false;
  let currentInterval = baseInterval;
  let lastScanAt: number | null = null;
  let lastChangeAt: number | null = null;
  let scanCount = 0;
  let changeCount = 0;
  let errorCount = 0;

  const getStatus = (): FileWatcherStatus => ({
    isWatching,
    scanInProgress,
    lastScanAt,
    lastChangeAt,
    scanCount,
    changeCount,
    errorCount,
    intervalMs: baseInterval,
    currentIntervalMs: currentInterval,
  });

  const cleanup = (): void => {
    if (!isWatching) {
      return;
    }

    isWatching = false;
    scanQueued = false;

    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }

    if (activeWatcherCleanup === cleanup) {
      activeWatcherCleanup = null;
    }

    if (activeWatcherCleanup === cleanup) {
      activeWatcherRefresh = null;
      activeWatcherStatus = null;
    }
  };

  const scheduleNextScan = (
    delay = currentInterval,
  ): void => {
    if (!isWatching || timerId !== null) {
      return;
    }

    timerId = setTimeout(() => {
      timerId = null;
      void scan();
    }, delay);
  };

  const scan = async (): Promise<void> => {
    if (!isWatching) {
      return;
    }

    if (scanInProgress) {
      scanQueued = true;
      return;
    }

    scanInProgress = true;
    scanQueued = false;
    scanCount += 1;

    try {
      const tree = await buildFileTree('.', {
        maxDepth,
        includeHidden,
      });

      if (!isWatching) {
        return;
      }

      const serializedTree =
        serializeFileTree(tree);

      lastScanAt = Date.now();
      errorCount = 0;
      currentInterval = baseInterval;

      if (
        previousSerializedTree === null ||
        serializedTree !== previousSerializedTree
      ) {
        previousSerializedTree =
          serializedTree;
        lastChangeAt = lastScanAt;
        changeCount += 1;
        onUpdate(tree);
      }
    } catch (error) {
      errorCount += 1;
      currentInterval = Math.min(
        MAX_WATCH_INTERVAL,
        Math.max(
          baseInterval,
          currentInterval *
            ERROR_BACKOFF_MULTIPLIER,
        ),
      );

      console.error(
        'Error watching file system:',
        error,
      );
    } finally {
      scanInProgress = false;

      if (!isWatching) {
        return;
      }

      if (scanQueued) {
        scanQueued = false;
        scheduleNextScan(0);
        return;
      }

      scheduleNextScan();
    }
  };

  const requestRefresh = (): void => {
    if (!isWatching) {
      return;
    }

    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }

    if (scanInProgress) {
      scanQueued = true;
      return;
    }

    void scan();
  };

  activeWatcherCleanup = cleanup;
  activeWatcherRefresh = requestRefresh;
  activeWatcherStatus = getStatus;

  if (options.immediate !== false) {
    await scan();
  } else {
    scheduleNextScan();
  }

  return cleanup;
}

/**
 * Stops the currently active filesystem watcher.
 */
export function stopFileSystemWatcher(): void {
  if (activeWatcherCleanup) {
    activeWatcherCleanup();
  }

  activeWatcherCleanup = null;
  activeWatcherRefresh = null;
  activeWatcherStatus = null;
}
