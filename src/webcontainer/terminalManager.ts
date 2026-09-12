import { Terminal } from 'xterm';
import type { WebContainerProcess } from '@webcontainer/api';

import { getWebContainer } from './webcontainer';

export interface TerminalProcessOptions {
  id?: string;
  onOutput?: (data: string) => void;
  onExit?: (exitCode: number) => void;
  writeOutputToTerminal?: boolean;
}

export interface TerminalProcessInfo {
  id: string;
  running: boolean;
  command: string;
  args: string[];
}

export interface TerminalCommandResult {
  id: string;
  process: WebContainerProcess;
  exit: Promise<number>;
}

type ProcessRecord = {
  id: string;
  process: WebContainerProcess;
  command: string;
  args: string[];
  startedAt: number;
};

const managedProcesses = new Map<string, ProcessRecord>();

let terminalInstance: Terminal | null = null;

/**
 * Register the currently mounted XTerm instance.
 */
export function setTerminalInstance(terminal: Terminal): void {
  terminalInstance = terminal;
}

/**
 * Return the currently registered XTerm instance.
 */
export function getTerminalInstance(): Terminal | null {
  return terminalInstance;
}

/**
 * Write raw terminal data to the mounted XTerm instance.
 */
export function writeToTerminal(data: string): void {
  if (!terminalInstance || terminalInstance.element === undefined) {
    return;
  }

  try {
    terminalInstance.write(data);
  } catch {
    // The terminal may already be disposed during React unmount.
  }
}

/**
 * Write a complete line to the terminal.
 */
export function writeLineToTerminal(data: string): void {
  writeToTerminal(`${data}\r\n`);
}

/**
 * Clear the terminal viewport.
 */
export function clearTerminal(): void {
  if (!terminalInstance) {
    return;
  }

  try {
    terminalInstance.clear();
  } catch {
    // Ignore writes against a disposed terminal.
  }
}

/**
 * Reset the terminal state.
 */
export function resetTerminal(): void {
  if (!terminalInstance) {
    return;
  }

  try {
    terminalInstance.reset();
  } catch {
    // Ignore resets against a disposed terminal.
  }
}

/**
 * Register a WebContainer process under a stable identifier.
 *
 * If the identifier already exists, the previous process is killed
 * before the new process takes its place.
 */
export function registerProcess(
  process: WebContainerProcess,
  id?: string,
  command = '',
  args: string[] = [],
): string {
  const processId = id?.trim() || crypto.randomUUID();

  const existing = managedProcesses.get(processId);

  if (existing) {
    try {
      existing.process.kill();
    } catch {
      // Ignore failures while replacing an old process.
    }

    managedProcesses.delete(processId);
  }

  managedProcesses.set(processId, {
    id: processId,
    process,
    command,
    args: [...args],
    startedAt: Date.now(),
  });

  return processId;
}

/**
 * Return a managed process by id.
 */
export function getProcess(processId: string): WebContainerProcess | null {
  return managedProcesses.get(processId)?.process ?? null;
}

/**
 * Return metadata for a managed process.
 */
export function getProcessInfo(
  processId: string,
): TerminalProcessInfo | null {
  const record = managedProcesses.get(processId);

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    running: true,
    command: record.command,
    args: [...record.args],
  };
}

/**
 * Check whether a process is currently managed.
 */
export function hasProcess(processId: string): boolean {
  return managedProcesses.has(processId);
}

/**
 * Return all currently managed process ids.
 */
export function getProcessIds(): string[] {
  return Array.from(managedProcesses.keys());
}

/**
 * Return metadata for every currently managed process.
 */
export function getProcessInfoList(): TerminalProcessInfo[] {
  return Array.from(managedProcesses.values()).map((record) => ({
    id: record.id,
    running: true,
    command: record.command,
    args: [...record.args],
  }));
}

/**
 * Write input directly into a WebContainer process.
 *
 * This is used by the interactive terminal so commands, pasted
 * content, Ctrl+C, and other keyboard input all reach the same
 * persistent shell process.
 */
