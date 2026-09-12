import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import {
  ArrowDown,
  ChevronDown,
  StopCircle as CircleStop,
  Copy,
  Eraser,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from 'lucide-react';

import { useStore } from '../store/useStore';
import {
  analyzeSmartPaste,
  canCommitSmartPaste,
  commitSmartPasteProject,
  findSmartPasteConflicts,
  formatSmartPasteSummary,
  getSmartPastePreview,
  isSmartPasteProject,
  type SmartPasteAnalysis,
} from '../webcontainer/fileOperations';
import {
  clearTerminal as clearManagedTerminal,
  getProcess,
  interruptProcess,
  killProcess,
  runTerminalProcess,
  setTerminalInstance,
  writeToProcess,
} from '../webcontainer/terminalManager';

const INTERACTIVE_SHELL_ID =
  'editor-x-interactive-shell';

const TERMINAL_SCROLLBACK = 10000;

const TERMINAL_FONT_SIZE = 14;

const TERMINAL_FONT_FAMILY =
  '"Cascadia Code", Menlo, Monaco, "Courier New", monospace';

const SHELL_STARTUP_TIMEOUT = 15000;

type ShellStatus =
  | 'starting'
  | 'ready'
  | 'stopped'
  | 'error';

interface TerminalNotice {
  type: 'info' | 'success' | 'error';
  message: string;
}

interface TerminalStats {
  startedAt: number | null;
  commandsSent: number;
  bytesWritten: number;
}

interface PendingWrite {
  data: string;
}

const wait = (
  milliseconds: number,
): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds,
    );
  });

const isModifierOnlyInput = (
  data: string,
): boolean =>
  data === '\u0000' ||
  data === '\u001b' ||
  data === '\u001b[O' ||
  data === '\u001b[Z';

