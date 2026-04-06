export interface WorkspaceInfo {
  path: string;
  customWorkspace: boolean;
  type: 'user' | 'temp';
  createdAt: number;
}

export interface CreateWorkspaceOptions {
  backend: string;
  workspace?: string;
  customWorkspace?: boolean;
}

export interface FileChangeInfo {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  status: 'staged' | 'unstaged';
}

export interface SnapshotInfo {
  mode: 'git-repo' | 'snapshot';
  branch: string | null;
}

export interface CompareResult {
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
}

export interface WorkspaceMeta {
  workingDir: string;
  customWorkspace: boolean;
  workspaceType: 'user' | 'temp';
  snapshotMode: 'git-repo' | 'snapshot' | null;
  snapshotBranch: string | null;
}