export async function writeToProcess(
  processId: string,
  data: string,
): Promise<boolean> {
  const record = managedProcesses.get(processId);

  if (!record) {
    return false;
  }

  try {
    const writer = record.process.input.getWriter();

    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Send Ctrl+C to a running process.
 */
export async function interruptProcess(
  processId: string,
): Promise<boolean> {
  return writeToProcess(processId, '\u0003');
}

/**
 * Send Ctrl+D to a running process.
 */
export async function sendEndOfInput(
  processId: string,
): Promise<boolean> {
  return writeToProcess(processId, '\u0004');
}

/**
 * Kill one managed process.
 */
export function killProcess(processId: string): boolean {
  const record = managedProcesses.get(processId);

  if (!record) {
    return false;
  }

  try {
    record.process.kill();
  } catch {
    // The process may already have exited.
  } finally {
    managedProcesses.delete(processId);
  }

  return true;
}

/**
 * Kill every managed process.
 */
export function killAllProcesses(): void {
  for (const [processId, record] of managedProcesses) {
    try {
      record.process.kill();
    } catch {
      // Continue cleaning up other processes.
    }

    managedProcesses.delete(processId);
  }
}

/**
 * Attach WebContainer stdout/stderr output to the terminal
 * and an optional caller callback.
 */
function attachProcessOutput(
  process: WebContainerProcess,
  options: TerminalProcessOptions,
): void {
  const shouldWriteOutput = options.writeOutputToTerminal !== false;

  process.output
    .pipeTo(
      new WritableStream<string>({
        write(data) {
          if (shouldWriteOutput) {
            writeToTerminal(data);
          }

          options.onOutput?.(data);
        },
      }),
    )
    .catch(() => {
      // Output streams can reject when a process exits or is killed.
    });
}

/**
 * Remove a process from the manager after it exits.
 */
function finalizeProcess(
  processId: string,
  exitCode: number,
  onExit?: (exitCode: number) => void,
): void {
  managedProcesses.delete(processId);

  try {
    onExit?.(exitCode);
  } catch {
    // A consumer callback must never break process cleanup.
  }
}

/**
 * Spawn and manage a WebContainer process.
 */
export async function runTerminalProcess(
  command: string,
  args: string[] = [],
  options: TerminalProcessOptions = {},
): Promise<TerminalCommandResult> {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
    throw new Error('Terminal command cannot be empty.');
  }

  const container = await getWebContainer();
  const normalizedArgs = [...args];

  const process = await container.spawn(trimmedCommand, normalizedArgs);

  const processId = registerProcess(
    process,
    options.id,
    trimmedCommand,
    normalizedArgs,
  );

  attachProcessOutput(process, options);

  const exit = process.exit.then((exitCode) => {
    finalizeProcess(processId, exitCode, options.onExit);
    return exitCode;
  });

  return {
    id: processId,
    process,
    exit,
  };
}

/**
 * Spawn a process and wait until it exits.
 */
export async function executeTerminalCommand(
  command: string,
  args: string[] = [],
  options: TerminalProcessOptions = {},
): Promise<number> {
  const result = await runTerminalProcess(command, args, options);

  return result.exit;
}

/**
 * Attach an already-created WebContainer process to the manager.
 */
export function attachProcess(
  process: WebContainerProcess,
  options: TerminalProcessOptions = {},
): string {
  const processId = registerProcess(process, options.id);

  attachProcessOutput(process, options);

  void process.exit
    .then((exitCode) => {
      finalizeProcess(processId, exitCode, options.onExit);
    })
    .catch(() => {
      managedProcesses.delete(processId);
    });

  return processId;
}

/**
 * Detach a process without killing it.
 *
 * Useful when ownership of the process is intentionally transferred
 * to another part of the runtime.
 */
export function detachProcess(processId: string): boolean {
  return managedProcesses.delete(processId);
}

/**
 * Return the number of currently managed processes.
 */
export function getProcessCount(): number {
  return managedProcesses.size;
}

/**
 * Check whether any managed process is currently running.
 */
export function hasRunningProcesses(): boolean {
  return managedProcesses.size > 0;
}

/**
 * Dispose all terminal processes and release the terminal reference.
 */
export function disposeTerminalManager(): void {
  killAllProcesses();
  terminalInstance = null;
}