export const Terminal: React.FC = () => {
  const terminalRef =
    useRef<HTMLDivElement>(null);

  const xtermRef =
    useRef<XTerm | null>(null);

  const fitAddonRef =
    useRef<FitAddon | null>(null);

  const shellReadyRef =
    useRef<Promise<void> | null>(null);

  const shellProcessIdRef =
    useRef<string | null>(null);

  const pendingInputRef =
    useRef<PendingWrite[]>([]);

  /*
   * WebContainer's process.input is a WritableStream. Only one writer may
   * own that stream at a time, so every keyboard event must be serialized.
   * Without this queue, fast typing causes overlapping getWriter()/write()
   * calls; later keystrokes can fail and the shell can be restarted while
   * the user is still typing.
   */
  const inputWriteChainRef =
    useRef<Promise<void>>(Promise.resolve());

  const disposedRef =
    useRef(false);

  const shellStartGenerationRef =
    useRef(0);

  const resizeFrameRef =
    useRef<number | null>(null);

  const noticeTimeoutRef =
    useRef<number | null>(null);

  const lastInputTimeRef =
    useRef(0);

  const { clearTerminal } =
    useStore();

  const [shellStatus, setShellStatus] =
    useState<ShellStatus>('starting');

  const [showScrollButton, setShowScrollButton] =
    useState(false);

  const [isRestarting, setIsRestarting] =
    useState(false);

  const [isMaximized, setIsMaximized] =
    useState(false);

  const [notice, setNotice] =
    useState<TerminalNotice | null>(null);

  const [smartPasteAnalysis, setSmartPasteAnalysis] =
    useState<SmartPasteAnalysis | null>(null);

  const [smartPasteConflicts, setSmartPasteConflicts] =
    useState<string[]>([]);

  const [smartPasteOverwrite, setSmartPasteOverwrite] =
    useState(false);

  const [isSmartPasteBusy, setIsSmartPasteBusy] =
    useState(false);

  const [stats, setStats] =
    useState<TerminalStats>({
      startedAt: null,
      commandsSent: 0,
      bytesWritten: 0,
    });

  const showNotice = useCallback(
    (
      type: TerminalNotice['type'],
      message: string,
    ) => {
      setNotice({
        type,
        message,
      });

      if (
        noticeTimeoutRef.current !== null
      ) {
        window.clearTimeout(
          noticeTimeoutRef.current,
        );
      }

      noticeTimeoutRef.current =
        window.setTimeout(() => {
          setNotice(null);
          noticeTimeoutRef.current =
            null;
        }, 3500);
    },
    [],
  );

  const fitTerminal = useCallback(() => {
    const fitAddon =
      fitAddonRef.current;

    if (!fitAddon) {
      return;
    }

    try {
      fitAddon.fit();
    } catch {
      /*
       * xterm can briefly reject fitting while the
       * container is being mounted or resized.
       */
    }
  }, []);

  const writeRaw = useCallback(
    (data: string) => {
      xtermRef.current?.write(data);
    },
    [],
  );

  const writeLine = useCallback(
    (data: string) => {
      xtermRef.current?.writeln(data);
    },
    [],
  );

  const printInfo = useCallback(
    (message: string) => {
      writeLine(
        `\r\n\x1b[38;5;75mℹ ${message}\x1b[0m`,
      );
    },
    [writeLine],
  );

  const printSuccess = useCallback(
    (message: string) => {
      writeLine(
        `\r\n\x1b[1;32m✔ ${message}\x1b[0m`,
      );
    },
    [writeLine],
  );

  const printError = useCallback(
    (message: string) => {
      writeLine(
        `\r\n\x1b[1;31m✖ ${message}\x1b[0m`,
      );
    },
    [writeLine],
  );

  const updateStatsForInput =
    useCallback((data: string) => {
      if (isModifierOnlyInput(data)) {
        return;
      }

      const bytes =
        new TextEncoder().encode(
          data,
        ).byteLength;

      setStats((previous) => ({
        ...previous,
        commandsSent:
          previous.commandsSent +
          (data.includes('\r') ||
          data.includes('\n')
            ? 1
            : 0),
        bytesWritten:
          previous.bytesWritten +
          bytes,
      }));

      lastInputTimeRef.current =
        Date.now();
    }, []);

  const flushPendingInput =
    useCallback(
      async (
        processId: string,
      ): Promise<void> => {
        const pending =
          pendingInputRef.current.splice(
            0,
          );

        if (pending.length === 0) {
          return;
        }

        for (
          const item of pending
        ) {
          const success =
            await writeToProcess(
              processId,
              item.data,
            );

          if (!success) {
            pendingInputRef.current.unshift(
              item,
            );

            break;
          }

          updateStatsForInput(
            item.data,
          );
        }
      },
      [updateStatsForInput],
    );

  const waitForShellProcess =
    useCallback(
      async (): Promise<string | null> => {
        const startedAt =
          Date.now();

        while (
          !disposedRef.current &&
          Date.now() - startedAt <
            SHELL_STARTUP_TIMEOUT
        ) {
          const processId =
            shellProcessIdRef.current;

          if (
            processId &&
            getProcess(processId)
          ) {
            return processId;
          }

          await wait(50);
        }

        return null;
      },
      [],
    );

  const startShell =
    useCallback(
      async (): Promise<void> => {
        if (
          disposedRef.current
        ) {
          return;
        }

        if (
          shellProcessIdRef.current
        ) {
          const existing =
            getProcess(
              shellProcessIdRef.current,
            );

          if (existing) {
            setShellStatus('ready');
            return;
          }

          shellProcessIdRef.current =
            null;
        }

        if (shellReadyRef.current) {
          await shellReadyRef.current;
          return;
        }

        const generation =
          shellStartGenerationRef.current +
          1;

        shellStartGenerationRef.current =
          generation;

        setShellStatus('starting');

        const startup =
          runTerminalProcess(
            'jsh',
            [],
            {
              id: INTERACTIVE_SHELL_ID,

              writeOutputToTerminal:
                true,

              onExit: (
                exitCode,
              ) => {
                if (
                  disposedRef.current
                ) {
                  return;
                }

                if (
                  generation !==
                  shellStartGenerationRef.current
                ) {
                  return;
                }

                if (
                  shellProcessIdRef.current ===
                  INTERACTIVE_SHELL_ID
                ) {
                  shellProcessIdRef.current =
                    null;
                }

                setShellStatus(
                  exitCode === 0
                    ? 'stopped'
                    : 'error',
                );
              },
            },
          )
            .then(
              async (result) => {
                if (
                  disposedRef.current ||
                  generation !==
                    shellStartGenerationRef.current
                ) {
                  killProcess(
                    result.id,
                  );

                  return;
                }

                shellProcessIdRef.current =
                  result.id;

                setShellStatus(
                  'ready',
                );

                setStats(
                  (previous) => ({
                    ...previous,
                    startedAt:
                      previous.startedAt ??
                      Date.now(),
                  }),
                );

                await flushPendingInput(
                  result.id,
                );
              },
            )
            .catch((error) => {
              if (
                disposedRef.current
              ) {
                return;
              }

              shellProcessIdRef.current =
                null;

              setShellStatus(
                'error',
              );

              const message =
                error instanceof Error
                  ? error.message
                  : String(error);

              printError(
                `Terminal startup failed: ${message}`,
              );
            });

        shellReadyRef.current =
          startup;

        try {
          await startup;
        } finally {
          if (
            shellReadyRef.current ===
            startup
          ) {
            shellReadyRef.current =
              null;
          }
        }
      },
      [flushPendingInput, printError],
    );

  const sendInput =
    useCallback(
      (data: string): Promise<void> => {
        if (
          disposedRef.current ||
          !data
        ) {
          return Promise.resolve();
        }

        /*
         * IMPORTANT: do not start an independent async write for every
         * xterm onData event. Typing one command produces many events, and
         * paste can produce a very large event. A single promise chain keeps
         * process.input strictly ordered and prevents WritableStream writer
         * collisions.
         */
        const queuedWrite =
          inputWriteChainRef.current.then(
            async () => {
              if (
                disposedRef.current ||
                !data
              ) {
                return;
              }

              const processId =
                shellProcessIdRef.current;

              if (!processId) {
                pendingInputRef.current.push({
                  data,
                });

                void startShell();

                return;
              }

              const process =
                getProcess(processId);

              if (!process) {
                shellProcessIdRef.current =
                  null;

                pendingInputRef.current.push({
                  data,
                });

                setShellStatus(
                  'starting',
                );

                void startShell();

                return;
              }

              const success =
                await writeToProcess(
                  processId,
                  data,
                );

              if (!success) {
                pendingInputRef.current.push({
                  data,
                });

                shellProcessIdRef.current =
                  null;

                setShellStatus(
                  'starting',
                );

                void startShell();

                return;
              }

              updateStatsForInput(data);
            },
          );

        /*
         * Keep the chain alive even if a future write unexpectedly throws.
         * The individual sendInput call still exposes the original promise
         * to its caller, while later keyboard input is never permanently
         * blocked by one failed event.
         */
        inputWriteChainRef.current =
          queuedWrite.catch(() => undefined);

        return queuedWrite;
      },
      [
        startShell,
        updateStatsForInput,
      ],
    );

  const closeSmartPastePreview =
    useCallback(() => {
      if (isSmartPasteBusy) {
        return;
      }

      setSmartPasteAnalysis(null);
      setSmartPasteConflicts([]);
      setSmartPasteOverwrite(false);
    }, [isSmartPasteBusy]);

  const prepareSmartPastePreview =
    useCallback(
      async (source: string): Promise<void> => {
        const analysis = analyzeSmartPaste(source);

        if (!analysis.isProjectPayload) {
          const error = analysis.issues.find(
            (issue) => issue.severity === 'error',
          );

          if (error) {
            printError(error.message);
          }

          return;
        }

        if (!canCommitSmartPaste(analysis)) {
          printError(
            'Smart Paste contains validation errors and cannot be committed.',
          );
          return;
        }

        setIsSmartPasteBusy(true);

        try {
          const conflicts =
            await findSmartPasteConflicts(
              analysis,
              '/',
            );

          if (disposedRef.current) {
            return;
          }

          setSmartPasteAnalysis(analysis);
          setSmartPasteConflicts(conflicts);
          setSmartPasteOverwrite(false);

          printInfo(
            `${formatSmartPasteSummary(analysis)}. Review before creating files.`,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          printError(
            `Smart Paste preview failed: ${message}`,
          );
        } finally {
          setIsSmartPasteBusy(false);
        }
      },
      [printError, printInfo],
    );

  const handleSmartPasteCommit =
    useCallback(async (): Promise<void> => {
      const analysis = smartPasteAnalysis;

      if (!analysis || isSmartPasteBusy) {
        return;
      }

      if (!canCommitSmartPaste(analysis)) {
        printError(
          'Smart Paste cannot be committed because validation errors remain.',
        );
        return;
      }

      setIsSmartPasteBusy(true);

      try {
        const latestConflicts =
          await findSmartPasteConflicts(
            analysis,
            '/',
          );

        if (latestConflicts.length > 0 && !smartPasteOverwrite) {
          setSmartPasteConflicts(latestConflicts);
          printInfo(
            `${latestConflicts.length} existing file${latestConflicts.length === 1 ? '' : 's'} will be skipped. Enable overwrite if you want to replace them.`,
          );
        }

        const previewFiles = getSmartPastePreview(analysis);

        if (previewFiles.length === 0) {
          printError(
            'Smart Paste preview contains no files.',
          );
          return;
        }

        const result =
          await commitSmartPasteProject(
            analysis,
            {
              targetPath: '/',
              overwrite: smartPasteOverwrite,
              continueOnError: false,
              showProgress: false,
              onFileWritten: (file, index, total) => {
                if (
                  index === 0 ||
                  index === total - 1 ||
                  (index + 1) % 25 === 0
                ) {
                  writeRaw(
                    `\r\n\x1b[38;5;75m[EDITOR X] Smart Paste ${index + 1}/${total}: ${file.path}\x1b[0m`,
                  );
                }
              },
            },
          );

        if (disposedRef.current) {
          return;
        }

        setSmartPasteAnalysis(null);
        setSmartPasteConflicts([]);
        setSmartPasteOverwrite(false);

        if (result.failedFiles.length > 0) {
          printError(
            `Smart Paste finished with ${result.failedFiles.length} failed file${result.failedFiles.length === 1 ? '' : 's'}.`,
          );
        } else {
          printSuccess(
            `Smart Paste created ${result.filesCreated} file${result.filesCreated === 1 ? '' : 's'} and ${result.directoriesCreated} director${result.directoriesCreated === 1 ? 'y' : 'ies'} (${result.bytesWritten.toLocaleString()} bytes).`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        printError(
          `Smart Paste commit failed: ${message}`,
        );
      } finally {
        setIsSmartPasteBusy(false);
      }
    }, [
      isSmartPasteBusy,
      printError,
      printInfo,
      printSuccess,
      smartPasteAnalysis,
      smartPasteOverwrite,
      writeRaw,
    ]);

  const processPastedText =
    useCallback(
      async (text: string): Promise<void> => {
        if (
          disposedRef.current ||
          !text ||
          isSmartPasteBusy
        ) {
          return;
        }

        if (isSmartPasteProject(text)) {
          await prepareSmartPastePreview(text);
          return;
        }

        /*
         * Ordinary text/code is real terminal input. Forward it directly
         * to the persistent shell so multiline and large pastes are not
         * dependent on xterm's internal clipboard implementation.
         */
        await sendInput(text);
      },
      [
        isSmartPasteBusy,
        prepareSmartPastePreview,
        sendInput,
      ],
    );

  const handleTerminalPaste =
    useCallback(
      async (event: ClipboardEvent): Promise<void> => {
        if (disposedRef.current) {
          return;
        }

        const text =
          event.clipboardData?.getData('text/plain') ?? '';

        if (!text) {
          return;
        }

        /*
         * Own the browser paste event. xterm's default clipboard bridge is
         * not reliable enough inside the WebContainer terminal, so the
         * pasted text is explicitly forwarded to the shell.
         */
        event.preventDefault();
        event.stopPropagation();

        await processPastedText(text);
      },
      [processPastedText],
    );

  const handleKeyboardPaste =
    useCallback(async (): Promise<void> => {
      if (
        disposedRef.current ||
        isSmartPasteBusy
      ) {
        return;
      }

      try {
        const text =
          await navigator.clipboard.readText();

        if (!text) {
          return;
        }

        await processPastedText(text);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        printError(
          `Unable to read clipboard: ${message}`,
        );
      }
    }, [
      isSmartPasteBusy,
      printError,
      processPastedText,
    ]);

  const handleClear =
    useCallback(() => {
      const terminal =
        xtermRef.current;

      if (!terminal) {
        return;
      }

      terminal.clear();

      clearManagedTerminal();

      clearTerminal();

      showNotice(
        'success',
        'Terminal output cleared.',
      );
    }, [
      clearTerminal,
      showNotice,
    ]);

  const handleReset =
    useCallback(() => {
      const terminal =
        xtermRef.current;

      if (!terminal) {
        return;
      }

      terminal.reset();

      clearManagedTerminal();

      showNotice(
        'info',
        'Terminal display reset.',
      );
    }, [showNotice]);

  const handleInterrupt =
    useCallback(async () => {
      const processId =
        shellProcessIdRef.current;

      if (!processId) {
        printInfo(
          'No active shell process.',
        );

        return;
      }

      const success =
        await interruptProcess(
          processId,
        );

      if (!success) {
        printError(
          'Unable to send Ctrl+C to the shell.',
        );

        return;
      }

      showNotice(
        'info',
        'Interrupt signal sent.',
      );
    }, [
      printError,
      printInfo,
      showNotice,
    ]);

  const handleRestart =
    useCallback(async () => {
      if (isRestarting) {
        return;
      }

      setIsRestarting(true);

      shellStartGenerationRef.current +=
        1;

      const currentProcessId =
        shellProcessIdRef.current;

      shellProcessIdRef.current =
        null;

      shellReadyRef.current =
        null;

      if (currentProcessId) {
        killProcess(
          currentProcessId,
        );
      }

      setShellStatus(
        'starting',
      );

      const terminal =
        xtermRef.current;

      terminal?.writeln(
        '\r\n\x1b[1;36m────────────────────────────────────────\x1b[0m',
      );

      terminal?.writeln(
        '\x1b[1;36m  Restarting EDITOR X shell...\x1b[0m',
      );

      terminal?.writeln(
        '\x1b[1;36m────────────────────────────────────────\x1b[0m',
      );

      try {
        await wait(100);

        if (
          !disposedRef.current
        ) {
          await startShell();

          const processId =
            await waitForShellProcess();

          if (processId) {
            printSuccess(
              'Interactive shell ready.',
            );
          } else {
            printError(
              'Shell did not become ready in time.',
            );
          }
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        printError(
          `Shell restart failed: ${message}`,
        );
      } finally {
        setIsRestarting(false);
      }
    }, [
      isRestarting,
      printError,
      printSuccess,
      startShell,
      waitForShellProcess,
    ]);

  const handleScrollToBottom =
    useCallback(() => {
      const terminal =
        xtermRef.current;

      if (!terminal) {
        return;
      }

      terminal.scrollToBottom();

      setShowScrollButton(
        false,
      );
    }, []);

  const handleFocus =
    useCallback(() => {
      xtermRef.current?.focus();
    }, []);

  const handleCopySelection =
    useCallback(async () => {
      const terminal =
        xtermRef.current;

      if (!terminal) {
        return;
      }

      const selection =
        terminal.getSelection();

      if (!selection) {
        showNotice(
          'info',
          'Select terminal text first.',
        );

        return;
      }

      try {
        await navigator.clipboard.writeText(
          selection,
        );

        showNotice(
          'success',
          'Terminal selection copied.',
        );
      } catch {
        showNotice(
          'error',
          'Clipboard access was blocked by the browser.',
        );
      }
    }, [showNotice]);

  const handleToggleMaximize =
    useCallback(() => {
      setIsMaximized(
        (previous) => !previous,
      );

      window.setTimeout(
        fitTerminal,
        50,
      );
    }, [fitTerminal]);

  const getStatusLabel =
    (): string => {
      switch (shellStatus) {
        case 'starting':
          return 'STARTING';

        case 'ready':
          return 'READY';

        case 'stopped':
          return 'STOPPED';

        case 'error':
          return 'ERROR';

        default:
          return 'UNKNOWN';
      }
    };

  const getStatusClass =
    (): string => {
      switch (shellStatus) {
        case 'starting':
          return 'text-yellow-400';

        case 'ready':
          return 'text-emerald-400';

        case 'stopped':
          return 'text-gray-500';

        case 'error':
          return 'text-red-400';

        default:
          return 'text-gray-500';
      }
    };

  useEffect(() => {
    if (
      !terminalRef.current ||
      xtermRef.current
    ) {
      return;
    }

    disposedRef.current = false;

    const xterm =
      new XTerm({
        cursorBlink: true,

        cursorStyle: 'block',

        fontSize:
          TERMINAL_FONT_SIZE,

        fontFamily:
          TERMINAL_FONT_FAMILY,

        theme: {
          background: '#0a0a0a',
          foreground: '#d4d4d4',
          cursor: '#00ff00',
          cursorAccent: '#000000',
          selectionBackground:
            '#3a3d41',

          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',

          brightBlack:
            '#666666',
          brightRed:
            '#f14c4c',
          brightGreen:
            '#23d18b',
          brightYellow:
            '#f5f543',
          brightBlue:
            '#3b8eea',
          brightMagenta:
            '#d670d6',
          brightCyan:
            '#29b8db',
          brightWhite:
            '#ffffff',
        },

        scrollback:
          TERMINAL_SCROLLBACK,

        convertEol: true,

        allowProposedApi: true,

        rightClickSelectsWord: true,

        scrollOnUserInput: true,

        fastScrollModifier: 'alt',

        fastScrollSensitivity: 5,

        tabStopWidth: 4,
      });

    const fitAddon =
      new FitAddon();

    const webLinksAddon =
      new WebLinksAddon();

    xterm.loadAddon(
      fitAddon,
    );

    xterm.loadAddon(
      webLinksAddon,
    );

    xterm.open(
      terminalRef.current,
    );

    const pasteHandler = (event: ClipboardEvent) => {
      void handleTerminalPaste(event);
    };

    terminalRef.current.addEventListener(
      'paste',
      pasteHandler,
      true,
    );

    xtermRef.current =
      xterm;

    fitAddonRef.current =
      fitAddon;

    setTerminalInstance(
      xterm,
    );

    const initialFit =
      () => {
        fitTerminal();
      };

    requestAnimationFrame(
      () => {
        requestAnimationFrame(
          initialFit,
        );
      },
    );

    /*
     * Keyboard handling.
     *
     * The shell remains responsible for:
     * - command editing
     * - cursor movement
     * - shell history
     * - Ctrl+C
     * - Ctrl+D (explicitly forwarded so browser shortcuts cannot swallow EOF)
     * - tab completion
     * - interactive programs
     *
     * EDITOR X only transports the input.
     */
    const dataDisposable =
      xterm.onData((data) => {
        if (
          disposedRef.current
        ) {
          return;
        }

        void sendInput(data);
      });

    /*
     * Allow normal browser copy when a selection exists.
     *
     * Ctrl+C is deliberately left to xterm/shell when
     * there is no selection so it continues to interrupt
     * the running process.
     */
    const customKeyHandler =
      xterm.attachCustomKeyEventHandler(
        (event) => {
          if (
            event.type !== 'keydown'
          ) {
            return true;
          }

          const isCopy =
            (event.ctrlKey ||
              event.metaKey) &&
            event.key.toLowerCase() ===
              'c';

          if (
            isCopy &&
            xterm.hasSelection()
          ) {
            void handleCopySelection();

            return false;
          }

          const isPaste =
            (event.ctrlKey ||
              event.metaKey) &&
            event.key.toLowerCase() ===
              'v';

          if (isPaste) {
            event.preventDefault();
            void handleKeyboardPaste();

            return false;
          }

          const isEndOfInput =
            event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey &&
            event.key.toLowerCase() ===
              'd';

          if (isEndOfInput) {
            event.preventDefault();
            void sendInput('\u0004');

            return false;
          }

          if (
            event.key === 'F5'
          ) {
            event.preventDefault();

            void handleRestart();

            return false;
          }

          if (
            event.ctrlKey &&
            event.shiftKey &&
            event.key.toLowerCase() ===
              'l'
          ) {
            event.preventDefault();

            handleClear();

            return false;
          }

          if (
            event.ctrlKey &&
            event.shiftKey &&
            event.key.toLowerCase() ===
              'k'
          ) {
            event.preventDefault();

            void handleRestart();

            return false;
          }

          return true;
        },
      );

    void (async () => {
      xterm.writeln(
        '\x1b[1;36m╔══════════════════════════════════════════════╗\x1b[0m',
      );

      xterm.writeln(
        '\x1b[1;36m║              EDITOR X TERMINAL              ║\x1b[0m',
      );

      xterm.writeln(
        '\x1b[1;36m╚══════════════════════════════════════════════╝\x1b[0m',
      );

      xterm.writeln('');

      xterm.writeln(
        '\x1b[90mWebContainer persistent shell\x1b[0m',
      );

      xterm.writeln(
        '\x1b[90m10,000-line scrollback · Interactive jsh\x1b[0m',
      );

      xterm.writeln('');

      await startShell();
    })();

    let scrollTimeout:
      ReturnType<
        typeof setTimeout
      > | null = null;

    const scrollDisposable =
      xterm.onScroll(() => {
        if (
          scrollTimeout !== null
        ) {
          clearTimeout(
            scrollTimeout,
          );
        }

        scrollTimeout =
          setTimeout(() => {
            try {
              const buffer =
                xterm.buffer.active;

              const isAtBottom =
                buffer.viewportY >=
                buffer.baseY;

              setShowScrollButton(
                !isAtBottom,
              );
            } catch {
              /*
               * Ignore transient xterm buffer
               * state while disposing/resizing.
               */
            }
          }, 100);
      });

    const resizeObserver =
      new ResizeObserver(() => {
        if (
          resizeFrameRef.current !==
          null
        ) {
          cancelAnimationFrame(
            resizeFrameRef.current,
          );
        }

        resizeFrameRef.current =
          requestAnimationFrame(() => {
            resizeFrameRef.current =
              null;

            fitTerminal();
          });
      });

    resizeObserver.observe(
      terminalRef.current,
    );

    return () => {
      disposedRef.current = true;

      shellStartGenerationRef.current +=
        1;

      dataDisposable.dispose();

      terminalRef.current?.removeEventListener(
        'paste',
        pasteHandler,
        true,
      );

      scrollDisposable.dispose();

      resizeObserver.disconnect();

      if (
        scrollTimeout !== null
      ) {
        clearTimeout(
          scrollTimeout,
        );
      }

      if (
        resizeFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          resizeFrameRef.current,
        );

        resizeFrameRef.current =
          null;
      }

      if (
        noticeTimeoutRef.current !==
        null
      ) {
        window.clearTimeout(
          noticeTimeoutRef.current,
        );

        noticeTimeoutRef.current =
          null;
      }

      const processId =
        shellProcessIdRef.current;

      if (processId) {
        killProcess(
          processId,
        );
      }

      shellProcessIdRef.current =
        null;

      shellReadyRef.current =
        null;

      pendingInputRef.current =
        [];

      inputWriteChainRef.current =
        Promise.resolve();

      setTerminalInstance(
        xterm,
      );

      xterm.dispose();

      xtermRef.current =
        null;

      fitAddonRef.current =
        null;
    };
  }, [
    fitTerminal,
    handleClear,
    handleCopySelection,
    handleKeyboardPaste,
    handleRestart,
    handleTerminalPaste,
    sendInput,
    startShell,
  ]);

  useEffect(() => {
    return () => {
      if (
        noticeTimeoutRef.current !==
        null
      ) {
        window.clearTimeout(
          noticeTimeoutRef.current,
        );
      }
    };
  }, []);

  return (
    <div
      className={`
        relative flex h-full min-h-0 flex-col bg-black
        ${
          isMaximized
            ? 'fixed inset-0 z-[80]'
            : ''
        }
      `}
    >
      {/* ================================================================ */}
      {/* Terminal Toolbar                                                 */}
      {/* ================================================================ */}

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900 px-2 sm:px-3">
        {/* Left */}
        <div className="flex min-w-0 items-center gap-2">
          <TerminalIcon
            size={15}
            className="shrink-0 text-green-400"
            aria-hidden="true"
          />

          <span className="text-xs font-semibold tracking-wide text-gray-300">
            TERMINAL
          </span>

          <span className="hidden text-[10px] text-gray-600 sm:inline">
            /
          </span>

          <span className="hidden truncate text-[10px] text-gray-600 sm:inline">
            WebContainer
          </span>

          <span
            className={`ml-1 flex items-center gap-1.5 text-[10px] ${getStatusClass()}`}
            title={`Shell status: ${getStatusLabel()}`}
          >
            <span
              className={`
                h-1.5 w-1.5 rounded-full
                ${
                  shellStatus ===
                  'starting'
                    ? 'animate-pulse bg-yellow-400'
                    : shellStatus ===
                        'ready'
                      ? 'bg-emerald-400'
                      : shellStatus ===
                          'error'
                        ? 'bg-red-400'
                        : 'bg-gray-600'
                }
              `}
            />

            <span>
              {getStatusLabel()}
            </span>
          </span>
        </div>

        {/* Right */}
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Interrupt */}
          <button
            type="button"
            onClick={() => {
              void handleInterrupt();
            }}
            disabled={
              shellStatus !==
              'ready'
            }
            className="
              rounded p-1.5
              text-gray-500
              transition-colors
              hover:bg-gray-800
              hover:text-red-400
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
            title="Interrupt running process (Ctrl+C)"
            aria-label="Interrupt running process"
          >
            <CircleStop
              size={14}
            />
          </button>

          {/* Restart */}
          <button
            type="button"
            onClick={() => {
              void handleRestart();
            }}
            disabled={
              isRestarting
            }
            className="
              rounded p-1.5
              text-gray-500
              transition-colors
              hover:bg-gray-800
              hover:text-gray-200
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
            title="Restart shell (F5)"
            aria-label="Restart shell"
          >
            <RefreshCw
              size={14}
              className={
                isRestarting
                  ? 'animate-spin'
                  : ''
              }
            />
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={() => {
              void handleCopySelection();
            }}
            className="
              hidden rounded p-1.5
              text-gray-500
              transition-colors
              hover:bg-gray-800
              hover:text-gray-200
              sm:block
            "
            title="Copy selected terminal text"
            aria-label="Copy selected terminal text"
          >
            <Copy size={14} />
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="
              rounded p-1.5
              text-gray-500
              transition-colors
              hover:bg-gray-800
              hover:text-gray-200
            "
            title="Clear terminal (Ctrl+Shift+L)"
            aria-label="Clear terminal"
          >
            <Trash2
              size={14}
            />
          </button>

          {/* Reset */}
          <button
            type="button"
            onClick={handleReset}
            className="
              hidden rounded p-1.5
              text-gray-500
              transition-colors
              hover:bg-gray-800
              hover:text-gray-200
              sm:block
            "
            title="Reset terminal display"
            aria-label="Reset terminal display"
          >
            <Eraser
              size={14}
            />
          </button>

          {/* Maximize */}
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="
              hidden rounded p-1.5
              text-gray-500
              transition-colors
              hover:bg-gray-800
              hover:text-gray-200
              md:block
            "
            title={
              isMaximized
                ? 'Restore terminal'
                : 'Maximize terminal'
            }
            aria-label={
              isMaximized
                ? 'Restore terminal'
                : 'Maximize terminal'
            }
          >
            {isMaximized ? (
              <Minimize2
                size={14}
              />
            ) : (
              <Maximize2
                size={14}
              />
            )}
          </button>

          {/* Focus */}
          <button
            type="button"
            onClick={handleFocus}
            className="
              rounded p-1.5
              text-gray-500
              transition-colors
              hover:bg-gray-800
              hover:text-gray-200
            "
            title="Focus terminal"
            aria-label="Focus terminal"
          >
            <Play
              size={13}
            />
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Terminal Output                                                   */}
      {/* ================================================================ */}

      <div
        ref={terminalRef}
        className="
          min-h-0
          flex-1
          overflow-hidden
          p-3
        "
        style={{
          backgroundColor:
            '#0a0a0a',
        }}
        onClick={handleFocus}
      />

      {/* ================================================================ */}
      {/* Runtime Statistics                                                */}
      {/* ================================================================ */}

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-gray-900 bg-gray-950 px-3 text-[10px] text-gray-700">
        <div className="flex items-center gap-3">
          <span>
            Scrollback: 10k
          </span>

          <span className="hidden sm:inline">
            Input: {stats.commandsSent}{' '}
            commands
          </span>

          <span className="hidden md:inline">
            {stats.bytesWritten.toLocaleString()}{' '}
            bytes
          </span>
        </div>

        <span className="hidden sm:inline">
          F5 restart · Ctrl+C interrupt
        </span>
      </div>

      {/* ================================================================ */}
      {/* Scroll To Bottom                                                  */}
      {/* ================================================================ */}

      {showScrollButton && (
        <button
          type="button"
          onClick={
            handleScrollToBottom
          }
          className="
            absolute
            bottom-10
            right-5
            flex
            h-9
            w-9
            items-center
            justify-center
            rounded-full
            border
            border-gray-700
            bg-gray-900
            text-gray-300
            shadow-xl
            transition-all
            hover:scale-105
            hover:border-blue-500/50
            hover:bg-gray-800
            hover:text-white
          "
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
        >
          <ArrowDown
            size={17}
          />
        </button>
      )}

      {/* ================================================================ */}
      {/* Smart Paste Preview                                               */}
      {/* ================================================================ */}

      {smartPasteAnalysis && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-3 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-paste-title"
        >
          <div className="flex max-h-[90%] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-950 shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
              <div className="min-w-0">
                <h2
                  id="smart-paste-title"
                  className="text-sm font-semibold text-gray-200"
                >
                  Smart Paste Preview
                </h2>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  Review the detected project before EDITOR X writes anything.
                </p>
              </div>

              <button
                type="button"
                onClick={closeSmartPastePreview}
                disabled={isSmartPasteBusy}
                className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
                aria-label="Close Smart Paste preview"
              >
                <X size={15} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border border-gray-800 bg-gray-900/70 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-600">Files</div>
                  <div className="mt-1 text-sm font-semibold text-gray-200">{smartPasteAnalysis.totalFiles.toLocaleString()}</div>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-900/70 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-600">Folders</div>
                  <div className="mt-1 text-sm font-semibold text-gray-200">{smartPasteAnalysis.totalDirectories.toLocaleString()}</div>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-900/70 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-600">Lines</div>
                  <div className="mt-1 text-sm font-semibold text-gray-200">{smartPasteAnalysis.totalLines.toLocaleString()}</div>
                </div>
                <div className="rounded-md border border-gray-800 bg-gray-900/70 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-600">Size</div>
                  <div className="mt-1 text-sm font-semibold text-gray-200">{smartPasteAnalysis.totalBytes.toLocaleString()} B</div>
                </div>
              </div>

              <div className="mt-3 rounded-md border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs text-gray-400">
                Detected format: <span className="font-medium text-gray-200">{smartPasteAnalysis.format}</span> · Confidence: <span className="font-medium text-gray-200">{Math.round(smartPasteAnalysis.confidence * 100)}%</span>
              </div>

              {smartPasteConflicts.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/20 p-3">
                  <div className="text-xs font-semibold text-amber-300">
                    {smartPasteConflicts.length} existing path{smartPasteConflicts.length === 1 ? '' : 's'} detected
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-amber-200/70">
                    Overwrite is off by default. Existing files will be skipped unless you explicitly enable overwrite.
                  </p>
                  <div className="mt-2 max-h-28 overflow-y-auto rounded border border-amber-900/40 bg-black/20 px-2 py-1.5 font-mono text-[10px] text-amber-100/70">
                    {smartPasteConflicts.slice(0, 50).map((path) => (
                      <div key={path} className="truncate py-0.5">{path}</div>
                    ))}
                    {smartPasteConflicts.length > 50 && (
                      <div className="pt-1 text-amber-300/60">+ {smartPasteConflicts.length - 50} more</div>
                    )}
                  </div>
                </div>
              )}

              {smartPasteAnalysis.issues.length > 0 && (
                <div className="mt-3 rounded-md border border-gray-800 bg-gray-900/50 p-3">
                  <div className="text-xs font-semibold text-gray-300">Validation notes</div>
                  <div className="mt-2 space-y-1">
                    {smartPasteAnalysis.issues.slice(0, 20).map((issue, index) => (
                      <div key={`${issue.path ?? 'issue'}-${index}`} className={`text-[10px] ${issue.severity === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                        {issue.severity === 'error' ? '✖' : '•'} {issue.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 overflow-hidden rounded-md border border-gray-800">
                <div className="border-b border-gray-800 bg-gray-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Files to create
                </div>
                <div className="max-h-64 overflow-y-auto bg-black/20 px-3 py-2 font-mono text-[10px] text-gray-400">
                  {getSmartPastePreview(smartPasteAnalysis).slice(0, 200).map((file) => (
                    <div key={file.path} className="flex items-center justify-between gap-3 py-1">
                      <span className="min-w-0 truncate">{file.path}</span>
                      <span className="shrink-0 text-gray-700">{file.lineCount}L · {file.bytes}B</span>
                    </div>
                  ))}
                  {smartPasteAnalysis.totalFiles > 200 && (
                    <div className="pt-2 text-gray-600">+ {smartPasteAnalysis.totalFiles - 200} more files</div>
                  )}
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-gray-800 bg-gray-900/40 p-3">
                <input
                  type="checkbox"
                  checked={smartPasteOverwrite}
                  onChange={(event) => setSmartPasteOverwrite(event.target.checked)}
                  disabled={isSmartPasteBusy}
                  className="mt-0.5 accent-blue-500"
                />
                <span>
                  <span className="block text-xs font-medium text-gray-300">Allow overwrite</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-gray-600">Replace existing files with the pasted versions.</span>
                </span>
              </label>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-gray-800 bg-gray-900/70 px-4 py-3">
              <span className="hidden text-[10px] text-gray-600 sm:block">No shell commands are executed by Smart Paste.</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeSmartPastePreview}
                  disabled={isSmartPasteBusy}
                  className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSmartPasteCommit(); }}
                  disabled={isSmartPasteBusy || !canCommitSmartPaste(smartPasteAnalysis)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSmartPasteBusy ? 'Creating…' : smartPasteOverwrite ? 'Create & Overwrite' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Terminal Notice                                                   */}
      {/* ================================================================ */}

      {notice && (
        <div
          className="
            absolute
            right-3
            top-11
            z-20
            max-w-xs
            rounded-md
            border
            border-gray-700
            bg-gray-900
            px-3
            py-2
            text-xs
            text-gray-300
            shadow-2xl
          "
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span
              className={`
                h-1.5
                w-1.5
                shrink-0
                rounded-full
                ${
                  notice.type ===
                  'success'
                    ? 'bg-emerald-400'
                    : notice.type ===
                        'error'
                      ? 'bg-red-400'
                      : 'bg-blue-400'
                }
              `}
            />

            <span>
              {notice.message}
            </span>

            <button
              type="button"
              onClick={() =>
                setNotice(null)
              }
              className="
                ml-1
                shrink-0
                rounded
                p-0.5
                text-gray-600
                hover:text-gray-300
              "
              aria-label="Dismiss terminal notice"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Maximized Exit Hint                                               */}
      {/* ================================================================ */}

      {isMaximized && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-md border border-gray-800 bg-gray-900/90 px-3 py-1.5 text-[10px] text-gray-500 shadow-xl">
          Click the maximize button again to restore
        </div>
      )}
    </div>
  );
};