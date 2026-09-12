import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as Dialog from '@radix-ui/react-dialog';

import {
  FileTreeNode,
  useStore,
} from '../store/useStore';

import {
  readFile,
} from '../webcontainer/webcontainer';

import {
  createFile,
  createDirectory,
  deleteFile,
} from '../webcontainer/fileOperations';

import {
  buildFileTree,
} from '../webcontainer/fileWatcher';

type CreationType = 'file' | 'folder';
type DialogMode = 'create-file' | 'create-folder' | 'rename';

interface FileTreeItemProps {
  node: FileTreeNode;
  level: number;
  onRefresh: () => Promise<void>;
  onCreate: (
    type: CreationType,
    parentPath: string,
  ) => void;
  onRename: (node: FileTreeNode) => void;
  onDelete: (node: FileTreeNode) => void;
  searchQuery: string;
}

interface FileTreeDialogProps {
  open: boolean;
  mode: DialogMode;
  targetPath?: string;
  initialValue?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => Promise<void>;
  isBusy: boolean;
}

function normalizePath(path: string): string {
  const normalized = path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '');

  return normalized || '.';
}

function getParentPath(path: string): string {
  const normalized = normalizePath(path);

  if (normalized === '.') {
    return '.';
  }

  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash < 0) {
    return '.';
  }

  if (lastSlash === 0) {
    return '.';
  }

  return normalized.slice(0, lastSlash);
}

function getBaseName(path: string): string {
  const normalized = normalizePath(path);

  if (normalized === '.') {
    return '';
  }

  const lastSlash = normalized.lastIndexOf('/');

  return lastSlash < 0
    ? normalized
    : normalized.slice(lastSlash + 1);
}

function joinPath(
  parentPath: string,
  name: string,
): string {
  const parent = normalizePath(parentPath);

  const child = name
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (!child) {
    throw new Error('Name cannot be empty.');
  }

  if (child.includes('/')) {
    throw new Error(
      'Name cannot contain path separators.',
    );
  }

  if (parent === '.') {
    return child;
  }

  return `${parent}/${child}`;
}

function isValidItemName(name: string): boolean {
  const trimmed = name.trim();

  if (!trimmed) {
    return false;
  }

  if (
    trimmed === '.' ||
    trimmed === '..'
  ) {
    return false;
  }

  if (
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    return false;
  }

  return !/[<>:"|?*\x00-\x1F]/.test(trimmed);
}

function isPathInside(
  childPath: string,
  parentPath: string,
): boolean {
  const child = normalizePath(childPath);
  const parent = normalizePath(parentPath);

  if (child === parent) {
    return true;
  }

  return child.startsWith(`${parent}/`);
}

function matchesSearch(
  node: FileTreeNode,
  query: string,
): boolean {
  const normalizedQuery = query
    .trim()
    .toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  if (
    node.name
      .toLowerCase()
      .includes(normalizedQuery)
  ) {
    return true;
  }

  if (
    node.type === 'directory' &&
    node.children
  ) {
    return node.children.some((child) =>
      matchesSearch(child, normalizedQuery),
    );
  }

  return false;
}

function sortNodes(
  nodes: FileTreeNode[],
): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (
      a.type === 'directory' &&
      b.type !== 'directory'
    ) {
      return -1;
    }

    if (
      a.type !== 'directory' &&
      b.type === 'directory'
    ) {
      return 1;
    }

    return a.name.localeCompare(
      b.name,
      undefined,
      {
        numeric: true,
        sensitivity: 'base',
      },
    );
  });
}

function filterTree(
  nodes: FileTreeNode[],
  query: string,
): FileTreeNode[] {
  const normalizedQuery = query
    .trim()
    .toLowerCase();

  if (!normalizedQuery) {
    return sortNodes(nodes);
  }

  const result: FileTreeNode[] = [];

  for (const node of nodes) {
    if (
      node.name
        .toLowerCase()
        .includes(normalizedQuery)
    ) {
      result.push(node);
      continue;
    }

    if (
      node.type === 'directory' &&
      node.children
    ) {
      const children = filterTree(
        node.children,
        normalizedQuery,
      );

      if (children.length > 0) {
        result.push({
          ...node,
          children,
        });
      }
    }
  }

  return sortNodes(result);
}

