import { getWebContainer } from './webcontainer';
import { writeToTerminal } from './terminalManager';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export interface ProjectFile {
  path: string;
  type: 'file';
  content: Uint8Array;
}

export interface ProjectSnapshot {
  files: ProjectFile[];
  createdAt: number;
}

export interface UploadOptions {
  targetPath?: string;
  overwrite?: boolean;
  ignoreUnnecessaryFiles?: boolean;
  preserveEmptyDirectories?: boolean;
}

export interface UploadResult {
  filesCreated: number;
  filesSkipped: number;
  directoriesCreated: number;
  bytesWritten: number;
  skippedPaths: string[];
}

export interface ProjectExport {
  files: ProjectFile[];
  totalFiles: number;
  totalBytes: number;
  createdAt: number;
}

export interface ProjectStats {
  files: number;
  directories: number;
  totalBytes: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_UPLOAD_OPTIONS: Required<UploadOptions> = {
  targetPath: '/',
  overwrite: true,
  ignoreUnnecessaryFiles: true,
  preserveEmptyDirectories: true,
};

const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  'coverage',
]);

const IGNORED_FILE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
]);

/* -------------------------------------------------------------------------- */
/* Error + terminal helpers                                                   */
/* -------------------------------------------------------------------------- */

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function logSuccess(message: string): void {
  writeToTerminal(`\r\n✅ ${message}\r\n`);
}

function logFailure(
  message: string,
  error: unknown,
): void {
  writeToTerminal(
    `\r\n❌ ${message}: ${formatError(error)}\r\n`,
  );
}

/* -------------------------------------------------------------------------- */
/* Path helpers                                                               */
/* -------------------------------------------------------------------------- */

function normalizePath(path: string): string {
  const normalized = path
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');

  if (!normalized) {
    throw new Error(
      'Filesystem path cannot be empty.',
    );
  }

  const isAbsolute = normalized.startsWith('/');

  const segments = normalized.split('/');
  const safeSegments: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      throw new Error(
        `Unsafe filesystem path "${path}". Parent traversal is not allowed.`,
      );
    }

    safeSegments.push(segment);
  }

  const result = safeSegments.join('/');

  if (isAbsolute) {
    return result ? `/${result}` : '/';
  }

  return result || '.';
}

function normalizeRelativePath(
  path: string,
): string {
  return normalizePath(path)
    .replace(/^\/+/, '')
    .replace(/^\.\/+/, '');
}

function joinPath(
  parentPath: string,
  childName: string,
): string {
  const parent = parentPath.replace(
    /\/+$/,
    '',
  );

  if (!parent || parent === '.') {
    return childName;
  }

  if (parent === '/') {
    return `/${childName}`;
  }

  return `${parent}/${childName}`;
}

function getFileName(path: string): string {
  const normalized = path.replace(
    /\\/g,
    '/',
  );

  return (
    normalized.split('/').pop() ||
    normalized
  );
}

function getParentPath(path: string): string {
  const normalized = path.replace(
    /\\/g,
    '/',
  );

  const index =
    normalized.lastIndexOf('/');

  if (index <= 0) {
    return normalized.startsWith('/')
      ? '/'
      : '.';
  }

  return normalized.slice(0, index);
}

function ensureSafeFileName(
  name: string,
): string {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error(
      'Filename cannot be empty.',
    );
  }

  if (
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    throw new Error(
      `Invalid filename "${name}".`,
    );
  }

  return trimmed;
}

function shouldIgnorePath(
  path: string,
  ignoreUnnecessaryFiles = true,
): boolean {
  if (!ignoreUnnecessaryFiles) {
    return false;
  }

  const relative =
    normalizeRelativePath(path);

  const segments = relative.split('/');

  for (const segment of segments) {
    if (
      IGNORED_DIRECTORY_NAMES.has(
        segment,
      )
    ) {
      return true;
    }
  }

  return IGNORED_FILE_NAMES.has(
    getFileName(relative),
  );
}

/* -------------------------------------------------------------------------- */
/* Basic file operations                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Creates or overwrites a UTF-8 text file.
 */
