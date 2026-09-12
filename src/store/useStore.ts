import { create } from 'zustand';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  content?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated';

interface StoreState {
  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  user: AuthUser | null;
  authStatus: AuthStatus;

  setUser: (user: AuthUser | null) => void;
  setAuthStatus: (status: AuthStatus) => void;
  signOut: () => void;

  // ---------------------------------------------------------------------------
  // Workspace / Project
  // ---------------------------------------------------------------------------

  workspaceId: string | null;
  currentProject: WorkspaceProject | null;

  setWorkspaceId: (workspaceId: string | null) => void;
  setCurrentProject: (project: WorkspaceProject | null) => void;
  updateCurrentProject: (
    updates: Partial<WorkspaceProject>,
  ) => void;

  isProjectDirty: boolean;
  lastSavedAt: string | null;

  setProjectDirty: (value: boolean) => void;
  markProjectSaved: (savedAt?: string) => void;

  // ---------------------------------------------------------------------------
  // File System
  // ---------------------------------------------------------------------------

  fileTree: FileTreeNode[];

  setFileTree: (tree: FileTreeNode[]) => void;

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  openFiles: string[];
  activeFile: string | null;
  fileContents: Record<string, string>;

  // Paths containing changes that have not been confirmed as saved.
  dirtyFiles: string[];

  openFile: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;

  markFileSaved: (path: string) => void;
  isFileDirty: (path: string) => boolean;

  // ---------------------------------------------------------------------------
  // Terminal
  // ---------------------------------------------------------------------------

  terminalOutput: string;
  addTerminalOutput: (output: string) => void;
  clearTerminal: () => void;

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;

  // ---------------------------------------------------------------------------
  // WebContainer / Runtime Status
  // ---------------------------------------------------------------------------

  isBooting: boolean;
  isInstalling: boolean;
  isRunning: boolean;

  setBooting: (value: boolean) => void;
  setInstalling: (value: boolean) => void;
  setRunning: (value: boolean) => void;

  // ---------------------------------------------------------------------------
  // Workspace Reset
  // ---------------------------------------------------------------------------

  resetEditorState: () => void;
  resetWorkspace: () => void;
}

function addUniquePath(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths : [...paths, path];
}

function removePath(paths: string[], path: string): string[] {
  return paths.filter((item) => item !== path);
}

function hasDirtyFiles(dirtyFiles: string[]): boolean {
  return dirtyFiles.length > 0;
}