function getFileIconClass(
  fileName: string,
): string {
  const extension = fileName
    .split('.')
    .pop()
    ?.toLowerCase();

  switch (extension) {
    case 'tsx':
    case 'ts':
    case 'jsx':
    case 'js':
    case 'json':
    case 'html':
    case 'css':
    case 'scss':
    case 'sass':
    case 'vue':
    case 'svelte':
      return 'text-blue-400';

    case 'md':
    case 'mdx':
      return 'text-gray-300';

    case 'svg':
      return 'text-yellow-400';

    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return 'text-purple-400';

    case 'py':
      return 'text-yellow-300';

    case 'java':
      return 'text-orange-400';

    case 'go':
      return 'text-cyan-400';

    case 'rs':
      return 'text-orange-300';

    case 'sh':
    case 'bash':
      return 'text-green-400';

    default:
      return 'text-gray-400';
  }
}

function FileTreeDialog({
  open,
  mode,
  targetPath,
  initialValue = '',
  onOpenChange,
  onSubmit,
  isBusy,
}: FileTreeDialogProps): JSX.Element {
  const [value, setValue] =
    useState(initialValue);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  const isRename = mode === 'rename';
  const isFile = mode === 'create-file';

  const title = isRename
    ? 'Rename'
    : isFile
      ? 'New File'
      : 'New Folder';

  const description = isRename
    ? `Rename "${targetPath ? getBaseName(targetPath) : ''}".`
    : isFile
      ? 'Create a new file in the selected location.'
      : 'Create a new folder in the selected location.';

  const placeholder = isRename
    ? 'New name'
    : isFile
      ? 'filename.tsx'
      : 'folder-name';

  const submitLabel = isRename
    ? 'Rename'
    : 'Create';

  const valid =
    isValidItemName(value) &&
    !isBusy;

  const handleSubmit = async (): Promise<void> => {
    if (!valid) {
      return;
    }

    await onSubmit(value.trim());
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[1px]" />

        <Dialog.Content
          className="
            fixed
            left-1/2
            top-1/2
            z-[101]
            w-[min(420px,calc(100vw-2rem))]
            -translate-x-1/2
            -translate-y-1/2
            rounded-xl
            border
            border-gray-700
            bg-gray-900
            p-6
            shadow-2xl
            outline-none
          "
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-white">
                {title}
              </Dialog.Title>

              <Dialog.Description className="mt-1 text-sm leading-5 text-gray-400">
                {description}
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isBusy}
                className="
                  rounded-md
                  p-1.5
                  text-gray-500
                  transition
                  hover:bg-gray-800
                  hover:text-gray-200
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
                aria-label="Close dialog"
              >
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5">
            <input
              autoFocus
              type="text"
              value={value}
              disabled={isBusy}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSubmit();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();

                  if (!isBusy) {
                    onOpenChange(false);
                  }
                }
              }}
              placeholder={placeholder}
              className="
                w-full
                rounded-lg
                border
                border-gray-700
                bg-gray-950
                px-3
                py-2.5
                text-sm
                text-gray-100
                outline-none
                placeholder:text-gray-600
                focus:border-blue-500
                focus:ring-1
                focus:ring-blue-500
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            />

            {value.trim() &&
              !isValidItemName(value) && (
                <p className="mt-2 text-xs text-red-400">
                  Use a valid single file or folder name.
                </p>
              )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                onOpenChange(false);
              }}
              className="
                rounded-lg
                px-4
                py-2
                text-sm
                font-medium
                text-gray-400
                transition
                hover:bg-gray-800
                hover:text-white
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!valid}
              onClick={() => {
                void handleSubmit();
              }}
              className="
                rounded-lg
                bg-blue-600
                px-4
                py-2
                text-sm
                font-semibold
                text-white
                transition
                hover:bg-blue-500
                disabled:cursor-not-allowed
                disabled:opacity-40
              "
            >
              {isBusy
                ? 'Working...'
                : submitLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const FileTreeItem: React.FC<
  FileTreeItemProps
> = ({
  node,
  level,
  onRefresh,
  onCreate,
  onRename,
  onDelete,
  searchQuery,
}) => {
  const {
    openFile,
    activeFile,
    isFileDirty,
  } = useStore();

  const [isExpanded, setIsExpanded] =
    useState(
      searchQuery.trim().length > 0,
    );

  const [isOpening, setIsOpening] =
    useState(false);

  const isDirectory =
    node.type === 'directory';

  const isActive =
    activeFile === node.path;

  const dirty =
    !isDirectory &&
    typeof isFileDirty === 'function' &&
    isFileDirty(node.path);

  const visibleChildren = useMemo(() => {
    if (!isDirectory || !node.children) {
      return [];
    }

    return filterTree(
      node.children,
      searchQuery,
    );
  }, [
    isDirectory,
    node.children,
    searchQuery,
  ]);

  useEffect(() => {
    if (searchQuery.trim()) {
      setIsExpanded(
        visibleChildren.length > 0,
      );
    }
  }, [
    searchQuery,
    visibleChildren.length,
  ]);

  const handleOpen = async (): Promise<void> => {
    if (isDirectory) {
      setIsExpanded((previous) => !previous);
      return;
    }

    if (isOpening) {
      return;
    }

    setIsOpening(true);

    try {
      const content = await readFile(
        node.path,
      );

      openFile(
        node.path,
        content,
      );
    } catch (error) {
      console.error(
        'EDITOR X: failed to open file.',
        error,
      );

      window.alert(
        `Unable to open "${node.name}".\n\n${
          error instanceof Error
            ? error.message
            : 'Unknown error.'
        }`,
      );
    } finally {
      setIsOpening(false);
    }
  };

  const parentPath = isDirectory
    ? node.path
    : getParentPath(node.path);

  return (
    <div>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className={[
              'group flex min-w-0 items-center gap-1.5',
              'cursor-pointer select-none',
              'border-l-2 border-transparent',
              'px-2 py-1',
              'text-sm',
              'transition-colors',
              isActive
                ? 'border-blue-500 bg-blue-600/30 text-white'
                : 'text-gray-300 hover:bg-gray-700/70 hover:text-white',
              isOpening
                ? 'opacity-60'
                : '',
            ].join(' ')}
            style={{
              paddingLeft:
                `${level * 14 + 6}px`,
            }}
            onClick={() => {
              void handleOpen();
            }}
            role="treeitem"
            aria-selected={isActive}
            aria-expanded={
              isDirectory
                ? isExpanded
                : undefined
            }
            title={node.path}
          >
            {isDirectory ? (
              <>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-500">
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </span>

                {isExpanded ? (
                  <FolderOpen
                    size={16}
                    className="shrink-0 text-blue-400"
                  />
                ) : (
                  <Folder
                    size={16}
                    className="shrink-0 text-blue-400"
                  />
                )}
              </>
            ) : (
              <>
                <span className="w-4 shrink-0" />

                <File
                  size={16}
                  className={[
                    'shrink-0',
                    getFileIconClass(
                      node.name,
                    ),
                  ].join(' ')}
                />
              </>
            )}

            <span
              className={[
                'min-w-0 flex-1 truncate',
                isOpening
                  ? 'text-gray-500'
                  : '',
              ].join(' ')}
            >
              {node.name}
            </span>

            {dirty && (
              <span
                className="mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}

            <button
              type="button"
              className="
                mr-0.5
                hidden
                shrink-0
                rounded
                p-0.5
                text-gray-500
                transition
                hover:bg-gray-600
                hover:text-gray-100
                group-hover:block
              "
              aria-label={`Actions for ${node.name}`}
              title={`Actions for ${node.name}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <MoreVertical size={14} />
            </button>
          </div>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content
            className="
              z-[200]
              min-w-[190px]
              overflow-hidden
              rounded-lg
              border
              border-gray-700
              bg-gray-900
              p-1
              shadow-2xl
            "
          >
            <ContextMenu.Item
              className="
                flex cursor-pointer items-center gap-2
                rounded-md px-2.5 py-2
                text-sm text-gray-200
                outline-none
                hover:bg-gray-800
              "
              onSelect={() => {
                onCreate(
                  'file',
                  parentPath,
                );
              }}
            >
              <FilePlus size={15} />
              New File
            </ContextMenu.Item>

            <ContextMenu.Item
              className="
                flex cursor-pointer items-center gap-2
                rounded-md px-2.5 py-2
                text-sm text-gray-200
                outline-none
                hover:bg-gray-800
              "
              onSelect={() => {
                onCreate(
                  'folder',
                  parentPath,
                );
              }}
            >
              <FolderPlus size={15} />
              New Folder
            </ContextMenu.Item>

            <ContextMenu.Separator className="my-1 h-px bg-gray-800" />

            <ContextMenu.Item
              className="
                flex cursor-pointer items-center gap-2
                rounded-md px-2.5 py-2
                text-sm text-gray-200
                outline-none
                hover:bg-gray-800
              "
              onSelect={() => {
                onRename(node);
              }}
            >
              <Pencil size={15} />
              Rename
            </ContextMenu.Item>

            <ContextMenu.Item
              className="
                flex cursor-pointer items-center gap-2
                rounded-md px-2.5 py-2
                text-sm text-red-400
                outline-none
                hover:bg-red-500/10
              "
              onSelect={() => {
                onDelete(node);
              }}
            >
              <Trash2 size={15} />
              Delete
            </ContextMenu.Item>

            {isDirectory && (
              <>
                <ContextMenu.Separator className="my-1 h-px bg-gray-800" />

                <ContextMenu.Item
                  className="
                    flex cursor-pointer items-center gap-2
                    rounded-md px-2.5 py-2
                    text-sm text-gray-200
                    outline-none
                    hover:bg-gray-800
                  "
                  onSelect={() => {
                    setIsExpanded(true);
                    onCreate(
                      'file',
                      node.path,
                    );
                  }}
                >
                  <FilePlus size={15} />
                  New File Here
                </ContextMenu.Item>

                <ContextMenu.Item
                  className="
                    flex cursor-pointer items-center gap-2
                    rounded-md px-2.5 py-2
                    text-sm text-gray-200
                    outline-none
                    hover:bg-gray-800
                  "
                  onSelect={() => {
                    setIsExpanded(true);
                    onCreate(
                      'folder',
                      node.path,
                    );
                  }}
                >
                  <FolderPlus size={15} />
                  New Folder Here
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {isDirectory &&
        isExpanded &&
        visibleChildren.length > 0 && (
          <div
            role="group"
            aria-label={node.name}
          >
            {visibleChildren.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                level={level + 1}
                onRefresh={onRefresh}
                onCreate={onCreate}
                onRename={onRename}
                onDelete={onDelete}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}

      {isDirectory &&
        isExpanded &&
        visibleChildren.length === 0 &&
        searchQuery.trim() && (
          <div
            className="py-1 text-xs text-gray-600"
            style={{
              paddingLeft:
                `${(level + 1) * 14 + 24}px`,
            }}
          >
            No matching files
          </div>
        )}
    </div>
  );
};

export const FileTree: React.FC = () => {
  const {
    fileTree,
    setFileTree,
    activeFile,
    closeFile,
    openFile,
    isFileDirty,
  } = useStore();

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('');

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    isOperating,
    setIsOperating,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const [
    dialog,
    setDialog,
  ] = useState<{
    mode: DialogMode;
    parentPath?: string;
    node?: FileTreeNode;
  } | null>(null);

  const [
    showRootMenu,
    setShowRootMenu,
  ] = useState(false);

  const refreshFileTree =
    useCallback(async (): Promise<void> => {
      if (isRefreshing) {
        return;
      }

      setIsRefreshing(true);
      setErrorMessage(null);

      try {
        const tree =
          await buildFileTree();

        setFileTree(
          sortNodes(tree),
        );
      } catch (error) {
        console.error(
          'EDITOR X: failed to refresh file tree.',
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to refresh files.',
        );
      } finally {
        setIsRefreshing(false);
      }
    }, [
      isRefreshing,
      setFileTree,
    ]);

  const openCreateDialog = useCallback(
    (
      type: CreationType,
      parentPath: string = '.',
    ): void => {
      setErrorMessage(null);

      setDialog({
        mode:
          type === 'file'
            ? 'create-file'
            : 'create-folder',
        parentPath,
      });
    },
    [],
  );

  const openRenameDialog = useCallback(
    (node: FileTreeNode): void => {
      setErrorMessage(null);

      setDialog({
        mode: 'rename',
        node,
      });
    },
    [],
  );

  const handleCreate = useCallback(
    async (value: string): Promise<void> => {
      if (!dialog) {
        return;
      }

      if (
        dialog.mode !== 'create-file' &&
        dialog.mode !== 'create-folder'
      ) {
        return;
      }

      if (!isValidItemName(value)) {
        return;
      }

      const parentPath =
        dialog.parentPath ?? '.';

      let newPath: string;

      try {
        newPath = joinPath(
          parentPath,
          value,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Invalid path.',
        );
        return;
      }

      setIsOperating(true);
      setErrorMessage(null);

      try {
        if (
          dialog.mode ===
          'create-file'
        ) {
          await createFile(
            newPath,
            '',
          );

          await refreshFileTree();

          try {
            openFile(
              newPath,
              '',
            );
          } catch {
            // The file was created successfully.
            // Opening is best-effort.
          }
        } else {
          await createDirectory(
            newPath,
          );

          await refreshFileTree();
        }

        setDialog(null);
      } catch (error) {
        console.error(
          'EDITOR X: create operation failed.',
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : `Unable to create "${value}".`,
        );
      } finally {
        setIsOperating(false);
      }
    },
    [
      dialog,
      openFile,
      refreshFileTree,
    ],
  );

  const handleRename = useCallback(
    async (value: string): Promise<void> => {
      const node = dialog?.node;

      if (
        !node ||
        dialog?.mode !== 'rename'
      ) {
        return;
      }

      if (!isValidItemName(value)) {
        return;
      }

      const oldPath =
        normalizePath(node.path);

      const parentPath =
        getParentPath(oldPath);

      let newPath: string;

      try {
        newPath = joinPath(
          parentPath,
          value,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Invalid destination path.',
        );
        return;
      }

      if (newPath === oldPath) {
        setDialog(null);
        return;
      }

      if (
        node.type === 'directory' &&
        isPathInside(
          newPath,
          oldPath,
        )
      ) {
        setErrorMessage(
          'A folder cannot be moved inside itself.',
        );
        return;
      }

      const dirty =
        typeof isFileDirty === 'function' &&
        node.type === 'file' &&
        isFileDirty(oldPath);

      if (dirty) {
        setErrorMessage(
          'Save the file before renaming it.',
        );
        return;
      }

      setIsOperating(true);
      setErrorMessage(null);

      try {
        /*
         * WebContainer's filesystem provides the real
         * rename operation. We access the shared container
         * directly here so directories, binary files, and
         * nested projects are renamed without converting
         * their contents through text.
         */
        const { getWebContainer } =
          await import(
            '../webcontainer/webcontainer'
          );

        const container =
          await getWebContainer();

        const fs =
          container.fs as typeof container.fs & {
            rename?: (
              oldPath: string,
              newPath: string,
            ) => Promise<void>;
          };

        if (
          typeof fs.rename !== 'function'
        ) {
          throw new Error(
            'The current WebContainer filesystem does not support rename.',
          );
        }

        await fs.rename(
          oldPath,
          newPath,
        );

        /*
         * If the renamed file was the active
         * editor file, reopen it under its new path.
         */
        if (
          node.type === 'file' &&
          activeFile === oldPath
        ) {
          const content =
            await readFile(newPath);

          closeFile(oldPath);

          openFile(
            newPath,
            content,
          );
        }

        await refreshFileTree();

        setDialog(null);
      } catch (error) {
        console.error(
          'EDITOR X: rename failed.',
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : `Unable to rename "${node.name}".`,
        );
      } finally {
        setIsOperating(false);
      }
    },
    [
      activeFile,
      closeFile,
      dialog,
      isFileDirty,
      openFile,
      refreshFileTree,
    ],
  );

  const handleDelete = useCallback(
    async (
      node: FileTreeNode,
    ): Promise<void> => {
      if (isOperating) {
        return;
      }

      const isDirectory =
        node.type === 'directory';

      const confirmationMessage =
        isDirectory
          ? `Delete folder "${node.name}" and everything inside it?`
          : `Delete "${node.name}"?`;

      const confirmed =
        window.confirm(
          confirmationMessage,
        );

      if (!confirmed) {
        return;
      }

      setIsOperating(true);
      setErrorMessage(null);

      try {
        await deleteFile(
          node.path,
        );

        /*
         * Remove any open tabs belonging to the
         * deleted file/folder.
         */
        const store =
          useStore.getState();

        const openFiles =
          store.openFiles ?? [];

        for (const path of openFiles) {
          if (
            path === node.path ||
            (
              isDirectory &&
              isPathInside(
                path,
                node.path,
              )
            )
          ) {
            try {
              closeFile(path);
            } catch {
              // Continue cleaning other tabs.
            }
          }
        }

        await refreshFileTree();
      } catch (error) {
        console.error(
          'EDITOR X: delete failed.',
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : `Unable to delete "${node.name}".`,
        );
      } finally {
        setIsOperating(false);
      }
    },
    [
      closeFile,
      isOperating,
      refreshFileTree,
    ],
  );

  const handleDialogSubmit =
    async (
      value: string,
    ): Promise<void> => {
      if (!dialog) {
        return;
      }

      if (
        dialog.mode === 'rename'
      ) {
        await handleRename(value);
        return;
      }

      await handleCreate(value);
    };

  const filteredTree = useMemo(
    () =>
      filterTree(
        fileTree,
        searchQuery,
      ),
    [
      fileTree,
      searchQuery,
    ],
  );

  const totalItems = useMemo(() => {
    const count = (
      nodes: FileTreeNode[],
    ): number =>
      nodes.reduce(
        (total, node) =>
          total +
          1 +
          (
            node.children
              ? count(node.children)
              : 0
          ),
        0,
      );

    return count(fileTree);
  }, [fileTree]);

  const dialogInitialValue =
    dialog?.mode === 'rename' &&
    dialog.node
      ? dialog.node.name
      : '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-900 text-gray-200">
      <div
        className="
          flex
          min-h-[44px]
          shrink-0
          items-center
          justify-between
          border-b
          border-gray-800
          bg-gray-900
          px-2
        "
      >
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen
            size={15}
            className="shrink-0 text-blue-400"
          />

          <span className="truncate text-xs font-bold tracking-wider text-gray-300">
            EXPLORER
          </span>

          {totalItems > 0 && (
            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
              {totalItems}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              openCreateDialog(
                'file',
                '.',
              );
            }}
            disabled={isOperating}
            className="
              rounded
              p-1.5
              text-gray-500
              transition
              hover:bg-gray-800
              hover:text-gray-200
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
            title="New File"
            aria-label="New File"
          >
            <FilePlus size={15} />
          </button>

          <button
            type="button"
            onClick={() => {
              openCreateDialog(
                'folder',
                '.',
              );
            }}
            disabled={isOperating}
            className="
              rounded
              p-1.5
              text-gray-500
              transition
              hover:bg-gray-800
              hover:text-gray-200
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
            title="New Folder"
            aria-label="New Folder"
          >
            <FolderPlus size={15} />
          </button>

          <button
            type="button"
            onClick={() => {
              void refreshFileTree();
            }}
            disabled={
              isRefreshing ||
              isOperating
            }
            className="
              rounded
              p-1.5
              text-gray-500
              transition
              hover:bg-gray-800
              hover:text-gray-200
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
            title="Refresh Explorer"
            aria-label="Refresh Explorer"
          >
            <RefreshCw
              size={15}
              className={
                isRefreshing
                  ? 'animate-spin'
                  : ''
              }
            />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowRootMenu(
                (previous) => !previous,
              );
            }}
            className="
              rounded
              p-1.5
              text-gray-500
              transition
              hover:bg-gray-800
              hover:text-gray-200
            "
            title="Explorer Actions"
            aria-label="Explorer Actions"
          >
            <MoreVertical size={15} />
          </button>
        </div>
      </div>

      {showRootMenu && (
        <div className="relative z-20 border-b border-gray-800 bg-gray-900 p-1">
          <button
            type="button"
            onClick={() => {
              setShowRootMenu(false);
              openCreateDialog(
                'file',
                '.',
              );
            }}
            className="
              flex
              w-full
              items-center
              gap-2
              rounded-md
              px-2.5
              py-2
              text-left
              text-xs
              text-gray-300
              hover:bg-gray-800
              hover:text-white
            "
          >
            <FilePlus size={14} />
            New File
          </button>

          <button
            type="button"
            onClick={() => {
              setShowRootMenu(false);
              openCreateDialog(
                'folder',
                '.',
              );
            }}
            className="
              flex
              w-full
              items-center
              gap-2
              rounded-md
              px-2.5
              py-2
              text-left
              text-xs
              text-gray-300
              hover:bg-gray-800
              hover:text-white
            "
          >
            <FolderPlus size={14} />
            New Folder
          </button>

          <button
            type="button"
            onClick={() => {
              setShowRootMenu(false);
              void refreshFileTree();
            }}
            className="
              flex
              w-full
              items-center
              gap-2
              rounded-md
              px-2.5
              py-2
              text-left
              text-xs
              text-gray-300
              hover:bg-gray-800
              hover:text-white
            "
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      )}

      <div className="shrink-0 border-b border-gray-800 p-2">
        <div className="relative">
          <Search
            size={14}
            className="
              pointer-events-none
              absolute
              left-2.5
              top-1/2
              -translate-y-1/2
              text-gray-600
            "
          />

          <input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(
                event.target.value,
              );
            }}
            placeholder="Filter files..."
            className="
              w-full
              rounded-md
              border
              border-gray-800
              bg-gray-950
              py-2
              pl-8
              pr-8
              text-xs
              text-gray-200
              outline-none
              placeholder:text-gray-600
              focus:border-gray-700
            "
            aria-label="Filter files"
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
              }}
              className="
                absolute
                right-2
                top-1/2
                -translate-y-1/2
                rounded
                p-0.5
                text-gray-600
                hover:text-gray-300
              "
              aria-label="Clear file filter"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="shrink-0 border-b border-red-900/60 bg-red-950/40 px-3 py-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-red-400">
              {errorMessage}
            </span>

            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
              }}
              className="ml-auto shrink-0 text-red-500 hover:text-red-300"
              aria-label="Dismiss error"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className="
              min-h-0
              flex-1
              overflow-auto
              py-1
              scrollbar-thin
            "
          >
            {isRefreshing &&
              fileTree.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-8 text-xs text-gray-500">
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                  />
                  Loading project files...
                </div>
              )}

            {!isRefreshing &&
              filteredTree.length === 0 && (
                <div className="flex flex-col items-center px-5 py-12 text-center">
                  <div className="mb-3 rounded-xl border border-gray-800 bg-gray-950 p-3">
                    <FileCode2
                      size={24}
                      className="text-gray-600"
                    />
                  </div>

                  {searchQuery ? (
                    <>
                      <p className="text-xs font-medium text-gray-400">
                        No files found
                      </p>

                      <p className="mt-1 text-[11px] text-gray-600">
                        Try a different search.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-gray-400">
                        No project files
                      </p>

                      <p className="mt-1 max-w-[180px] text-[11px] leading-5 text-gray-600">
                        Create a file or folder to start
                        building your project.
                      </p>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            openCreateDialog(
                              'file',
                              '.',
                            );
                          }}
                          className="
                            rounded-md
                            border
                            border-gray-700
                            bg-gray-800
                            px-3
                            py-1.5
                            text-[11px]
                            font-medium
                            text-gray-300
                            hover:bg-gray-700
                            hover:text-white
                          "
                        >
                          New File
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            openCreateDialog(
                              'folder',
                              '.',
                            );
                          }}
                          className="
                            rounded-md
                            border
                            border-gray-700
                            bg-gray-800
                            px-3
                            py-1.5
                            text-[11px]
                            font-medium
                            text-gray-300
                            hover:bg-gray-700
                            hover:text-white
                          "
                        >
                          New Folder
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

            {filteredTree.length > 0 && (
              <div
                role="tree"
                aria-label="Project files"
              >
                {filteredTree.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    level={0}
                    onRefresh={
                      refreshFileTree
                    }
                    onCreate={
                      openCreateDialog
                    }
                    onRename={
                      openRenameDialog
                    }
                    onDelete={
                      handleDelete
                    }
                    searchQuery={
                      searchQuery
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content
            className="
              z-[200]
              min-w-[190px]
              overflow-hidden
              rounded-lg
              border
              border-gray-700
              bg-gray-900
              p-1
              shadow-2xl
            "
          >
            <ContextMenu.Item
              className="
                flex cursor-pointer items-center gap-2
                rounded-md px-2.5 py-2
                text-sm text-gray-200
                outline-none
                hover:bg-gray-800
              "
              onSelect={() => {
                openCreateDialog(
                  'file',
                  '.',
                );
              }}
            >
              <FilePlus size={15} />
              New File
            </ContextMenu.Item>

            <ContextMenu.Item
              className="
                flex cursor-pointer items-center gap-2
                rounded-md px-2.5 py-2
                text-sm text-gray-200
                outline-none
                hover:bg-gray-800
              "
              onSelect={() => {
                openCreateDialog(
                  'folder',
                  '.',
                );
              }}
            >
              <FolderPlus size={15} />
              New Folder
            </ContextMenu.Item>

            <ContextMenu.Separator className="my-1 h-px bg-gray-800" />

            <ContextMenu.Item
              className="
                flex cursor-pointer items-center gap-2
                rounded-md px-2.5 py-2
                text-sm text-gray-200
                outline-none
                hover:bg-gray-800
              "
              onSelect={() => {
                void refreshFileTree();
              }}
            >
              <RefreshCw size={15} />
              Refresh Explorer
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <FileTreeDialog
        open={dialog !== null}
        mode={
          dialog?.mode ??
          'create-file'
        }
        targetPath={
          dialog?.node?.path
        }
        initialValue={
          dialogInitialValue
        }
        onOpenChange={(open) => {
          if (!open && !isOperating) {
            setDialog(null);
          }
        }}
        onSubmit={
          handleDialogSubmit
        }
        isBusy={isOperating}
      />
    </div>
  );
};