export async function createFile(
  path: string,
  content = '',
): Promise<void> {
  const normalizedPath =
    normalizePath(path);

  try {
    const container =
      await getWebContainer();

    const parent =
      getParentPath(normalizedPath);

    await container.fs.mkdir(parent, {
      recursive: true,
    });

    await container.fs.writeFile(
      normalizedPath,
      content,
    );

    logSuccess(
      `Created file: ${normalizedPath}`,
    );
  } catch (error) {
    logFailure(
      `Failed to create file "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

/**
 * Writes binary data to a file.
 */
export async function writeBinaryFile(
  path: string,
  content: Uint8Array,
): Promise<void> {
  const normalizedPath =
    normalizePath(path);

  try {
    const container =
      await getWebContainer();

    const parent =
      getParentPath(normalizedPath);

    await container.fs.mkdir(parent, {
      recursive: true,
    });

    await container.fs.writeFile(
      normalizedPath,
      content,
    );

    logSuccess(
      `Created binary file: ${normalizedPath}`,
    );
  } catch (error) {
    logFailure(
      `Failed to create binary file "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

/**
 * Reads a UTF-8 text file.
 */
export async function readFile(
  path: string,
): Promise<string> {
  const normalizedPath =
    normalizePath(path);

  try {
    const container =
      await getWebContainer();

    return await container.fs.readFile(
      normalizedPath,
      'utf-8',
    );
  } catch (error) {
    logFailure(
      `Failed to read file "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

/**
 * Reads a file as binary data.
 */
export async function readBinaryFile(
  path: string,
): Promise<Uint8Array> {
  const normalizedPath =
    normalizePath(path);

  try {
    const container =
      await getWebContainer();

    return await container.fs.readFile(
      normalizedPath,
    );
  } catch (error) {
    logFailure(
      `Failed to read binary file "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

/**
 * Creates a directory and missing parents.
 */
export async function createDirectory(
  path: string,
): Promise<void> {
  const normalizedPath =
    normalizePath(path);

  try {
    const container =
      await getWebContainer();

    await container.fs.mkdir(
      normalizedPath,
      {
        recursive: true,
      },
    );

    logSuccess(
      `Created directory: ${normalizedPath}`,
    );
  } catch (error) {
    logFailure(
      `Failed to create directory "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

/**
 * Checks whether a path exists.
 */
export async function pathExists(
  path: string,
): Promise<boolean> {
  const normalizedPath =
    normalizePath(path);

  try {
    const container =
      await getWebContainer();

    try {
      await container.fs.readdir(
        normalizedPath,
      );

      return true;
    } catch {
      await container.fs.readFile(
        normalizedPath,
      );

      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Checks whether a path is a directory.
 */
export async function isDirectory(
  path: string,
): Promise<boolean> {
  const normalizedPath =
    normalizePath(path);

  try {
    const container =
      await getWebContainer();

    await container.fs.readdir(
      normalizedPath,
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a file or directory recursively.
 */
export async function deleteFile(
  path: string,
): Promise<void> {
  const normalizedPath =
    normalizePath(path);

  if (normalizedPath === '/') {
    throw new Error(
      'The WebContainer filesystem root cannot be deleted.',
    );
  }

  try {
    const container =
      await getWebContainer();

    await container.fs.rm(
      normalizedPath,
      {
        recursive: true,
      },
    );

    logSuccess(
      `Deleted: ${normalizedPath}`,
    );
  } catch (error) {
    logFailure(
      `Failed to delete "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Copy / rename / move                                                       */
/* -------------------------------------------------------------------------- */

export async function copyFile(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  const source =
    normalizePath(sourcePath);

  const destination =
    normalizePath(destinationPath);

  if (source === destination) {
    return;
  }

  try {
    const container =
      await getWebContainer();

    await container.fs.mkdir(
      getParentPath(destination),
      {
        recursive: true,
      },
    );

    const content =
      await container.fs.readFile(
        source,
      );

    await container.fs.writeFile(
      destination,
      content,
    );

    logSuccess(
      `Copied: ${source} → ${destination}`,
    );
  } catch (error) {
    logFailure(
      `Failed to copy "${source}" to "${destination}"`,
      error,
    );

    throw error;
  }
}

async function copyDirectoryWithContainer(
  container: Awaited<
    ReturnType<typeof getWebContainer>
  >,
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<void> {
  await container.fs.mkdir(
    destinationDirectory,
    {
      recursive: true,
    },
  );

  const entries =
    await container.fs.readdir(
      sourceDirectory,
      {
        withFileTypes: true,
      },
    );

  for (const entry of entries) {
    const sourceEntry =
      joinPath(
        sourceDirectory,
        entry.name,
      );

    const destinationEntry =
      joinPath(
        destinationDirectory,
        entry.name,
      );

    if (entry.isDirectory()) {
      await copyDirectoryWithContainer(
        container,
        sourceEntry,
        destinationEntry,
      );
    } else {
      const content =
        await container.fs.readFile(
          sourceEntry,
        );

      await container.fs.writeFile(
        destinationEntry,
        content,
      );
    }
  }
}

async function isDirectoryWithContainer(
  container: Awaited<
    ReturnType<typeof getWebContainer>
  >,
  path: string,
): Promise<boolean> {
  try {
    await container.fs.readdir(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renames or moves a file/directory.
 */
export async function renameFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  const source =
    normalizePath(oldPath);

  const destination =
    normalizePath(newPath);

  if (source === destination) {
    return;
  }

  if (source === '/') {
    throw new Error(
      'The filesystem root cannot be renamed.',
    );
  }

  try {
    const container =
      await getWebContainer();

    await container.fs.mkdir(
      getParentPath(destination),
      {
        recursive: true,
      },
    );

    const fsWithRename =
      container.fs as typeof container.fs & {
        rename?: (
          oldPath: string,
          newPath: string,
        ) => Promise<void>;
      };

    if (
      typeof fsWithRename.rename ===
      'function'
    ) {
      await fsWithRename.rename(
        source,
        destination,
      );
    } else if (
      await isDirectoryWithContainer(
        container,
        source,
      )
    ) {
      await copyDirectoryWithContainer(
        container,
        source,
        destination,
      );

      await container.fs.rm(
        source,
        {
          recursive: true,
        },
      );
    } else {
      const content =
        await container.fs.readFile(
          source,
        );

      await container.fs.writeFile(
        destination,
        content,
      );

      await container.fs.rm(source);
    }

    logSuccess(
      `Renamed: ${source} → ${destination}`,
    );
  } catch (error) {
    logFailure(
      `Failed to rename "${source}"`,
      error,
    );

    throw error;
  }
}

/**
 * Moves a file/directory.
 */
export async function moveFile(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  await renameFile(
    sourcePath,
    destinationPath,
  );
}

/**
 * Copies an entire directory.
 */
export async function copyDirectory(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<void> {
  const source =
    normalizePath(sourceDirectory);

  const destination =
    normalizePath(destinationDirectory);

  if (source === destination) {
    return;
  }

  try {
    const container =
      await getWebContainer();

    await copyDirectoryWithContainer(
      container,
      source,
      destination,
    );

    logSuccess(
      `Copied directory: ${source} → ${destination}`,
    );
  } catch (error) {
    logFailure(
      `Failed to copy directory "${source}"`,
      error,
    );

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Directory listing                                                          */
/* -------------------------------------------------------------------------- */

export async function listDirectory(
  directoryPath = '/',
): Promise<FileEntry[]> {
  const normalizedPath =
    directoryPath.trim()
      ? directoryPath
          .trim()
          .replace(/\\/g, '/')
      : '/';

  try {
    const container =
      await getWebContainer();

    const entries =
      await container.fs.readdir(
        normalizedPath,
        {
          withFileTypes: true,
        },
      );

    const result: FileEntry[] =
      entries.map((entry) => ({
        name: entry.name,
        path: joinPath(
          normalizedPath,
          entry.name,
        ),
        type: entry.isDirectory()
          ? 'directory'
          : 'file',
      }));

    return result.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory'
          ? -1
          : 1;
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
    logFailure(
      `Failed to list directory "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

export async function listFilesRecursively(
  directoryPath = '/',
): Promise<string[]> {
  const normalizedPath =
    directoryPath.trim()
      ? directoryPath
          .trim()
          .replace(/\\/g, '/')
      : '/';

  try {
    const container =
      await getWebContainer();

    const files: string[] = [];

    async function walk(
      currentPath: string,
    ): Promise<void> {
      const entries =
        await container.fs.readdir(
          currentPath,
          {
            withFileTypes: true,
          },
        );

      const sortedEntries =
        [...entries].sort((a, b) =>
          a.name.localeCompare(
            b.name,
            undefined,
            {
              sensitivity: 'base',
              numeric: true,
            },
          ),
        );

      for (const entry of sortedEntries) {
        const entryPath =
          joinPath(
            currentPath,
            entry.name,
          );

        if (
          shouldIgnorePath(
            entryPath,
            true,
          )
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(entryPath);
        } else {
          files.push(entryPath);
        }
      }
    }

    await walk(normalizedPath);

    return files;
  } catch (error) {
    logFailure(
      `Failed to recursively list files in "${normalizedPath}"`,
      error,
    );

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Project snapshot                                                           */
/* -------------------------------------------------------------------------- */

export async function createProjectSnapshot(
  rootPath = '/',
  options?: {
    ignoreUnnecessaryFiles?: boolean;
  },
): Promise<ProjectSnapshot> {
  const root =
    normalizePath(rootPath);

  const ignore =
    options?.ignoreUnnecessaryFiles ??
    true;

  try {
    const container =
      await getWebContainer();

    const files: ProjectFile[] = [];

    async function walk(
      currentPath: string,
    ): Promise<void> {
      const entries =
        await container.fs.readdir(
          currentPath,
          {
            withFileTypes: true,
          },
        );

      for (const entry of entries) {
        const entryPath =
          joinPath(
            currentPath,
            entry.name,
          );

        if (
          shouldIgnorePath(
            entryPath,
            ignore,
          )
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(entryPath);
        } else {
          const content =
            await container.fs.readFile(
              entryPath,
            );

          files.push({
            path: entryPath,
            type: 'file',
            content:
              new Uint8Array(content),
          });
        }
      }
    }

    await walk(root);

    return {
      files,
      createdAt: Date.now(),
    };
  } catch (error) {
    logFailure(
      `Failed to create project snapshot for "${root}"`,
      error,
    );

    throw error;
  }
}

/**
 * Prepares all project files for Download/ZIP creation.
 */
export async function exportProject(
  rootPath = '/',
  options?: {
    ignoreUnnecessaryFiles?: boolean;
  },
): Promise<ProjectExport> {
  const snapshot =
    await createProjectSnapshot(
      rootPath,
      options,
    );

  let totalBytes = 0;

  for (const file of snapshot.files) {
    totalBytes +=
      file.content.byteLength;
  }

  logSuccess(
    `Prepared project export: ${snapshot.files.length} files (${totalBytes} bytes)`,
  );

  return {
    files: snapshot.files,
    totalFiles:
      snapshot.files.length,
    totalBytes,
    createdAt:
      snapshot.createdAt,
  };
}

/**
 * Restores a previously-created project snapshot.
 */
export async function restoreProjectSnapshot(
  snapshot: ProjectSnapshot,
  rootPath = '/',
): Promise<void> {
  const root =
    normalizePath(rootPath);

  try {
    const container =
      await getWebContainer();

    for (const file of snapshot.files) {
      const relative =
        normalizeRelativePath(
          file.path,
        );

      const destination =
        root === '/'
          ? `/${relative}`
          : joinPath(
              root,
              relative,
            );

      await container.fs.mkdir(
        getParentPath(destination),
        {
          recursive: true,
        },
      );

      await container.fs.writeFile(
        destination,
        file.content,
      );
    }

    logSuccess(
      `Restored project snapshot: ${snapshot.files.length} files`,
    );
  } catch (error) {
    logFailure(
      'Failed to restore project snapshot',
      error,
    );

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Browser upload                                                             */
/* -------------------------------------------------------------------------- */

function getBrowserRelativePath(
  file: File,
): string {
  const browserFile =
    file as File & {
      webkitRelativePath?: string;
    };

  return (
    browserFile.webkitRelativePath ||
    file.name
  )
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
}

/**
 * Uploads files selected through an HTML file input.
 *
 * Supports:
 * - Multiple files
 * - Folder selection through webkitdirectory
 * - Binary files
 * - Nested folders
 * - Ignoring node_modules/.git/build output
 */
export async function uploadFiles(
  files: FileList | File[],
  options: UploadOptions = {},
): Promise<UploadResult> {
  const config = {
    ...DEFAULT_UPLOAD_OPTIONS,
    ...options,
  };

  const targetRoot =
    normalizePath(
      config.targetPath,
    );

  const result: UploadResult = {
    filesCreated: 0,
    filesSkipped: 0,
    directoriesCreated: 0,
    bytesWritten: 0,
    skippedPaths: [],
  };

  try {
    const container =
      await getWebContainer();

    const createdDirectories =
      new Set<string>();

    for (const file of Array.from(
      files,
    )) {
      const rawPath =
        getBrowserRelativePath(file);

      if (!rawPath) {
        result.filesSkipped += 1;
        continue;
      }

      const relative =
        normalizeRelativePath(
          rawPath,
        );

      if (
        shouldIgnorePath(
          relative,
          config.ignoreUnnecessaryFiles,
        )
      ) {
        result.filesSkipped += 1;
        result.skippedPaths.push(
          relative,
        );
        continue;
      }

      ensureSafeFileName(
        getFileName(relative),
      );

      const destination =
        targetRoot === '/'
          ? `/${relative}`
          : joinPath(
              targetRoot,
              relative,
            );

      const parent =
        getParentPath(destination);

      if (
        !createdDirectories.has(parent)
      ) {
        await container.fs.mkdir(
          parent,
          {
            recursive: true,
          },
        );

        createdDirectories.add(parent);
      }

      if (
        !config.overwrite &&
        (await pathExistsWithContainer(
          container,
          destination,
        ))
      ) {
        result.filesSkipped += 1;
        result.skippedPaths.push(
          destination,
        );
        continue;
      }

      const content =
        new Uint8Array(
          await file.arrayBuffer(),
        );

      await container.fs.writeFile(
        destination,
        content,
      );

      result.filesCreated += 1;
      result.bytesWritten +=
        content.byteLength;
    }

    result.directoriesCreated =
      createdDirectories.size;

    logSuccess(
      `Uploaded project: ${result.filesCreated} files, ${result.directoriesCreated} directories`,
    );

    return result;
  } catch (error) {
    logFailure(
      'Failed to upload project files',
      error,
    );

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Browser folder upload                                                      */
/* -------------------------------------------------------------------------- */

interface DirectoryHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<
    FileSystemHandle
  >;
}

interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

/**
 * Uploads a folder using the File System Access API.
 */
export async function uploadDirectory(
  directoryHandle: unknown,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const config = {
    ...DEFAULT_UPLOAD_OPTIONS,
    ...options,
  };

  const targetRoot =
    normalizePath(
      config.targetPath,
    );

  const rootHandle =
    directoryHandle as
      | unknown as
      | DirectoryHandleLike
      | undefined;

  if (
    !rootHandle ||
    rootHandle.kind !== 'directory' ||
    typeof rootHandle.values !==
      'function'
  ) {
    throw new Error(
      'The selected folder cannot be read by this browser.',
    );
  }

  const result: UploadResult = {
    filesCreated: 0,
    filesSkipped: 0,
    directoriesCreated: 0,
    bytesWritten: 0,
    skippedPaths: [],
  };

  try {
    const container =
      await getWebContainer();

    async function walk(
      handle: DirectoryHandleLike,
      relativeDirectory: string,
    ): Promise<void> {
      for await (const entry of handle.values()) {
        const currentEntry =
          entry as unknown as
            | DirectoryHandleLike
            | FileHandleLike;
        const relativePath =
          relativeDirectory
            ? `${relativeDirectory}/${currentEntry.name}`
            : currentEntry.name;

        const normalizedRelative =
          normalizeRelativePath(
            relativePath,
          );

        if (
          shouldIgnorePath(
            normalizedRelative,
            config.ignoreUnnecessaryFiles,
          )
        ) {
          if (
            currentEntry.kind ===
            'file'
          ) {
            result.filesSkipped += 1;
            result.skippedPaths.push(
              normalizedRelative,
            );
          }

          continue;
        }

        if (
          currentEntry.kind ===
            'directory' &&
          typeof currentEntry.values ===
            'function'
        ) {
          const destinationDirectory =
            targetRoot === '/'
              ? `/${normalizedRelative}`
              : joinPath(
                  targetRoot,
                  normalizedRelative,
                );

          await container.fs.mkdir(
            destinationDirectory,
            {
              recursive: true,
            },
          );

          result.directoriesCreated +=
            1;

          await walk(
            currentEntry,
            normalizedRelative,
          );

          continue;
        }

        if (
          currentEntry.kind ===
            'file' &&
          typeof currentEntry.getFile ===
            'function'
        ) {
          const file =
            await currentEntry.getFile();

          const destination =
            targetRoot === '/'
              ? `/${normalizedRelative}`
              : joinPath(
                  targetRoot,
                  normalizedRelative,
                );

          if (
            !config.overwrite &&
            (await pathExistsWithContainer(
              container,
              destination,
            ))
          ) {
            result.filesSkipped += 1;
            result.skippedPaths.push(
              destination,
            );
            continue;
          }

          const content =
            new Uint8Array(
              await file.arrayBuffer(),
            );

          await container.fs.mkdir(
            getParentPath(destination),
            {
              recursive: true,
            },
          );

          await container.fs.writeFile(
            destination,
            content,
          );

          result.filesCreated += 1;
          result.bytesWritten +=
            content.byteLength;
        }
      }
    }

    await walk(rootHandle, '');

    logSuccess(
      `Uploaded folder: ${result.filesCreated} files`,
    );

    return result;
  } catch (error) {
    logFailure(
      'Failed to upload selected folder',
      error,
    );

    throw error;
  }
}

async function pathExistsWithContainer(
  container: Awaited<
    ReturnType<typeof getWebContainer>
  >,
  path: string,
): Promise<boolean> {
  try {
    try {
      await container.fs.readdir(path);
      return true;
    } catch {
      await container.fs.readFile(path);
      return true;
    }
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Project cleanup                                                            */
/* -------------------------------------------------------------------------- */

export async function cleanProject(
  rootPath = '/',
): Promise<string[]> {
  const root =
    normalizePath(rootPath);

  const removed: string[] = [];

  try {
    const container =
      await getWebContainer();

    async function walk(
      currentPath: string,
    ): Promise<void> {
      const entries =
        await container.fs.readdir(
          currentPath,
          {
            withFileTypes: true,
          },
        );

      for (const entry of entries) {
        const entryPath =
          joinPath(
            currentPath,
            entry.name,
          );

        if (
          entry.isDirectory() &&
          IGNORED_DIRECTORY_NAMES.has(
            entry.name,
          )
        ) {
          await container.fs.rm(
            entryPath,
            {
              recursive: true,
            },
          );

          removed.push(entryPath);
          continue;
        }

        if (entry.isDirectory()) {
          await walk(entryPath);
        }
      }
    }

    await walk(root);

    if (removed.length > 0) {
      logSuccess(
        `Cleaned ${removed.length} unnecessary project directories`,
      );
    }

    return removed;
  } catch (error) {
    logFailure(
      'Failed to clean project',
      error,
    );

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Project statistics                                                         */
/* -------------------------------------------------------------------------- */

export async function getProjectStats(
  rootPath = '/',
  options?: {
    ignoreUnnecessaryFiles?: boolean;
  },
): Promise<ProjectStats> {
  const root =
    normalizePath(rootPath);

  const ignore =
    options?.ignoreUnnecessaryFiles ??
    true;

  try {
    const container =
      await getWebContainer();

    let files = 0;
    let directories = 0;
    let totalBytes = 0;

    async function walk(
      currentPath: string,
    ): Promise<void> {
      const entries =
        await container.fs.readdir(
          currentPath,
          {
            withFileTypes: true,
          },
        );

      for (const entry of entries) {
        const entryPath =
          joinPath(
            currentPath,
            entry.name,
          );

        if (
          shouldIgnorePath(
            entryPath,
            ignore,
          )
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          directories += 1;
          await walk(entryPath);
        } else {
          const content =
            await container.fs.readFile(
              entryPath,
            );

          files += 1;
          totalBytes +=
            content.byteLength;
        }
      }
    }

    await walk(root);

    return {
      files,
      directories,
      totalBytes,
    };
  } catch (error) {
    logFailure(
      'Failed to calculate project statistics',
      error,
    );

    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Browser File conversion                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Converts project files into browser File objects.
 *
 * A dedicated ArrayBuffer is created here so TypeScript/DOM typings do not
 * confuse Uint8Array<ArrayBufferLike> with BlobPart.
 */
export function projectFilesToBrowserFiles(
  files: ProjectFile[],
): File[] {
  return files.map((file) => {
    const normalizedPath =
      normalizeRelativePath(
        file.path,
      );

    const buffer =
      new ArrayBuffer(
        file.content.byteLength,
      );

    new Uint8Array(buffer).set(
      file.content,
    );

    return new File(
      [buffer],
      getFileName(normalizedPath),
      {
        type: guessMimeType(
          normalizedPath,
        ),
      },
    );
  });
}

function guessMimeType(
  path: string,
): string {
  const lower =
    path.toLowerCase();

  if (lower.endsWith('.html')) {
    return 'text/html';
  }

  if (
    lower.endsWith('.js') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return 'text/javascript';
  }

  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx')
  ) {
    return 'text/plain';
  }

  if (lower.endsWith('.jsx')) {
    return 'text/plain';
  }

  if (lower.endsWith('.css')) {
    return 'text/css';
  }

  if (lower.endsWith('.json')) {
    return 'application/json';
  }

  if (lower.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  if (lower.endsWith('.png')) {
    return 'image/png';
  }

  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg')
  ) {
    return 'image/jpeg';
  }

  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }

  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }

  if (lower.endsWith('.ico')) {
    return 'image/x-icon';
  }

  if (lower.endsWith('.woff')) {
    return 'font/woff';
  }

  if (lower.endsWith('.woff2')) {
    return 'font/woff2';
  }

  if (lower.endsWith('.ttf')) {
    return 'font/ttf';
  }

  if (lower.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (lower.endsWith('.txt')) {
    return 'text/plain';
  }

  if (lower.endsWith('.md')) {
    return 'text/markdown';
  }

  return 'application/octet-stream';
}
/* -------------------------------------------------------------------------- */
/* Smart Paste / Multi-file project ingestion                                 */
/* -------------------------------------------------------------------------- */

/**
 * A file discovered by the Smart Paste parser.
 *
 * The parser deliberately keeps the original text content in memory until
 * the caller explicitly commits the plan. This gives the UI a chance to
 * preview and validate a large paste before anything is written to the
 * WebContainer filesystem.
 */
export interface SmartPasteFile {
  path: string;
  content: string;
  bytes: number;
  lineCount: number;
  source: 'marker' | 'heading' | 'shell-script' | 'json' | 'single-file';
}

export interface SmartPasteIssue {
  severity: 'warning' | 'error';
  message: string;
  path?: string;
  line?: number;
}

export interface SmartPasteAnalysis {
  isProjectPayload: boolean;
  format: 'editor-x' | 'markdown' | 'shell-script' | 'json' | 'single-file' | 'unknown';
  files: SmartPasteFile[];
  directories: string[];
  issues: SmartPasteIssue[];
  totalFiles: number;
  totalDirectories: number;
  totalBytes: number;
  totalLines: number;
  sourceBytes: number;
  confidence: number;
}

export interface SmartPasteParseOptions {
  /** Minimum number of detected files before a payload is treated as multi-file. */
  minimumProjectFiles?: number;

  /** Maximum accepted source characters. Defaults to 12 MiB. */
  maxSourceCharacters?: number;

  /** Maximum number of files in one payload. Defaults to 2000. */
  maxFiles?: number;

  /** Maximum size of one decoded text file. Defaults to 4 MiB. */
  maxFileCharacters?: number;

  /** Whether duplicate paths should be rejected instead of keeping the last copy. */
  rejectDuplicatePaths?: boolean;
}

export interface SmartPasteCommitOptions {
  /** Destination directory in the WebContainer. Defaults to /. */
  targetPath?: string;

  /** Replace existing files. Defaults to true. */
  overwrite?: boolean;

  /** Continue committing independent files when one file fails. */
  continueOnError?: boolean;

  /** Print progress to the registered terminal. Defaults to true. */
  showProgress?: boolean;

  /** Called after each successfully written file. */
  onFileWritten?: (file: SmartPasteFile, index: number, total: number) => void;
}

export interface SmartPasteCommitResult {
  filesCreated: number;
  filesSkipped: number;
  directoriesCreated: number;
  bytesWritten: number;
  failedFiles: Array<{ path: string; error: string }>;
  skippedPaths: string[];
}

const DEFAULT_SMART_PASTE_OPTIONS: Required<SmartPasteParseOptions> = {
  minimumProjectFiles: 2,
  maxSourceCharacters: 12 * 1024 * 1024,
  maxFiles: 2000,
  maxFileCharacters: 4 * 1024 * 1024,
  rejectDuplicatePaths: true,
};

const SMART_FILE_MARKERS = [
  '__EDITOR_X_FILE__',
  '__CODEFORGE_FILE__',
  '=== FILE:',
  '--- FILE:',
  '// FILE:',
  '# FILE:',
  '/* FILE:',
  '<!-- FILE:',
];

function smartPasteLineCount(content: string): number {
  if (!content) {
    return 0;
  }

  return content.split(/\r?\n/).length;
}

function smartPasteByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

function stripSmartPasteFence(line: string): string {
  return line
    .replace(/^\s*```(?:[a-z0-9_+.#-]+)?\s*$/i, '')
    .replace(/^\s*~~~(?:[a-z0-9_+.#-]+)?\s*$/i, '')
    .trim();
}

function cleanSmartPastePath(rawPath: string): string {
  let path = rawPath.trim();

  path = path
    .replace(/^['"]|['"]$/g, '')
    .replace(/`/g, '')
    .replace(/\s+\*\*\s*$/, '')
    .replace(/\s+\*\s*$/, '')
    .replace(/[\r\n]+/g, '')
    .trim();

  if (path.startsWith('./')) {
    path = path.slice(2);
  }

  if (path.startsWith('/')) {
    path = path.slice(1);
  }

  return normalizeRelativePath(path);
}

function isPlausibleSmartPastePath(path: string): boolean {
  if (!path || path === '.') {
    return false;
  }

  if (path.length > 512) {
    return false;
  }

  if (/\s{2,}/.test(path)) {
    return false;
  }

  if (/[<>|?*]/.test(path)) {
    return false;
  }

  const lastSegment = getFileName(path);
  if (!lastSegment || lastSegment === '.' || lastSegment === '..') {
    return false;
  }

  return /[./\\]/.test(path) || /\.[a-z0-9]{1,12}$/i.test(lastSegment);
}

function smartPasteMarkerPath(line: string): string | null {
  const trimmed = line.trim();

  if (trimmed.startsWith('__EDITOR_X_FILE__')) {
    return trimmed.slice('__EDITOR_X_FILE__'.length).trim();
  }

  if (trimmed.startsWith('__CODEFORGE_FILE__')) {
    return trimmed.slice('__CODEFORGE_FILE__'.length).trim();
  }

  const patterns = [
    /^===\s*FILE:\s*(.+?)\s*===\s*$/i,
    /^---\s*FILE:\s*(.+?)\s*---\s*$/i,
    /^\/\/\s*FILE:\s*(.+?)\s*$/i,
    /^#\s*FILE:\s*(.+?)\s*$/i,
    /^\/\*\s*FILE:\s*(.+?)\s*\*\/\s*$/i,
    /^<!--\s*FILE:\s*(.+?)\s*-->\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function smartPasteHeadingPath(line: string): string | null {
  const trimmed = line.trim();

  const markdownMatch = trimmed.match(
    /^#{1,6}\s*(?:file\s*[:=-]\s*)?`?([^`]+?)`?\s*$/i,
  );

  if (!markdownMatch?.[1]) {
    return null;
  }

  const candidate = markdownMatch[1]
    .replace(/\*\*/g, '')
    .replace(/\s+\((?:file|code)\)\s*$/i, '')
    .trim();

  if (!isPlausibleSmartPastePath(candidate)) {
    return null;
  }

  return candidate;
}

function smartPasteShellPath(line: string): string | null {
  const trimmed = line.trim();

  const catMatch = trimmed.match(
    /^cat\s+>\s*([^\s]+)\s+<<['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*$/,
  );

  if (catMatch?.[1]) {
    return catMatch[1];
  }

  const printfMatch = trimmed.match(
    /^printf\s+['"](?:%s\\n|%b\\n)?[^'"]*['"]\s+>\s*([^\s]+)\s*$/,
  );

  if (printfMatch?.[1]) {
    return printfMatch[1];
  }

  return null;
}

function isShellScriptPaste(source: string): boolean {
  const lines = source.split(/\r?\n/);
  let shellSignals = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(mkdir|cat|printf|echo|touch)\s+/i.test(trimmed)) {
      shellSignals += 1;
    }

    if (/<<['"]?[A-Za-z_][A-Za-z0-9_]*['"]?$/.test(trimmed)) {
      shellSignals += 2;
    }
  }

  return shellSignals >= 2;
}

function extractJsonProject(source: string): SmartPasteFile[] | null {
  const trimmed = source.trim();

  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      const files: SmartPasteFile[] = [];

      for (const item of parsed) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        const value = item as Record<string, unknown>;
        const path = typeof value.path === 'string' ? value.path : '';
        const content = typeof value.content === 'string' ? value.content : '';

        if (!path) {
          continue;
        }

        files.push({
          path: cleanSmartPastePath(path),
          content,
          bytes: smartPasteByteLength(content),
          lineCount: smartPasteLineCount(content),
          source: 'json',
        });
      }

      return files.length > 0 ? files : null;
    }

    if (parsed && typeof parsed === 'object') {
      const value = parsed as Record<string, unknown>;
      const candidate = value.files;

      if (Array.isArray(candidate)) {
        const files: SmartPasteFile[] = [];

        for (const item of candidate) {
          if (!item || typeof item !== 'object') {
            continue;
          }

          const file = item as Record<string, unknown>;
          const path = typeof file.path === 'string' ? file.path : '';
          const content = typeof file.content === 'string' ? file.content : '';

          if (!path) {
            continue;
          }

          files.push({
            path: cleanSmartPastePath(path),
            content,
            bytes: smartPasteByteLength(content),
            lineCount: smartPasteLineCount(content),
            source: 'json',
          });
        }

        return files.length > 0 ? files : null;
      }

      const objectFiles: SmartPasteFile[] = [];

      for (const [path, content] of Object.entries(value)) {
        if (typeof content !== 'string' || !isPlausibleSmartPastePath(path)) {
          continue;
        }

        objectFiles.push({
          path: cleanSmartPastePath(path),
          content,
          bytes: smartPasteByteLength(content),
          lineCount: smartPasteLineCount(content),
          source: 'json',
        });
      }

      return objectFiles.length > 0 ? objectFiles : null;
    }
  } catch {
    return null;
  }

  return null;
}

function extractMarkerFiles(
  source: string,
  options: Required<SmartPasteParseOptions>,
): { files: SmartPasteFile[]; issues: SmartPasteIssue[] } {
  const lines = source.split(/\r?\n/);
  const files: SmartPasteFile[] = [];
  const issues: SmartPasteIssue[] = [];

  let currentPath: string | null = null;
  let currentSource: SmartPasteFile['source'] = 'marker';
  let contentLines: string[] = [];
  let fenceOpen = false;

  const flush = (lineNumber: number): void => {
    if (!currentPath) {
      return;
    }

    let content = contentLines.join('\n');

    while (content.endsWith('\n')) {
      content = content.slice(0, -1);
    }

    if (content.length > options.maxFileCharacters) {
      issues.push({
        severity: 'error',
        message: `File exceeds the ${options.maxFileCharacters.toLocaleString()} character limit.`,
        path: currentPath,
        line: lineNumber,
      });
    }

    files.push({
      path: currentPath,
      content,
      bytes: smartPasteByteLength(content),
      lineCount: smartPasteLineCount(content),
      source: currentSource,
    });

    currentPath = null;
    contentLines = [];
    fenceOpen = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const markerPath = smartPasteMarkerPath(line);

    if (markerPath) {
      flush(index + 1);

      try {
        const normalized = cleanSmartPastePath(markerPath);

        if (!isPlausibleSmartPastePath(normalized)) {
          issues.push({
            severity: 'error',
            message: `Invalid file path detected: ${markerPath}`,
            line: index + 1,
          });
          continue;
        }

        currentPath = normalized;
        currentSource = 'marker';
      } catch (error) {
        issues.push({
          severity: 'error',
          message: formatError(error),
          line: index + 1,
        });
      }

      continue;
    }

    if (currentPath) {
      const fence = line.trim();

      if (/^```/.test(fence) || /^~~~/.test(fence)) {
        fenceOpen = !fenceOpen;

        if (fenceOpen) {
          continue;
        }

        continue;
      }

      contentLines.push(line);
    }
  }

  flush(lines.length);

  if (fenceOpen) {
    issues.push({
      severity: 'warning',
      message: 'An unmatched code fence was found in the pasted payload.',
    });
  }

  return { files, issues };
}

function extractHeadingFiles(
  source: string,
  options: Required<SmartPasteParseOptions>,
): { files: SmartPasteFile[]; issues: SmartPasteIssue[] } {
  const lines = source.split(/\r?\n/);
  const files: SmartPasteFile[] = [];
  const issues: SmartPasteIssue[] = [];

  let currentPath: string | null = null;
  let contentLines: string[] = [];
  let inFence = false;
  let sawFenceForCurrentFile = false;

  const flush = (lineNumber: number): void => {
    if (!currentPath) {
      return;
    }

    let content = contentLines.join('\n');

    if (sawFenceForCurrentFile) {
      const first = content.search(/(?:^|\n)\s*```[^\n]*\n?/);
      if (first >= 0) {
        content = content.replace(/^\s*```[^\n]*\n/, '');
      }
      content = content.replace(/\n?\s*```\s*$/, '');
    }

    content = content.replace(/^\n+/, '').replace(/\n+$/, '');

    if (content.length > options.maxFileCharacters) {
      issues.push({
        severity: 'error',
        message: `File exceeds the ${options.maxFileCharacters.toLocaleString()} character limit.`,
        path: currentPath,
        line: lineNumber,
      });
    }

    files.push({
      path: currentPath,
      content,
      bytes: smartPasteByteLength(content),
      lineCount: smartPasteLineCount(content),
      source: 'heading',
    });

    currentPath = null;
    contentLines = [];
    inFence = false;
    sawFenceForCurrentFile = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingPath = smartPasteHeadingPath(line);

    if (headingPath) {
      flush(index + 1);

      try {
        const normalized = cleanSmartPastePath(headingPath);

        if (!isPlausibleSmartPastePath(normalized)) {
          continue;
        }

        currentPath = normalized;
      } catch (error) {
        issues.push({
          severity: 'error',
          message: formatError(error),
          line: index + 1,
        });
      }

      continue;
    }

    if (!currentPath) {
      continue;
    }

    const trimmed = line.trim();

    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      inFence = !inFence;
      sawFenceForCurrentFile = true;
      contentLines.push(line);
      continue;
    }

    if (inFence || sawFenceForCurrentFile) {
      contentLines.push(line);
    } else {
      contentLines.push(line);
    }
  }

  flush(lines.length);

  return { files, issues };
}

function extractShellScriptFiles(
  source: string,
  options: Required<SmartPasteParseOptions>,
): { files: SmartPasteFile[]; issues: SmartPasteIssue[] } {
  const lines = source.split(/\r?\n/);
  const files: SmartPasteFile[] = [];
  const issues: SmartPasteIssue[] = [];

  let currentPath: string | null = null;
  let currentDelimiter: string | null = null;
  let contentLines: string[] = [];

  const flush = (lineNumber: number): void => {
    if (!currentPath) {
      return;
    }

    const content = contentLines.join('\n');

    if (content.length > options.maxFileCharacters) {
      issues.push({
        severity: 'error',
        message: `File exceeds the ${options.maxFileCharacters.toLocaleString()} character limit.`,
        path: currentPath,
        line: lineNumber,
      });
    }

    files.push({
      path: currentPath,
      content,
      bytes: smartPasteByteLength(content),
      lineCount: smartPasteLineCount(content),
      source: 'shell-script',
    });

    currentPath = null;
    currentDelimiter = null;
    contentLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (currentPath && currentDelimiter && trimmed === currentDelimiter) {
      flush(index + 1);
      continue;
    }

    if (!currentPath) {
      const match: RegExpMatchArray | null = trimmed.match(
        /^(?:cat\s+>\s*|tee\s+)['"]?([^'"\s]+)['"]?\s+<<['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*$/,
      );

      if (match?.[1] && match[2]) {
        try {
          const normalized = cleanSmartPastePath(match[1]);

          if (!isPlausibleSmartPastePath(normalized)) {
            issues.push({
              severity: 'error',
              message: `Invalid shell-script file path: ${match[1]}`,
              line: index + 1,
            });
            continue;
          }

          currentPath = normalized;
          currentDelimiter = match[2];
          contentLines = [];
        } catch (error) {
          issues.push({
            severity: 'error',
            message: formatError(error),
            line: index + 1,
          });
        }

        continue;
      }
    }

    if (currentPath) {
      contentLines.push(line);
    }
  }

  if (currentPath) {
    issues.push({
      severity: 'error',
      message: `Missing heredoc terminator "${currentDelimiter ?? ''}".`,
      path: currentPath,
    });
    flush(lines.length);
  }

  return { files, issues };
}

function deduplicateSmartPasteFiles(
  files: SmartPasteFile[],
  options: Required<SmartPasteParseOptions>,
): { files: SmartPasteFile[]; issues: SmartPasteIssue[] } {
  const issues: SmartPasteIssue[] = [];
  const byPath = new Map<string, SmartPasteFile>();

  for (const file of files) {
    let path: string;

    try {
      path = cleanSmartPastePath(file.path);
    } catch (error) {
      issues.push({
        severity: 'error',
        message: formatError(error),
        path: file.path,
      });
      continue;
    }

    if (!isPlausibleSmartPastePath(path)) {
      issues.push({
        severity: 'error',
        message: `Invalid or unsupported file path: ${file.path}`,
        path: file.path,
      });
      continue;
    }

    const normalizedFile: SmartPasteFile = {
      ...file,
      path,
      bytes: smartPasteByteLength(file.content),
      lineCount: smartPasteLineCount(file.content),
    };

    if (byPath.has(path)) {
      if (options.rejectDuplicatePaths) {
        issues.push({
          severity: 'error',
          message: `Duplicate file path detected: ${path}`,
          path,
        });
        continue;
      }

      issues.push({
        severity: 'warning',
        message: `Duplicate file path replaced by the last occurrence: ${path}`,
        path,
      });
    }

    byPath.set(path, normalizedFile);
  }

  return {
    files: Array.from(byPath.values()),
    issues,
  };
}

function collectSmartPasteDirectories(files: SmartPasteFile[]): string[] {
  const directories = new Set<string>();

  for (const file of files) {
    const segments = file.path.split('/');

    if (segments.length <= 1) {
      continue;
    }

    let current = '';

    for (let index = 0; index < segments.length - 1; index += 1) {
      current = current ? `${current}/${segments[index]}` : segments[index];
      directories.add(current);
    }
  }

  return Array.from(directories).sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;

    return depthA - depthB || a.localeCompare(b);
  });
}

function smartPasteConfidence(
  source: string,
  files: SmartPasteFile[],
  format: SmartPasteAnalysis['format'],
): number {
  if (files.length === 0) {
    return 0;
  }

  let score = files.length >= 2 ? 0.65 : 0.35;

  if (format === 'editor-x') {
    score += 0.3;
  } else if (format === 'json' || format === 'shell-script') {
    score += 0.2;
  } else if (format === 'markdown') {
    score += 0.15;
  }

  if (source.length > 2000 && files.length >= 2) {
    score += 0.05;
  }

  return Math.min(1, score);
}

/**
 * Analyzes terminal/editor paste content without touching the filesystem.
 *
 * Supported project-payload formats include:
 * - EDITOR X file markers
 * - legacy CODEFORGE file markers for compatibility with old generated payloads
 * - FILE: comment markers
 * - Markdown file headings followed by fenced code
 * - shell heredoc file creation scripts
 * - JSON arrays/objects containing path/content pairs
 *
 * Plain source code remains a single-file payload and is never executed.
 */
export function analyzeSmartPaste(
  source: string,
  options: SmartPasteParseOptions = {},
): SmartPasteAnalysis {
  const config = {
    ...DEFAULT_SMART_PASTE_OPTIONS,
    ...options,
  };

  const sourceText = String(source ?? '');
  const sourceBytes = smartPasteByteLength(sourceText);
  const issues: SmartPasteIssue[] = [];

  if (!sourceText.trim()) {
    return {
      isProjectPayload: false,
      format: 'unknown',
      files: [],
      directories: [],
      issues: [],
      totalFiles: 0,
      totalDirectories: 0,
      totalBytes: 0,
      totalLines: 0,
      sourceBytes: 0,
      confidence: 0,
    };
  }

  if (sourceText.length > config.maxSourceCharacters) {
    issues.push({
      severity: 'error',
      message: `Paste exceeds the ${config.maxSourceCharacters.toLocaleString()} character limit.`,
    });

    return {
      isProjectPayload: false,
      format: 'unknown',
      files: [],
      directories: [],
      issues,
      totalFiles: 0,
      totalDirectories: 0,
      totalBytes: 0,
      totalLines: smartPasteLineCount(sourceText),
      sourceBytes,
      confidence: 0,
    };
  }

  let format: SmartPasteAnalysis['format'] = 'single-file';
  let files: SmartPasteFile[] = [];

  const jsonFiles = extractJsonProject(sourceText);

  if (jsonFiles?.length) {
    format = 'json';
    files = jsonFiles;
  } else if (sourceText.split(/\r?\n/).some((line) => Boolean(smartPasteMarkerPath(line)))) {
    format = 'editor-x';
    const parsed = extractMarkerFiles(sourceText, config);
    files = parsed.files;
    issues.push(...parsed.issues);
  } else if (sourceText.split(/\r?\n/).some((line) => Boolean(smartPasteHeadingPath(line)))) {
    format = 'markdown';
    const parsed = extractHeadingFiles(sourceText, config);
    files = parsed.files;
    issues.push(...parsed.issues);
  } else if (isShellScriptPaste(sourceText)) {
    format = 'shell-script';
    const parsed = extractShellScriptFiles(sourceText, config);
    files = parsed.files;
    issues.push(...parsed.issues);
  }

  if (files.length === 0 && format !== 'single-file') {
    issues.push({
      severity: 'warning',
      message: 'A project payload format was detected, but no valid files were extracted.',
    });
  }

  if (files.length > config.maxFiles) {
    issues.push({
      severity: 'error',
      message: `Paste contains ${files.length.toLocaleString()} files; the maximum is ${config.maxFiles.toLocaleString()}.`,
    });
    files = files.slice(0, config.maxFiles);
  }

  const deduplicated = deduplicateSmartPasteFiles(files, config);
  files = deduplicated.files;
  issues.push(...deduplicated.issues);

  const directories = collectSmartPasteDirectories(files);
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
  const totalLines = files.reduce((total, file) => total + file.lineCount, 0);
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const isProjectPayload =
    files.length >= config.minimumProjectFiles &&
    !hasErrors &&
    format !== 'single-file';

  return {
    isProjectPayload,
    format,
    files,
    directories,
    issues,
    totalFiles: files.length,
    totalDirectories: directories.length,
    totalBytes,
    totalLines,
    sourceBytes,
    confidence: smartPasteConfidence(sourceText, files, format),
  };
}

/**
 * Returns true when pasted content looks like a Smart Paste project payload.
 */
export function isSmartPasteProject(
  source: string,
  options: SmartPasteParseOptions = {},
): boolean {
  return analyzeSmartPaste(source, options).isProjectPayload;
}

/**
 * Parses a project payload and returns only the discovered files.
 * Throws when the payload contains validation errors.
 */
export function parseSmartPasteProject(
  source: string,
  options: SmartPasteParseOptions = {},
): SmartPasteFile[] {
  const analysis = analyzeSmartPaste(source, options);
  const errors = analysis.issues.filter((issue) => issue.severity === 'error');

  if (errors.length > 0) {
    throw new Error(
      errors.map((issue) => issue.message).join('\n'),
    );
  }

  if (!analysis.isProjectPayload) {
    throw new Error(
      'The pasted content does not contain a valid multi-file project payload.',
    );
  }

  return analysis.files;
}

/**
 * Validates a Smart Paste analysis before committing it.
 */
export function validateSmartPasteAnalysis(
  analysis: SmartPasteAnalysis,
): SmartPasteIssue[] {
  const issues: SmartPasteIssue[] = [...analysis.issues];
  const seen = new Set<string>();

  for (const file of analysis.files) {
    try {
      const path = cleanSmartPastePath(file.path);

      if (!isPlausibleSmartPastePath(path)) {
        issues.push({
          severity: 'error',
          message: `Invalid file path: ${file.path}`,
          path: file.path,
        });
      }

      if (seen.has(path)) {
        issues.push({
          severity: 'error',
          message: `Duplicate file path: ${path}`,
          path,
        });
      }

      seen.add(path);

      if (file.content.length > DEFAULT_SMART_PASTE_OPTIONS.maxFileCharacters) {
        issues.push({
          severity: 'error',
          message: `File exceeds the ${DEFAULT_SMART_PASTE_OPTIONS.maxFileCharacters.toLocaleString()} character limit.`,
          path,
        });
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        message: formatError(error),
        path: file.path,
      });
    }
  }

  return issues;
}

/**
 * Checks the existing WebContainer for conflicts with a Smart Paste plan.
 */
export async function findSmartPasteConflicts(
  analysis: SmartPasteAnalysis,
  targetPath = '/',
): Promise<string[]> {
  const root = normalizePath(targetPath);
  const container = await getWebContainer();
  const conflicts: string[] = [];

  for (const file of analysis.files) {
    const destination =
      root === '/' ? `/${file.path}` : joinPath(root, file.path);

    if (await pathExistsWithContainer(container, destination)) {
      conflicts.push(destination);
    }
  }

  return conflicts;
}

/**
 * Creates the directories required by a Smart Paste plan.
 *
 * Directory creation is separated from file writes so the caller can show
 * accurate progress and so deeply nested projects are created deterministically.
 */
export async function prepareSmartPasteDirectories(
  analysis: SmartPasteAnalysis,
  targetPath = '/',
): Promise<number> {
  const root = normalizePath(targetPath);
  const container = await getWebContainer();
  let created = 0;

  for (const directory of analysis.directories) {
    const destination =
      root === '/' ? `/${directory}` : joinPath(root, directory);

    const existed = await pathExistsWithContainer(container, destination);

    await container.fs.mkdir(destination, { recursive: true });

    if (!existed) {
      created += 1;
    }
  }

  return created;
}

/**
 * Commits a previously analyzed Smart Paste project into the WebContainer.
 *
 * The function performs validation before the first write. It never executes
 * pasted shell commands; shell-script payloads are converted into file writes.
 */
export async function commitSmartPasteProject(
  analysis: SmartPasteAnalysis,
  options: SmartPasteCommitOptions = {},
): Promise<SmartPasteCommitResult> {
  const validationIssues = validateSmartPasteAnalysis(analysis);
  const validationErrors = validationIssues.filter(
    (issue) => issue.severity === 'error',
  );

  if (validationErrors.length > 0) {
    throw new Error(
      validationErrors.map((issue) => issue.message).join('\n'),
    );
  }

  if (analysis.files.length === 0) {
    throw new Error('Smart Paste contains no files to create.');
  }

  const targetRoot = normalizePath(options.targetPath ?? '/');
  const overwrite = options.overwrite !== false;
  const continueOnError = options.continueOnError === true;
  const showProgress = options.showProgress !== false;
  const container = await getWebContainer();

  const result: SmartPasteCommitResult = {
    filesCreated: 0,
    filesSkipped: 0,
    directoriesCreated: 0,
    bytesWritten: 0,
    failedFiles: [],
    skippedPaths: [],
  };

  const createdDirectories = new Set<string>();

  for (const directory of analysis.directories) {
    const destination =
      targetRoot === '/' ? `/${directory}` : joinPath(targetRoot, directory);

    try {
      const existed = await pathExistsWithContainer(container, destination);

      await container.fs.mkdir(destination, { recursive: true });

      if (!existed) {
        createdDirectories.add(destination);
        result.directoriesCreated += 1;
      }
    } catch (error) {
      result.failedFiles.push({
        path: destination,
        error: formatError(error),
      });

      if (!continueOnError) {
        throw error;
      }
    }
  }

  for (let index = 0; index < analysis.files.length; index += 1) {
    const file = analysis.files[index];
    const destination =
      targetRoot === '/' ? `/${file.path}` : joinPath(targetRoot, file.path);

    try {
      if (!overwrite && await pathExistsWithContainer(container, destination)) {
        result.filesSkipped += 1;
        result.skippedPaths.push(destination);
        continue;
      }

      const parent = getParentPath(destination);

      if (!createdDirectories.has(parent)) {
        await container.fs.mkdir(parent, { recursive: true });
        createdDirectories.add(parent);
      }

      await container.fs.writeFile(destination, file.content);

      result.filesCreated += 1;
      result.bytesWritten += file.bytes;

      if (showProgress) {
        writeToTerminal(
          `\r\n[EDITOR X] Smart Paste ${index + 1}/${analysis.files.length}: ${destination}`,
        );
      }

      options.onFileWritten?.(file, index, analysis.files.length);
    } catch (error) {
      result.failedFiles.push({
        path: destination,
        error: formatError(error),
      });

      if (!continueOnError) {
        throw error;
      }
    }
  }

  if (showProgress) {
    writeToTerminal(
      `\r\n[EDITOR X] Smart Paste complete: ${result.filesCreated} files, ${result.directoriesCreated} directories, ${result.bytesWritten} bytes.\r\n`,
    );
  }

  return result;
}

/**
 * Convenience API: analyze and immediately commit a Smart Paste payload.
 */
export async function writeSmartPasteProject(
  source: string,
  parseOptions: SmartPasteParseOptions = {},
  commitOptions: SmartPasteCommitOptions = {},
): Promise<SmartPasteCommitResult> {
  const analysis = analyzeSmartPaste(source, parseOptions);

  if (!analysis.isProjectPayload) {
    const errors = analysis.issues.filter(
      (issue) => issue.severity === 'error',
    );

    if (errors.length > 0) {
      throw new Error(
        errors.map((issue) => issue.message).join('\n'),
      );
    }

    throw new Error(
      'The supplied text is not a recognized multi-file Smart Paste payload.',
    );
  }

  return commitSmartPasteProject(analysis, commitOptions);
}

/**
 * Formats an analysis into concise terminal/UI-friendly text.
 */
export function formatSmartPasteSummary(
  analysis: SmartPasteAnalysis,
): string {
  const confidence = Math.round(analysis.confidence * 100);

  return [
    `Smart Paste: ${analysis.isProjectPayload ? 'project detected' : 'single/unknown payload'}`,
    `Format: ${analysis.format}`,
    `Files: ${analysis.totalFiles}`,
    `Directories: ${analysis.totalDirectories}`,
    `Lines: ${analysis.totalLines.toLocaleString()}`,
    `Size: ${analysis.totalBytes.toLocaleString()} bytes`,
    `Confidence: ${confidence}%`,
  ].join(' | ');
}

/**
 * Returns a stable preview manifest suitable for a Smart Paste confirmation UI.
 */
export function getSmartPastePreview(
  analysis: SmartPasteAnalysis,
): Array<{
  path: string;
  type: 'file';
  bytes: number;
  lineCount: number;
}> {
  return analysis.files.map((file) => ({
    path: file.path,
    type: 'file',
    bytes: file.bytes,
    lineCount: file.lineCount,
  }));
}

/**
 * Returns whether an analysis can be safely committed without blocking errors.
 */
export function canCommitSmartPaste(
  analysis: SmartPasteAnalysis,
): boolean {
  return (
    analysis.isProjectPayload &&
    analysis.files.length > 0 &&
    !analysis.issues.some((issue) => issue.severity === 'error')
  );
}

/**
 * Detects whether a line belongs to one of the supported Smart Paste formats.
 * Exported for the terminal layer so it can avoid trying to execute a large
 * structured paste as a shell command.
 */
export function isSmartPasteBoundary(line: string): boolean {
  return (
    Boolean(smartPasteMarkerPath(line)) ||
    Boolean(smartPasteHeadingPath(line)) ||
    Boolean(smartPasteShellPath(line))
  );
}

/**
 * Extracts a path from a supported Smart Paste boundary line.
 */
export function getSmartPasteBoundaryPath(
  line: string,
): string | null {
  const candidate =
    smartPasteMarkerPath(line) ??
    smartPasteHeadingPath(line) ??
    smartPasteShellPath(line);

  if (!candidate) {
    return null;
  }

  try {
    const normalized = cleanSmartPastePath(candidate);
    return isPlausibleSmartPastePath(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Counts supported file boundaries in a paste without parsing file contents.
 * This is intentionally cheap enough to run during a paste event.
 */
export function countSmartPasteBoundaries(source: string): number {
  if (!source) {
    return 0;
  }

  let count = 0;

  for (const line of source.split(/\r?\n/)) {
    if (isSmartPasteBoundary(line)) {
      count += 1;
    }
  }

  return count;
}

/**
 * Returns a short preview of the first files in a payload.
 */
export function previewSmartPastePaths(
  source: string,
  limit = 20,
): string[] {
  const analysis = analyzeSmartPaste(source, {
    maxFiles: Math.max(limit, 1),
  });

  return analysis.files
    .slice(0, Math.max(0, limit))
    .map((file) => file.path);
}
