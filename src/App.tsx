import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import {
  Code2,
  Download,
  ExternalLink,
  FolderOpen,
  FolderTree,
  Loader2,
  MonitorPlay,
  Rocket,
  TerminalSquare,
  Upload,
  X,
} from 'lucide-react';
import type { ChangeEvent } from 'react';

import { FileTree } from './ui/FileTree';
import { Editor } from './editor/Editor';
import { Preview } from './preview/Preview';
import { Terminal } from './ui/Terminal';
import { initializeWebContainer } from './webcontainer/init';
import { useStore } from './store/useStore';
import { buildFileTree } from './webcontainer/fileWatcher';
import {
  exportProject,
  uploadDirectory,
  uploadFiles,
} from './webcontainer/fileOperations';

type NoticeType = 'info' | 'success' | 'error';

interface Notice {
  type: NoticeType;
  message: string;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
  crc32: number;
  offset: number;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce(
    (total, part) => total + part.byteLength,
    0,
  );
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

function createStoredZip(files: Array<{ path: string; content: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = file.path.replace(/^\/+/, '').replace(/\\/g, '/');
    const nameBytes = encoder.encode(name);
    const data = file.content;
    const checksum = crc32(data);

    if (nameBytes.byteLength > 0xffff) {
      throw new Error(`File path is too long to include in the ZIP: ${name}`);
    }

    if (data.byteLength > 0xffffffff) {
      throw new Error(`File is too large to include in the ZIP: ${name}`);
    }

    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(localHeader.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, data.byteLength);
    writeUint32(localView, 22, data.byteLength);
    writeUint16(localView, 26, nameBytes.byteLength);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);
    entries.push({
      name,
      data,
      crc32: checksum,
      offset: localOffset,
    });

    localOffset += localHeader.byteLength + data.byteLength;
  }

  const centralOffset = localOffset;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(centralHeader.buffer);

    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, entry.crc32);
    writeUint32(centralView, 20, entry.data.byteLength);
    writeUint32(centralView, 24, entry.data.byteLength);
    writeUint16(centralView, 28, nameBytes.byteLength);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, entry.offset);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const endOfCentralDirectory = new Uint8Array(22);
  const endView = new DataView(endOfCentralDirectory.buffer);

  if (entries.length > 0xffff || centralDirectory.byteLength > 0xffffffff || centralOffset > 0xffffffff) {
    throw new Error('The project is too large to be represented by a standard ZIP archive.');
  }

  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectory.byteLength);
  writeUint32(endView, 16, centralOffset);
  writeUint16(endView, 20, 0);

  const archive = concatUint8Arrays([
    ...localParts,
    centralDirectory,
    endOfCentralDirectory,
  ]);

  const archiveBuffer = new ArrayBuffer(archive.byteLength);
  new Uint8Array(archiveBuffer).set(archive);

  return new Blob([archiveBuffer], { type: 'application/zip' });
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<unknown>;
}

