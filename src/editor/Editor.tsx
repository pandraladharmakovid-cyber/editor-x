import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import MonacoEditor, {
  type BeforeMount,
  type OnMount,
} from '@monaco-editor/react';
import {
  Check,
  Code2,
  FileCode2,
  FileText,
  Keyboard,
  Loader2,
  Save,
  Search,
  X,
  Zap,
} from 'lucide-react';

import { useStore } from '../store/useStore';
import { writeFile } from '../webcontainer/webcontainer';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

type EditorInstance = {
  focus: () => void;
  getModel: () => {
    getLineCount: () => number;
  } | null;
  getPosition: () => {
    lineNumber: number;
    column: number;
  } | null;
  addAction: (action: {
    id: string;
    label: string;
    keybindings?: number[];
    run: () => void;
  }) => void;
};

type MonacoNamespace = {
  KeyMod: {
    CtrlCmd: number;
    Shift: number;
  };
  KeyCode: {
    KeyS: number;
    KeyP: number;
    KeyO: number;
  };
  editor: {
    defineTheme: (
      name: string,
      theme: {
        base: string;
        inherit: boolean;
        rules: unknown[];
        colors: Record<string, string>;
      },
    ) => void;
  };
};

const SAVE_DEBOUNCE_MS = 500;
const LARGE_FILE_THRESHOLD = 500_000;
const VERY_LARGE_FILE_THRESHOLD = 1_500_000;

const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',

  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',

  json: 'json',
  jsonc: 'json',

  html: 'html',
  htm: 'html',

  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',

  md: 'markdown',
  markdown: 'markdown',

  xml: 'xml',
  svg: 'xml',

  yaml: 'yaml',
  yml: 'yaml',

  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',

  py: 'python',
  java: 'java',

  c: 'c',
  h: 'c',

  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',

  rs: 'rust',
  go: 'go',
  php: 'php',
  sql: 'sql',

  vue: 'html',
  svelte: 'html',

  graphql: 'graphql',
  gql: 'graphql',

  txt: 'plaintext',
  log: 'plaintext',
};

function getLanguage(filename: string): string {
  const normalizedName = filename
    .replace(/\\/g, '/')
    .toLowerCase();

  if (normalizedName.endsWith('.d.ts')) {
    return 'typescript';
  }

  if (
    normalizedName.endsWith('.config.js') ||
    normalizedName.endsWith('.config.mjs') ||
    normalizedName.endsWith('.config.cjs')
  ) {
    return 'javascript';
  }

  if (
    normalizedName.endsWith('.config.ts') ||
    normalizedName.endsWith('.config.mts')
  ) {
    return 'typescript';
  }

  const fileName =
    normalizedName.split('/').pop() ?? '';

  if (fileName === 'dockerfile') {
    return 'dockerfile';
  }

  if (fileName === 'makefile') {
    return 'plaintext';
  }

  if (
    fileName === '.gitignore' ||
    fileName === '.npmignore'
  ) {
    return 'plaintext';
  }

  const extension =
    fileName.split('.').pop() ?? '';

  return LANGUAGE_MAP[extension] ?? 'plaintext';
}

function getFileName(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/');

  return (
    normalizedPath.split('/').pop() || path
  );
}

function getFileDirectory(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/');
  const lastSlash =
    normalizedPath.lastIndexOf('/');

  if (lastSlash === -1) {
    return '';
  }

  return normalizedPath.slice(0, lastSlash);
}

function getFileExtension(path: string): string {
  const fileName = getFileName(path);
  const lastDot = fileName.lastIndexOf('.');

  if (lastDot <= 0) {
    return '';
  }

  return fileName
    .slice(lastDot + 1)
    .toUpperCase();
}

function countLines(content: string): number {
  if (!content) {
    return 0;
  }

  return content.split('\n').length;
}

function isLargeFile(content: string): boolean {
  return (
    content.length >= LARGE_FILE_THRESHOLD
  );
}

function isVeryLargeFile(content: string): boolean {
  return (
    content.length >=
    VERY_LARGE_FILE_THRESHOLD
  );
}

function getReadableSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(2)} MB`;
}

export const Editor: React.FC = () => {
  const {
    openFiles,
    activeFile,
    fileContents,
    closeFile,
    setActiveFile,
    updateFileContent,
  } = useStore();

  const editorRef =
    useRef<EditorInstance | null>(null);

  const monacoRef =
    useRef<MonacoNamespace | null>(null);

  const saveTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const saveRequestRef = useRef(0);

  const mountedRef = useRef(true);

  const [saveStates, setSaveStates] =
    useState<Record<string, SaveState>>({});

  const [showCommandHint, setShowCommandHint] =
    useState(false);

  const currentContent = activeFile
    ? fileContents[activeFile] ?? ''
    : '';

  const currentSaveState: SaveState =
    activeFile
      ? saveStates[activeFile] ?? 'saved'
      : 'saved';

  const largeFile = useMemo(
    () => isLargeFile(currentContent),
    [currentContent],
  );

  const veryLargeFile = useMemo(
    () => isVeryLargeFile(currentContent),
    [currentContent],
  );

  const lineCount = useMemo(
    () => countLines(currentContent),
    [currentContent],
  );

  const fileSize = useMemo(
    () => getReadableSize(currentContent.length),
    [currentContent.length],
  );

  const language = useMemo(
    () =>
      activeFile
        ? getLanguage(activeFile)
        : 'plaintext',
    [activeFile],
  );

  const extension = useMemo(
    () =>
      activeFile
        ? getFileExtension(activeFile)
        : '',
    [activeFile],
  );

  const clearSaveTimer = useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const saveFile = useCallback(
    async (
      path: string,
      content: string,
    ) => {
      const requestId =
        ++saveRequestRef.current;

      setSaveStates((current) => ({
        ...current,
        [path]: 'saving',
      }));

      try {
        await writeFile(path, content);

        if (!mountedRef.current) {
          return;
        }

        if (
          requestId !==
          saveRequestRef.current
        ) {
          return;
        }

        setSaveStates((current) => ({
          ...current,
          [path]: 'saved',
        }));
      } catch (error) {
        console.error(
          `Failed to save "${path}":`,
          error,
        );

        if (!mountedRef.current) {
          return;
        }

        if (
          requestId !==
          saveRequestRef.current
        ) {
          return;
        }

        setSaveStates((current) => ({
          ...current,
          [path]: 'error',
        }));
      }
    },
    [],
  );

  const scheduleSave = useCallback(
    (
      path: string,
      content: string,
    ) => {
      clearSaveTimer();

      saveTimeoutRef.current =
        setTimeout(() => {
          saveTimeoutRef.current = null;

          void saveFile(path, content);
        }, SAVE_DEBOUNCE_MS);
    },
    [clearSaveTimer, saveFile],
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (
        !activeFile ||
        value === undefined
      ) {
        return;
      }

      updateFileContent(
        activeFile,
        value,
      );

      setSaveStates((current) => ({
        ...current,
        [activeFile]: 'unsaved',
      }));

      scheduleSave(
        activeFile,
        value,
      );
    },
    [
      activeFile,
      scheduleSave,
      updateFileContent,
    ],
  );

  const handleManualSave = useCallback(
    () => {
      if (!activeFile) {
        return;
      }

      clearSaveTimer();

      void saveFile(
        activeFile,
        fileContents[activeFile] ?? '',
      );
    },
    [
      activeFile,
      clearSaveTimer,
      fileContents,
      saveFile,
    ],
  );

  const handleSaveAll = useCallback(
    async () => {
      clearSaveTimer();

      const filesToSave =
        openFiles.filter(
          (file) =>
            saveStates[file] === 'unsaved',
        );

      if (filesToSave.length === 0) {
        if (activeFile) {
          await saveFile(
            activeFile,
            fileContents[activeFile] ?? '',
          );
        }

        return;
      }

      await Promise.all(
        filesToSave.map((file) =>
          saveFile(
            file,
            fileContents[file] ?? '',
          ),
        ),
      );
    },
    [
      activeFile,
      clearSaveTimer,
      fileContents,
      openFiles,
      saveFile,
      saveStates,
    ],
  );

  const handleBeforeMount: BeforeMount = (
    monaco,
  ) => {
    const namespace =
      monaco as unknown as MonacoNamespace;

    monacoRef.current = namespace;

    namespace.editor.defineTheme(
      'editor-x-dark',
      {
        base: 'vs-dark',
        inherit: true,

        rules: [
          {
            token: 'comment',
            foreground: '6B7280',
            fontStyle: 'italic',
          },
          {
            token: 'keyword',
            foreground: '60A5FA',
          },
          {
            token: 'string',
            foreground: 'A7F3D0',
          },
          {
            token: 'number',
            foreground: 'FCD34D',
          },
          {
            token: 'type',
            foreground: '93C5FD',
          },
        ],

        colors: {
          'editor.background':
            '#030712',

          'editor.foreground':
            '#E5E7EB',

          'editorLineNumber.foreground':
            '#4B5563',

          'editorLineNumber.activeForeground':
            '#9CA3AF',

          'editorCursor.foreground':
            '#60A5FA',

          'editor.selectionBackground':
            '#1D4ED866',

          'editor.inactiveSelectionBackground':
            '#37415166',

          'editor.lineHighlightBackground':
            '#111827',

          'editorIndentGuide.background1':
            '#1F2937',

          'editorIndentGuide.activeBackground1':
            '#374151',

          'editorWidget.background':
            '#111827',

          'editorWidget.border':
            '#374151',

          'editorSuggestWidget.background':
            '#111827',

          'editorSuggestWidget.border':
            '#374151',

          'editorSuggestWidget.selectedBackground':
            '#1F2937',

          'editorHoverWidget.background':
            '#111827',

          'editorHoverWidget.border':
            '#374151',

          'editorGutter.background':
            '#030712',

          'editorBracketMatch.background':
            '#1D4ED833',

          'editorBracketMatch.border':
            '#3B82F680',

          'editorWhitespace.foreground':
            '#374151',

          'scrollbarSlider.background':
            '#37415166',

          'scrollbarSlider.hoverBackground':
            '#4B556399',

          'scrollbarSlider.activeBackground':
            '#6B728099',
        },
      },
    );
  };

  const handleEditorMount: OnMount = (
    editor,
    monaco,
  ) => {
    const editorInstance =
      editor as unknown as EditorInstance;

    const monacoNamespace =
      monaco as unknown as MonacoNamespace;

    editorRef.current =
      editorInstance;

    monacoRef.current =
      monacoNamespace;

    editorInstance.addAction({
      id: 'editor-x-save-file',

      label: 'Save File',

      keybindings: [
        monacoNamespace.KeyMod.CtrlCmd |
          monacoNamespace.KeyCode.KeyS,
      ],

      run: () => {
        handleManualSave();
      },
    });

    editorInstance.addAction({
      id: 'editor-x-save-all',

      label: 'Save All Files',

      keybindings: [
        monacoNamespace.KeyMod.CtrlCmd |
          monacoNamespace.KeyMod.Shift |
          monacoNamespace.KeyCode.KeyS,
      ],

      run: () => {
        void handleSaveAll();
      },
    });

    editorInstance.addAction({
      id: 'editor-x-focus-editor',

      label: 'Focus Editor',

      keybindings: [
        monacoNamespace.KeyMod.CtrlCmd |
          monacoNamespace.KeyCode.KeyO,
      ],

      run: () => {
        editorInstance.focus();
      },
    });

    editorInstance.addAction({
      id: 'editor-x-toggle-command-hint',

      label: 'Show Editor Shortcuts',

      keybindings: [
        monacoNamespace.KeyMod.CtrlCmd |
          monacoNamespace.KeyCode.KeyP,
      ],

      run: () => {
        setShowCommandHint(
          (current) => !current,
        );
      },
    });

    editorInstance.focus();
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearSaveTimer();
    };
  }, [clearSaveTimer]);

  useEffect(() => {
    if (!activeFile) {
      clearSaveTimer();
      return;
    }

    clearSaveTimer();

    setSaveStates((current) => {
      if (current[activeFile]) {
        return current;
      }

      return {
        ...current,
        [activeFile]: 'saved',
      };
    });
  }, [
    activeFile,
    clearSaveTimer,
  ]);

  const handleTabClick = useCallback(
    (file: string) => {
      clearSaveTimer();
      setActiveFile(file);
    },
    [
      clearSaveTimer,
      setActiveFile,
    ],
  );

  const handleCloseFile =
    useCallback(
      (
        event: React.MouseEvent<HTMLButtonElement>,
        file: string,
      ) => {
        event.stopPropagation();

        if (
          saveStates[file] ===
          'unsaved'
        ) {
          const shouldClose =
            window.confirm(
              `${getFileName(file)} has unsaved changes. Close it anyway?`,
            );

          if (!shouldClose) {
            return;
          }
        }

        if (file === activeFile) {
          clearSaveTimer();
        }

        closeFile(file);

        setSaveStates((current) => {
          const next = {
            ...current,
          };

          delete next[file];

          return next;
        });
      },
      [
        activeFile,
        clearSaveTimer,
        closeFile,
        saveStates,
      ],
    );

  const handleCloseAll =
    useCallback(() => {
      const hasUnsavedFiles =
        openFiles.some(
          (file) =>
            saveStates[file] ===
            'unsaved',
        );

      if (hasUnsavedFiles) {
        const shouldClose =
          window.confirm(
            'There are files with unsaved changes. Close all files anyway?',
          );

        if (!shouldClose) {
          return;
        }
      }

      clearSaveTimer();

      openFiles.forEach((file) => {
        closeFile(file);
      });

      setSaveStates({});
    }, [
      clearSaveTimer,
      closeFile,
      openFiles,
      saveStates,
    ]);

  const handleRetrySave =
    useCallback(() => {
      if (!activeFile) {
        return;
      }

      void saveFile(
        activeFile,
        fileContents[activeFile] ?? '',
      );
    }, [
      activeFile,
      fileContents,
      saveFile,
    ]);

  const statusLabel =
    currentSaveState === 'saving'
      ? 'Saving...'
      : currentSaveState === 'unsaved'
        ? 'Unsaved'
        : currentSaveState === 'error'
          ? 'Save failed'
          : 'Saved';

  const statusClass =
    currentSaveState === 'saving'
      ? 'text-yellow-400'
      : currentSaveState === 'unsaved'
        ? 'text-orange-400'
        : currentSaveState === 'error'
          ? 'text-red-400'
          : 'text-emerald-400';

  const statusIcon =
    currentSaveState === 'saving' ? (
      <Loader2
        size={11}
        className="
          animate-spin
          text-yellow-400
        "
      />
    ) : currentSaveState === 'error' ? (
      <button
        type="button"
        onClick={handleRetrySave}
        title="Retry save"
        aria-label="Retry save"
        className="
          hover:text-red-300
        "
      >
        <Save size={11} />
      </button>
    ) : currentSaveState ===
      'saved' ? (
      <Check size={11} />
    ) : (
      <span
        className="
          w-1.5
          h-1.5
          rounded-full
          bg-orange-400
        "
      />
    );

  return (
    <div
      className="
        h-full
        min-h-0
        flex
        flex-col
        bg-gray-950
        text-gray-200
      "
    >
      {/* ================================================================
          FILE TABS
          ================================================================ */}
      <div
        className="
          h-10
          shrink-0
          flex
          items-stretch
          bg-gray-900
          border-b
          border-gray-800
          overflow-x-auto
          overflow-y-hidden
        "
      >
        {openFiles.length === 0 ? (
          <div
            className="
              flex-1
              flex
              items-center
              justify-center
              px-4
              text-xs
              text-gray-600
            "
          >
            <div
              className="
                flex
                items-center
                gap-2
              "
            >
              <FileText size={13} />

              <span>
                Select a file from the
                Explorer to start editing.
              </span>
            </div>
          </div>
        ) : (
          <>
            {openFiles.map((file) => {
              const isActive =
                activeFile === file;

              const saveState =
                saveStates[file] ??
                'saved';

              const fileName =
                getFileName(file);

              const directory =
                getFileDirectory(file);

              return (
                <div
                  key={file}
                  className={`
                    group
                    relative
                    flex
                    items-center
                    min-w-[125px]
                    max-w-[250px]
                    border-r
                    border-gray-800
                    ${
                      isActive
                        ? 'bg-gray-950 text-gray-100'
                        : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                    }
                  `}
                >
                  {isActive && (
                    <span
                      className="
                        absolute
                        left-0
                        top-0
                        bottom-0
                        w-0.5
                        bg-blue-500
                      "
                    />
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      handleTabClick(file)
                    }
                    title={file}
                    className="
                      flex
                      items-center
                      gap-2
                      min-w-0
                      flex-1
                      px-3
                      py-1.5
                      text-left
                    "
                  >
                    <FileCode2
                      size={14}
                      className={`
                        shrink-0
                        ${
                          isActive
                            ? 'text-blue-400'
                            : 'text-gray-500'
                        }
                      `}
                    />

                    <span
                      className="
                        flex-1
                        min-w-0
                      "
                    >
                      <span
                        className="
                          block
                          text-xs
                          truncate
                        "
                      >
                        {fileName}
                      </span>

                      {directory && (
                        <span
                          className="
                            block
                            text-[10px]
                            text-gray-600
                            truncate
                          "
                        >
                          {directory}
                        </span>
                      )}
                    </span>

                    {saveState ===
                      'unsaved' && (
                      <span
                        className="
                          w-1.5
                          h-1.5
                          rounded-full
                          bg-orange-400
                          shrink-0
                        "
                        title="Unsaved changes"
                      />
                    )}

                    {saveState ===
                      'saving' && (
                      <Loader2
                        size={11}
                        className="
                          shrink-0
                          animate-spin
                          text-yellow-400
                        "
                      />
                    )}

                    {saveState ===
                      'error' && (
                      <span
                        className="
                          w-1.5
                          h-1.5
                          rounded-full
                          bg-red-400
                          shrink-0
                        "
                        title="Save failed"
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(event) =>
                      handleCloseFile(
                        event,
                        file,
                      )
                    }
                    title={`Close ${fileName}`}
                    aria-label={`Close ${fileName}`}
                    className={`
                      shrink-0
                      mr-1
                      p-1
                      rounded
                      text-gray-500
                      hover:text-gray-200
                      hover:bg-gray-800
                      transition-all
                      ${
                        isActive
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }
                    `}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleCloseAll}
              title="Close all open files"
              aria-label="Close all open files"
              className="
                shrink-0
                self-center
                mx-1
                p-1.5
                rounded
                text-gray-600
                hover:text-gray-200
                hover:bg-gray-800
                transition-colors
              "
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>

      {/* ================================================================
          EDITOR TOOLBAR
          ================================================================ */}
      {activeFile && (
        <div
          className="
            min-h-8
            shrink-0
            flex
            items-center
            justify-between
            gap-2
            px-2
            sm:px-3
            bg-gray-900
            border-b
            border-gray-800
          "
        >
          <div
            className="
              flex
              items-center
              gap-2
              min-w-0
            "
          >
            <Code2
              size={12}
              className="
                text-gray-600
                shrink-0
              "
            />

            <span
              className="
                text-[11px]
                text-gray-500
                truncate
              "
              title={activeFile}
            >
              {activeFile}
            </span>

            {extension && (
              <span
                className="
                  hidden
                  sm:inline
                  shrink-0
                  text-[9px]
                  px-1.5
                  py-0.5
                  rounded
                  border
                  border-gray-800
                  text-gray-600
                "
              >
                {extension}
              </span>
            )}

            {largeFile && (
              <span
                className="
                  hidden
                  sm:inline
                  shrink-0
                  text-[9px]
                  px-1.5
                  py-0.5
                  rounded
                  bg-yellow-500/10
                  text-yellow-400
                "
              >
                Large file
              </span>
            )}

            {veryLargeFile && (
              <span
                className="
                  hidden
                  md:inline
                  shrink-0
                  text-[9px]
                  px-1.5
                  py-0.5
                  rounded
                  bg-orange-500/10
                  text-orange-400
                "
              >
                Performance mode
              </span>
            )}
          </div>

          <div
            className="
              flex
              items-center
              gap-1
              shrink-0
            "
          >
            <span
              className={`
                hidden
                sm:flex
                items-center
                gap-1
                text-[10px]
                ${statusClass}
              `}
            >
              {statusIcon}
              <span>{statusLabel}</span>
            </span>

            {currentSaveState ===
              'error' && (
              <button
                type="button"
                onClick={handleRetrySave}
                className="
                  hidden
                  sm:block
                  px-1.5
                  py-0.5
                  rounded
                  text-[9px]
                  text-red-400
                  hover:bg-red-500/10
                  transition-colors
                "
              >
                Retry
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setShowCommandHint(
                  (current) =>
                    !current,
                )
              }
              title="Editor shortcuts"
              aria-label="Editor shortcuts"
              className="
                p-1
                rounded
                text-gray-600
                hover:text-gray-200
                hover:bg-gray-800
                transition-colors
              "
            >
              <Keyboard size={12} />
            </button>

            <button
              type="button"
              onClick={handleManualSave}
              disabled={
                currentSaveState ===
                'saving'
              }
              title="Save file (Ctrl+S)"
              aria-label="Save file"
              className="
                p-1
                rounded
                text-gray-500
                hover:text-gray-200
                hover:bg-gray-800
                disabled:opacity-40
                disabled:cursor-not-allowed
                transition-colors
              "
            >
              <Save
                size={13}
                className={
                  currentSaveState ===
                  'unsaved'
                    ? 'text-orange-400'
                    : ''
                }
              />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================
          SHORTCUT PANEL
          ================================================================ */}
      {showCommandHint &&
        activeFile && (
          <div
            className="
              absolute
              z-40
              mt-[73px]
              right-3
              w-64
              rounded-lg
              border
              border-gray-700
              bg-gray-900
              shadow-2xl
              overflow-hidden
            "
          >
            <div
              className="
                flex
                items-center
                justify-between
                px-3
                py-2
                border-b
                border-gray-800
              "
            >
              <div
                className="
                  flex
                  items-center
                  gap-2
                "
              >
                <Keyboard
                  size={13}
                  className="text-blue-400"
                />

                <span
                  className="
                    text-xs
                    font-medium
                    text-gray-300
                  "
                >
                  Editor shortcuts
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowCommandHint(
                    false,
                  )
                }
                className="
                  p-0.5
                  rounded
                  text-gray-600
                  hover:text-gray-200
                "
                aria-label="Close shortcuts"
              >
                <X size={12} />
              </button>
            </div>

            <div
              className="
                p-2
                space-y-1
              "
            >
              {[
                [
                  'Ctrl / Cmd + S',
                  'Save file',
                ],
                [
                  'Ctrl / Cmd + Shift + S',
                  'Save all files',
                ],
                [
                  'Ctrl / Cmd + P',
                  'Toggle this panel',
                ],
                [
                  'Ctrl / Cmd + O',
                  'Focus editor',
                ],
              ].map(
                ([
                  shortcut,
                  description,
                ]) => (
                  <div
                    key={shortcut}
                    className="
                      flex
                      items-center
                      justify-between
                      gap-3
                      px-2
                      py-1.5
                      rounded
                      hover:bg-gray-800
                    "
                  >
                    <span
                      className="
                        text-[10px]
                        text-gray-500
                      "
                    >
                      {description}
                    </span>

                    <kbd
                      className="
                        shrink-0
                        px-1.5
                        py-0.5
                        rounded
                        bg-gray-950
                        border
                        border-gray-700
                        text-[9px]
                        text-gray-400
                      "
                    >
                      {shortcut}
                    </kbd>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

      {/* ================================================================
          MONACO EDITOR
          ================================================================ */}
      <div
        className="
          flex-1
          min-h-0
          relative
        "
      >
        {activeFile ? (
          <>
            <MonacoEditor
              height="100%"
              language={language}
              value={currentContent}
              onChange={handleEditorChange}
              theme="editor-x-dark"
              beforeMount={handleBeforeMount}
              onMount={handleEditorMount}
              loading={
                <div
                  className="
                    h-full
                    flex
                    items-center
                    justify-center
                    bg-gray-950
                    text-gray-600
                  "
                >
                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      text-xs
                    "
                  >
                    <Loader2
                      size={14}
                      className="
                        animate-spin
                      "
                    />

                    Loading editor...
                  </div>
                </div>
              }
              options={{
                minimap: {
                  enabled:
                    !largeFile &&
                    !veryLargeFile,
                },

                fontSize: 14,

                lineNumbers: 'on',

                automaticLayout: true,

                tabSize: 2,

                insertSpaces: true,

                detectIndentation: false,

                wordWrap: 'off',

                scrollBeyondLastLine:
                  false,

                smoothScrolling:
                  !veryLargeFile,

                cursorBlinking:
                  veryLargeFile
                    ? 'solid'
                    : 'smooth',

                cursorSmoothCaretAnimation:
                  veryLargeFile
                    ? 'off'
                    : 'on',

                renderWhitespace:
                  'selection',

                bracketPairColorization:
                  {
                    enabled:
                      !veryLargeFile,
                  },

                guides: {
                  bracketPairs:
                    !veryLargeFile,

                  indentation: true,
                },

                folding:
                  !veryLargeFile,

                foldingHighlight:
                  !veryLargeFile,

                stickyScroll: {
                  enabled:
                    !veryLargeFile,
                },

                padding: {
                  top: 8,
                  bottom: 8,
                },

                quickSuggestions:
                  !veryLargeFile,

                suggestOnTriggerCharacters:
                  !veryLargeFile,

                formatOnPaste: false,

                formatOnType: false,

                largeFileOptimizations:
                  largeFile,

                wordBasedSuggestions:
                  veryLargeFile
                    ? 'off'
                    : 'matchingDocuments',

                occurrencesHighlight:
                  veryLargeFile
                    ? 'off'
                    : 'singleFile',

                selectionHighlight:
                  !veryLargeFile,

                codeLens:
                  !veryLargeFile,

                hover: {
                  enabled:
                    !veryLargeFile,
                },

                parameterHints: {
                  enabled:
                    !veryLargeFile,
                },

                

                contextmenu: true,

                mouseWheelZoom: true,

                multiCursorModifier:
                  'alt',

                readOnly: false,

                renderControlCharacters:
                  false,

                scrollbar: {
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10,
                  useShadows: false,
                },

                overviewRulerLanes:
                  veryLargeFile
                    ? 0
                    : 3,

                hideCursorInOverviewRuler:
                  false,

                links: true,

                colorDecorators:
                  !veryLargeFile,

                unicodeHighlight: {
                  ambiguousCharacters:
                    false,

                  invisibleCharacters:
                    true,
                },

                autoClosingBrackets:
                  'always',

                autoClosingQuotes:
                  'always',

                autoSurround:
                  'languageDefined',

               
                stickyTabStops: false,

                dragAndDrop: true,

                copyWithSyntaxHighlighting:
                  true,

                emptySelectionClipboard:
                  true,

                tabCompletion: 'on',

                accessibilitySupport:
                  'auto',

                quickSuggestionsDelay: 10,

                acceptSuggestionOnEnter:
                  'on',

                acceptSuggestionOnCommitCharacter:
                  true,
              }}
            />

            {largeFile && (
              <div
                className="
                  absolute
                  left-3
                  bottom-3
                  z-10
                  pointer-events-none
                "
              >
                <div
                  className="
                    flex
                    items-center
                    gap-1.5
                    px-2
                    py-1
                    rounded
                    border
                    border-yellow-500/20
                    bg-gray-950/90
                    text-[9px]
                    text-yellow-500/80
                    backdrop-blur
                  "
                >
                  <Zap size={10} />

                  <span>
                    Large-file optimizations
                    enabled
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div
            className="
              h-full
              flex
              flex-col
              items-center
              justify-center
              bg-gray-950
              text-center
              px-6
            "
          >
            <div
              className="
                flex
                items-center
                justify-center
                w-16
                h-16
                rounded-2xl
                bg-gray-900
                border
                border-gray-800
                mb-5
              "
            >
              <FileCode2
                size={32}
                strokeWidth={1}
                className="text-gray-600"
              />
            </div>

            <p
              className="
                text-sm
                text-gray-400
              "
            >
              No file is open
            </p>

            <p
              className="
                text-xs
                text-gray-600
                mt-1
              "
            >
              Choose a file from the
              Explorer to start editing.
            </p>

            <div
              className="
                flex
                items-center
                gap-2
                mt-5
                text-[10px]
                text-gray-700
              "
            >
              <Search size={11} />

              <span>
                Your code will appear here
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
          EDITOR STATUS BAR
          ================================================================ */}
      {activeFile && (
        <div
          className="
            min-h-6
            shrink-0
            flex
            items-center
            justify-between
            gap-3
            px-2
            sm:px-3
            bg-blue-950/30
            border-t
            border-gray-800
            text-[10px]
            text-gray-500
          "
        >
          <div
            className="
              flex
              items-center
              gap-2
              sm:gap-3
              min-w-0
            "
          >
            <span className="truncate">
              {language}
            </span>

            <span className="hidden sm:inline">
              Spaces: 2
            </span>

            <span className="hidden sm:inline">
              UTF-8
            </span>

            <span className="hidden md:inline">
              LF
            </span>
          </div>

          <div
            className="
              flex
              items-center
              gap-2
              sm:gap-3
              shrink-0
            "
          >
            <span
              className={`
                flex
                items-center
                gap-1
                ${statusClass}
              `}
            >
              {statusIcon}

              <span className="hidden sm:inline">
                {statusLabel}
              </span>
            </span>

            <span className="hidden sm:inline">
              {fileSize}
            </span>

            <span>
              {lineCount.toLocaleString()}
              {' '}
              lines
            </span>

            <span className="hidden sm:inline text-gray-700">
              EDITOR X
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;