export const useStore = create<StoreState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  user: null,

  authStatus: 'loading',

  setUser: (user) =>
    set({
      user,
      authStatus: user
        ? 'authenticated'
        : 'unauthenticated',
    }),

  setAuthStatus: (status) =>
    set({
      authStatus: status,
    }),

  signOut: () =>
    set({
      user: null,
      authStatus: 'unauthenticated',

      workspaceId: null,
      currentProject: null,

      fileTree: [],

      openFiles: [],
      activeFile: null,
      fileContents: {},
      dirtyFiles: [],

      terminalOutput: '',
      previewUrl: null,

      isBooting: false,
      isInstalling: false,
      isRunning: false,

      isProjectDirty: false,
      lastSavedAt: null,
    }),

  // ---------------------------------------------------------------------------
  // Workspace / Project
  // ---------------------------------------------------------------------------

  workspaceId: null,

  currentProject: null,

  setWorkspaceId: (workspaceId) =>
    set({
      workspaceId,
    }),

  setCurrentProject: (project) =>
    set({
      currentProject: project,
      isProjectDirty: false,
      lastSavedAt: project?.updatedAt ?? null,
    }),

  updateCurrentProject: (updates) =>
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      return {
        currentProject: {
          ...state.currentProject,
          ...updates,
        },
        isProjectDirty: true,
      };
    }),

  isProjectDirty: false,

  lastSavedAt: null,

  setProjectDirty: (value) =>
    set({
      isProjectDirty: value,
    }),

  markProjectSaved: (savedAt) => {
    const timestamp =
      savedAt ?? new Date().toISOString();

    set((state) => ({
      isProjectDirty: false,
      lastSavedAt: timestamp,

      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            updatedAt: timestamp,
          }
        : null,

      dirtyFiles: [],
    }));
  },

  // ---------------------------------------------------------------------------
  // File System
  // ---------------------------------------------------------------------------

  fileTree: [],

  setFileTree: (tree) =>
    set({
      fileTree: tree,
    }),

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  openFiles: [],

  activeFile: null,

  fileContents: {},

  dirtyFiles: [],

  openFile: (path, content) =>
    set((state) => ({
      openFiles: addUniquePath(
        state.openFiles,
        path,
      ),

      activeFile: path,

      fileContents: {
        ...state.fileContents,
        [path]: content,
      },
    })),

  closeFile: (path) =>
    set((state) => {
      const newOpenFiles =
        state.openFiles.filter(
          (filePath) => filePath !== path,
        );

      const newFileContents = {
        ...state.fileContents,
      };

      delete newFileContents[path];

      const newDirtyFiles =
        removePath(state.dirtyFiles, path);

      let newActiveFile = state.activeFile;

      if (state.activeFile === path) {
        const closedIndex =
          state.openFiles.indexOf(path);

        newActiveFile =
          newOpenFiles[
            Math.min(
              Math.max(closedIndex - 1, 0),
              newOpenFiles.length - 1,
            )
          ] ?? null;
      }

      return {
        openFiles: newOpenFiles,
        activeFile: newActiveFile,
        fileContents: newFileContents,
        dirtyFiles: newDirtyFiles,

        isProjectDirty:
          hasDirtyFiles(newDirtyFiles),
      };
    }),

  setActiveFile: (path) =>
    set((state) => {
      if (!state.openFiles.includes(path)) {
        return state;
      }

      return {
        activeFile: path,
      };
    }),

  updateFileContent: (path, content) =>
    set((state) => {
      const dirtyFiles = addUniquePath(
        state.dirtyFiles,
        path,
      );

      return {
        fileContents: {
          ...state.fileContents,
          [path]: content,
        },

        dirtyFiles,

        isProjectDirty: true,
      };
    }),

  markFileSaved: (path) =>
    set((state) => {
      const dirtyFiles =
        removePath(state.dirtyFiles, path);

      return {
        dirtyFiles,

        isProjectDirty:
          hasDirtyFiles(dirtyFiles),
      };
    }),

  isFileDirty: (path) =>
    get().dirtyFiles.includes(path),

  // ---------------------------------------------------------------------------
  // Terminal
  // ---------------------------------------------------------------------------

  terminalOutput: '',

  addTerminalOutput: (output) =>
    set((state) => ({
      terminalOutput:
        state.terminalOutput + output,
    })),

  clearTerminal: () =>
    set({
      terminalOutput: '',
    }),

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  previewUrl: null,

  setPreviewUrl: (url) =>
    set({
      previewUrl: url,
    }),

  // ---------------------------------------------------------------------------
  // WebContainer / Runtime Status
  // ---------------------------------------------------------------------------

  isBooting: false,

  isInstalling: false,

  isRunning: false,

  setBooting: (value) =>
    set({
      isBooting: value,
    }),

  setInstalling: (value) =>
    set({
      isInstalling: value,
    }),

  setRunning: (value) =>
    set({
      isRunning: value,
    }),

  // ---------------------------------------------------------------------------
  // Workspace Reset
  // ---------------------------------------------------------------------------

  resetEditorState: () =>
    set({
      openFiles: [],
      activeFile: null,
      fileContents: {},
      dirtyFiles: [],
      isProjectDirty: false,
    }),

  resetWorkspace: () =>
    set({
      workspaceId: null,
      currentProject: null,

      fileTree: [],

      openFiles: [],
      activeFile: null,
      fileContents: {},
      dirtyFiles: [],

      terminalOutput: '',
      previewUrl: null,

      isBooting: false,
      isInstalling: false,
      isRunning: false,

      isProjectDirty: false,
      lastSavedAt: null,
    }),
}));