function App() {
  const {
    isBooting,
    isInstalling,
    setFileTree,
  } = useStore();

  const [notice, setNotice] =
    useState<Notice | null>(null);

  const [isDeployModalOpen, setIsDeployModalOpen] =
    useState(false);

  const [isOpeningWindow, setIsOpeningWindow] =
    useState(false);

  const [isFileOperationRunning, setIsFileOperationRunning] =
    useState(false);

  const uploadInputRef =
    useRef<HTMLInputElement | null>(null);

  const folderInputRef =
    useRef<HTMLInputElement | null>(null);

  const [isUploadMenuOpen, setIsUploadMenuOpen] =
    useState(false);

  useEffect(() => {
    /*
     * Keep the input configured as a folder picker for browsers that do not
     * expose the File System Access API. The native directory picker below is
     * preferred when the browser supports it because it gives us a real
     * FileSystemDirectoryHandle and avoids relying on webkitRelativePath.
     */
    const input = folderInputRef.current;

    if (input) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
  }, []);

  /*
   * WebContainer starts directly because authentication is disabled.
   */
  useEffect(() => {
    void initializeWebContainer();
  }, []);

  /*
   * --------------------------------------------------------------------------
   * Notices
   * --------------------------------------------------------------------------
   */

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 4500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [notice]);

  const showNotice = useCallback(
    (
      type: NoticeType,
      message: string,
    ) => {
      setNotice({
        type,
        message,
      });
    },
    [],
  );

  /*
   * --------------------------------------------------------------------------
   * Runtime status
   * --------------------------------------------------------------------------
   */

  const runtimeStatus = useMemo(() => {
    if (isBooting) {
      return 'Booting WebContainer...';
    }

    if (isInstalling) {
      return 'Installing dependencies...';
    }

    return 'Ready';
  }, [
    isBooting,
    isInstalling,
  ]);

  const isInitializing =
    isBooting || isInstalling;

  /*
   * --------------------------------------------------------------------------
   * Workspace actions
   * --------------------------------------------------------------------------
   */

  /**
   * Opens the current EDITOR X workspace in another browser window.
   *
   * The new window loads the same application and creates its own
   * WebContainer runtime.
   */
  const handleOpenNewWindow = useCallback(() => {
    if (isOpeningWindow) {
      return;
    }

    setIsOpeningWindow(true);

    try {
      const newWindow = window.open(
        window.location.href,
        '_blank',
        'noopener,noreferrer',
      );

      if (!newWindow) {
        showNotice(
          'error',
          'The new window was blocked by your browser. Please allow pop-ups for EDITOR X.',
        );

        return;
      }

      showNotice(
        'success',
        'EDITOR X opened in a new window.',
      );
    } catch (error) {
      console.error(
        'EDITOR X: failed to open a new window.',
        error,
      );

      showNotice(
        'error',
        'Unable to open a new window. Please check your browser permissions.',
      );
    } finally {
      window.setTimeout(() => {
        setIsOpeningWindow(false);
      }, 500);
    }
  }, [
    isOpeningWindow,
    showNotice,
  ]);

  const refreshWorkspaceTree = useCallback(async (): Promise<void> => {
    const tree = await buildFileTree();
    setFileTree(tree);
  }, [setFileTree]);

  const handleUploadProject = useCallback(() => {
    if (isInitializing || isFileOperationRunning) {
      return;
    }

    setIsUploadMenuOpen(true);
  }, [isInitializing, isFileOperationRunning]);

  const handleSelectUploadFiles = useCallback(() => {
    setIsUploadMenuOpen(false);
    uploadInputRef.current?.click();
  }, []);

  const handleSelectUploadFolder = useCallback(async () => {
    setIsUploadMenuOpen(false);

    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;

    if (typeof picker !== 'function') {
      folderInputRef.current?.click();
      return;
    }

    setIsFileOperationRunning(true);
    showNotice('info', 'Choose the project folder to upload to EDITOR X...');

    try {
      const directoryHandle = await picker();

      showNotice('info', 'Reading the selected project folder...');

      const result = await uploadDirectory(directoryHandle, {
        targetPath: '/',
        overwrite: true,
        ignoreUnnecessaryFiles: true,
        preserveEmptyDirectories: true,
      });

      await refreshWorkspaceTree();

      if (result.filesCreated === 0) {
        showNotice(
          'info',
          result.filesSkipped > 0
            ? `No files were uploaded. ${result.filesSkipped.toLocaleString()} file${result.filesSkipped === 1 ? '' : 's'} were skipped.`
            : 'The selected folder contained no uploadable files.',
        );
      } else {
        showNotice(
          'success',
          `Uploaded ${result.filesCreated.toLocaleString()} file${result.filesCreated === 1 ? '' : 's'}${result.filesSkipped > 0 ? `; ${result.filesSkipped.toLocaleString()} skipped` : ''}.`,
        );
      }
    } catch (error) {
      /* Browser cancellation is not an upload failure. */
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('EDITOR X: project folder upload failed.', error);
      showNotice(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to upload the selected project folder.',
      );
    } finally {
      setIsFileOperationRunning(false);
    }
  }, [refreshWorkspaceTree, showNotice]);

  const handleUploadSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const selectedFiles = event.target.files;
      event.target.value = '';

      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      setIsFileOperationRunning(true);
      showNotice('info', `Uploading ${selectedFiles.length.toLocaleString()} file${selectedFiles.length === 1 ? '' : 's'}...`);

      try {
        const result = await uploadFiles(selectedFiles, {
          targetPath: '/',
          overwrite: true,
          ignoreUnnecessaryFiles: true,
          preserveEmptyDirectories: true,
        });

        await refreshWorkspaceTree();

        if (result.filesCreated === 0) {
          showNotice(
            'info',
            result.filesSkipped > 0
              ? `No files were uploaded. ${result.filesSkipped.toLocaleString()} file${result.filesSkipped === 1 ? '' : 's'} were skipped.`
              : 'No files were selected for upload.',
          );
        } else {
          showNotice(
            'success',
            `Uploaded ${result.filesCreated.toLocaleString()} file${result.filesCreated === 1 ? '' : 's'}${result.filesSkipped > 0 ? `; ${result.filesSkipped.toLocaleString()} skipped` : ''}.`,
          );
        }
      } catch (error) {
        console.error('EDITOR X: project upload failed.', error);
        showNotice(
          'error',
          error instanceof Error
            ? error.message
            : 'Unable to upload the selected project.',
        );
      } finally {
        setIsFileOperationRunning(false);
      }
    },
    [refreshWorkspaceTree, showNotice],
  );

  const handleDownloadProject = useCallback(async () => {
    if (isInitializing || isFileOperationRunning) {
      return;
    }

    setIsFileOperationRunning(true);
    showNotice('info', 'Preparing your EDITOR X project for download...');

    try {
      const project = await exportProject('/', {
        ignoreUnnecessaryFiles: true,
      });

      if (project.files.length === 0) {
        throw new Error('The project is empty. Nothing is available to download.');
      }

      const archive = createStoredZip(project.files.map((file) => ({
        path: file.path,
        content: file.content,
      })));

      triggerBrowserDownload(archive, 'editor-x-project.zip');

      showNotice(
        'success',
        `Downloaded ${project.totalFiles.toLocaleString()} project file${project.totalFiles === 1 ? '' : 's'} as editor-x-project.zip.`,
      );
    } catch (error) {
      console.error('EDITOR X: project download failed.', error);
      showNotice(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to download the current project.',
      );
    } finally {
      setIsFileOperationRunning(false);
    }
  }, [isFileOperationRunning, isInitializing, showNotice]);

  const handleDeploy = useCallback(() => {
    setIsDeployModalOpen(true);
  }, []);

  const closeDeployModal = useCallback(() => {
    setIsDeployModalOpen(false);
  }, []);

  /*
   * --------------------------------------------------------------------------
   * EDITOR X workspace
   * Authentication is disabled; the IDE opens directly.
   * --------------------------------------------------------------------------
   */

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950 text-white">
      {/* ================================================================
          APPLICATION HEADER
          ================================================================ */}
      <header className="h-12 shrink-0 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-2 sm:px-3">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className="flex items-center justify-center w-7 h-7 shrink-0 rounded-md bg-blue-600/20 text-blue-400"
            aria-hidden="true"
          >
            <Code2 size={17} />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold tracking-wide truncate">
              EDITOR X
            </h1>

            <span className="hidden sm:inline text-xs text-gray-600">
              /
            </span>

            <span className="hidden md:inline text-xs text-gray-500 truncate">
              Web Development Workspace
            </span>
          </div>
        </div>

        {/* Workspace Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Upload Project */}
          <button
            type="button"
            onClick={handleUploadProject}
            disabled={isInitializing}
            className="
              hidden sm:flex
              items-center gap-1.5
              h-7
              px-2.5
              rounded-md
              border border-gray-700
              bg-gray-800
              text-xs text-gray-300
              transition-colors
              hover:bg-gray-750
              hover:border-gray-600
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
            title="Upload or explore a project"
          >
            {isFileOperationRunning ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            <span>Upload</span>
          </button>

          {/* Download Project */}
          <button
            type="button"
            onClick={handleDownloadProject}
            disabled={isInitializing}
            className="
              hidden sm:flex
              items-center gap-1.5
              h-7
              px-2.5
              rounded-md
              border border-gray-700
              bg-gray-800
              text-xs text-gray-300
              transition-colors
              hover:bg-gray-750
              hover:border-gray-600
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
            title="Download the current project"
          >
            {isFileOperationRunning ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span>Download</span>
          </button>

          {/* Open in New Window */}
          <button
            type="button"
            onClick={handleOpenNewWindow}
            disabled={isOpeningWindow}
            className="
              hidden md:flex
              items-center gap-1.5
              h-7
              px-2.5
              rounded-md
              border border-gray-700
              bg-gray-800
              text-xs text-gray-300
              transition-colors
              hover:bg-gray-750
              hover:border-gray-600
              hover:text-white
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
            title="Open EDITOR X in a new window"
          >
            {isOpeningWindow ? (
              <Loader2
                size={13}
                className="animate-spin"
              />
            ) : (
              <ExternalLink size={13} />
            )}

            <span>New Window</span>
          </button>

          {/* Deploy */}
          <button
            type="button"
            onClick={handleDeploy}
            className="
              flex
              items-center gap-1.5
              h-7
              px-2.5
              rounded-md
              border border-blue-500/30
              bg-blue-600/10
              text-xs text-blue-300
              transition-colors
              hover:bg-blue-600/20
              hover:border-blue-400/40
              hover:text-blue-200
            "
            title="Deployment is coming soon"
          >
            <Rocket size={13} />
            <span className="hidden xs:inline">
              Deploy
            </span>
          </button>

          {/* Runtime Status */}
          <div
            className={`
              flex items-center gap-1.5
              h-7
              px-2
              sm:px-2.5
              rounded-md
              text-xs
              ${
                isInitializing
                  ? 'bg-gray-800 text-gray-400'
                  : 'bg-emerald-500/10 text-emerald-400'
              }
            `}
            title={runtimeStatus}
            aria-label={`Runtime status: ${runtimeStatus}`}
          >
            {isInitializing ? (
              <Loader2
                size={13}
                className="animate-spin shrink-0"
                aria-hidden="true"
              />
            ) : (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                aria-hidden="true"
              />
            )}

            <span className="hidden lg:inline whitespace-nowrap">
              {runtimeStatus}
            </span>
          </div>

        </div>
      </header>

      {/* ================================================================
          ACTION NOTICE
          ================================================================ */}
      {notice && (
        <div
          className="
            absolute
            z-50
            top-14
            right-3
            max-w-sm
            rounded-lg
            border
            shadow-2xl
            backdrop-blur
          "
          role="status"
          aria-live="polite"
        >
          <div
            className={`
              flex items-start gap-3
              px-3 py-2.5
              rounded-lg
              ${
                notice.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200'
                  : notice.type === 'error'
                    ? 'border-red-500/30 bg-red-950/90 text-red-200'
                    : 'border-gray-700 bg-gray-900/95 text-gray-300'
              }
            `}
          >
            <span className="text-xs leading-5">
              {notice.message}
            </span>

            <button
              type="button"
              onClick={() => setNotice(null)}
              className="
                shrink-0
                p-0.5
                rounded
                text-gray-500
                hover:text-gray-200
                transition-colors
              "
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleUploadSelection(event);
        }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleUploadSelection(event);
        }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {isUploadMenuOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsUploadMenuOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-project-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div>
                <h2 id="upload-project-title" className="text-sm font-semibold text-gray-100">
                  Upload Project
                </h2>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Add files or an entire project folder to EDITOR X.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadMenuOpen(false)}
                className="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                aria-label="Close upload options"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 grid gap-2">
              <button
                type="button"
                onClick={handleSelectUploadFiles}
                className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 text-left hover:bg-gray-750 hover:border-gray-600 transition-colors"
              >
                <Upload size={17} className="text-blue-400" />
                <span>
                  <span className="block text-xs font-medium text-gray-200">Choose Files</span>
                  <span className="block mt-0.5 text-[11px] text-gray-500">Upload one or more files.</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleSelectUploadFolder();
                }}
                className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 text-left hover:bg-gray-750 hover:border-gray-600 transition-colors"
              >
                <FolderOpen size={17} className="text-blue-400" />
                <span>
                  <span className="block text-xs font-medium text-gray-200">Choose Project Folder</span>
                  <span className="block mt-0.5 text-[11px] text-gray-500">Keep nested folders and file paths.</span>
                </span>
              </button>
            </div>

            <div className="px-4 py-3 border-t border-gray-800 text-[10px] leading-4 text-gray-600">
              Existing files with the same path are replaced. Generated folders such as node_modules and .git are skipped.
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          WORKSPACE
          ================================================================ */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* ============================================================
              EXPLORER
              ============================================================ */}
          <Panel
            defaultSize={15}
            minSize={10}
            maxSize={30}
          >
            <section
              className="
                h-full
                border-r
                border-gray-800
                bg-gray-900
                overflow-hidden
                flex
                flex-col
              "
              aria-label="File explorer"
            >
              <div
                className="
                  h-9
                  shrink-0
                  px-3
                  flex
                  items-center
                  justify-between
                  border-b
                  border-gray-800
                  text-xs
                  font-medium
                  text-gray-400
                "
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderTree size={14} />
                  <span>EXPLORER</span>
                </div>

                <button
                  type="button"
                  onClick={handleUploadProject}
                  disabled={isInitializing}
                  className="
                    sm:hidden
                    p-1
                    rounded
                    text-gray-500
                    hover:text-gray-200
                    hover:bg-gray-800
                    transition-colors
                    disabled:opacity-50
                  "
                  title="Upload project"
                  aria-label="Upload project"
                >
                  <FolderOpen size={14} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <FileTree />
              </div>
            </section>
          </Panel>

          <PanelResizeHandle
            className="
              w-1
              bg-gray-900
              hover:bg-blue-500
              active:bg-blue-500
              transition-colors
            "
            aria-label="Resize explorer"
          />

          {/* ============================================================
              EDITOR + TERMINAL
              ============================================================ */}
          <Panel
            defaultSize={50}
            minSize={30}
          >
            <PanelGroup direction="vertical">
              {/* Editor */}
              <Panel
                defaultSize={70}
                minSize={30}
              >
                <section
                  className="h-full overflow-hidden bg-gray-950"
                  aria-label="Code editor"
                >
                  <Editor />
                </section>
              </Panel>

              <PanelResizeHandle
                className="
                  h-1
                  bg-gray-900
                  hover:bg-blue-500
                  active:bg-blue-500
                  transition-colors
                "
                aria-label="Resize editor and terminal"
              />

              {/* Terminal */}
              <Panel
                defaultSize={30}
                minSize={15}
              >
                <section
                  className="h-full overflow-hidden bg-black"
                  aria-label="Terminal"
                >
                  <div
                    className="
                      h-8
                      shrink-0
                      border-b
                      border-gray-800
                      flex
                      items-center
                      justify-between
                      px-3
                      gap-2
                      text-xs
                      text-gray-500
                    "
                  >
                    <div className="flex items-center gap-2">
                      <TerminalSquare size={14} />
                      <span>TERMINAL</span>
                    </div>

                    <span className="hidden sm:inline text-[10px] text-gray-700">
                      WebContainer shell
                    </span>
                  </div>

                  <div className="h-[calc(100%-2rem)] overflow-hidden">
                    <Terminal />
                  </div>
                </section>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle
            className="
              w-1
              bg-gray-900
              hover:bg-blue-500
              active:bg-blue-500
              transition-colors
            "
            aria-label="Resize editor and preview"
          />

          {/* ============================================================
              PREVIEW
              ============================================================ */}
          <Panel
            defaultSize={35}
            minSize={20}
          >
            <section
              className="
                h-full
                border-l
                border-gray-800
                bg-gray-900
                overflow-hidden
                flex
                flex-col
              "
              aria-label="Live preview"
            >
              <div
                className="
                  h-9
                  shrink-0
                  px-3
                  flex
                  items-center
                  justify-between
                  border-b
                  border-gray-800
                  text-xs
                  font-medium
                  text-gray-400
                "
              >
                <div className="flex items-center gap-2">
                  <MonitorPlay size={14} />
                  <span>PREVIEW</span>
                </div>

                <span
                  className={`
                    text-[10px]
                    ${
                      isInitializing
                        ? 'text-gray-600'
                        : 'text-emerald-500/70'
                    }
                  `}
                >
                  {isInitializing
                    ? 'STARTING'
                    : 'LIVE'}
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <Preview />
              </div>
            </section>
          </Panel>
        </PanelGroup>
      </main>

      {/* ================================================================
          DEPLOY MODAL
          ================================================================ */}
      {isDeployModalOpen && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            p-4
            bg-black/70
            backdrop-blur-sm
          "
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDeployModal();
            }
          }}
        >
          <div
            className="
              w-full
              max-w-md
              rounded-xl
              border
              border-gray-700
              bg-gray-900
              shadow-2xl
              overflow-hidden
            "
            role="dialog"
            aria-modal="true"
            aria-labelledby="deploy-title"
          >
            <div
              className="
                flex
                items-center
                justify-between
                px-4
                py-3
                border-b
                border-gray-800
              "
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="
                    flex
                    items-center
                    justify-center
                    w-8
                    h-8
                    rounded-lg
                    bg-blue-600/10
                    text-blue-400
                  "
                >
                  <Rocket size={16} />
                </div>

                <div>
                  <h2
                    id="deploy-title"
                    className="text-sm font-semibold text-gray-100"
                  >
                    Deploy Project
                  </h2>

                  <p className="text-[11px] text-gray-500">
                    EDITOR X deployment
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDeployModal}
                className="
                  p-1.5
                  rounded-md
                  text-gray-500
                  hover:text-gray-200
                  hover:bg-gray-800
                  transition-colors
                "
                aria-label="Close deploy dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-5">
              <div
                className="
                  rounded-lg
                  border
                  border-blue-500/20
                  bg-blue-500/5
                  px-4
                  py-4
                "
              >
                <div className="flex items-start gap-3">
                  <Rocket
                    size={18}
                    className="mt-0.5 shrink-0 text-blue-400"
                  />

                  <div>
                    <h3 className="text-sm font-medium text-gray-100">
                      Deployment is coming soon
                    </h3>

                    <p className="mt-1.5 text-xs leading-5 text-gray-400">
                      The deployment interface is ready,
                      but EDITOR X does not connect to a
                      production hosting provider yet.
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-gray-500">
                Your project remains safely inside the
                current browser workspace. No fake
                deployment URL or fake deployment status
                is generated.
              </p>
            </div>

            <div
              className="
                px-4
                py-3
                border-t
                border-gray-800
                flex
                justify-end
              "
            >
              <button
                type="button"
                onClick={closeDeployModal}
                className="
                  px-3
                  py-1.5
                  rounded-md
                  bg-gray-800
                  border
                  border-gray-700
                  text-xs
                  text-gray-300
                  hover:bg-gray-750
                  hover:text-white
                  transition-colors
                "
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;