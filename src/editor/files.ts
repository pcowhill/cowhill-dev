/**
 * File access for the editor. Prefers the File System Access API (Chrome and
 * Edge on desktop) and always keeps the classic file input + download path
 * available. Nothing here reads a file the user did not explicitly select.
 */

export interface FileSourceHandle {
  kind: 'handle';
  name: string;
  handle: FileSystemFileHandle;
}
export interface FileSourceFile {
  kind: 'file';
  name: string;
  file: File;
}
export type FileSource = FileSourceHandle | FileSourceFile;

export const YAML_PICKER_TYPES = [
  { description: 'YAML files', accept: { 'application/yaml': ['.yaml', '.yml'] } },
];

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'AbortError' : (err as { name?: string })?.name === 'AbortError';
}

export async function pickOpenFile(): Promise<FileSourceHandle | null> {
  try {
    const [handle] = await (window as unknown as {
      showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
    }).showOpenFilePicker({ types: YAML_PICKER_TYPES, multiple: false, excludeAcceptAllOption: false });
    if (!handle) return null;
    return { kind: 'handle', name: handle.name, handle };
  } catch (err) {
    if (isAbortError(err)) return null;
    throw err;
  }
}

export async function pickSaveFile(suggestedName = 'projects.yaml'): Promise<FileSourceHandle | null> {
  try {
    const handle = await (window as unknown as {
      showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker({ suggestedName, types: YAML_PICKER_TYPES });
    return { kind: 'handle', name: handle.name, handle };
  } catch (err) {
    if (isAbortError(err)) return null;
    throw err;
  }
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (window as unknown as {
      showDirectoryPicker: (opts: unknown) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker({ mode: 'read' });
  } catch (err) {
    if (isAbortError(err)) return null;
    throw err;
  }
}

export async function readSource(source: FileSource): Promise<string> {
  const file = source.kind === 'handle' ? await source.handle.getFile() : source.file;
  return file.text();
}

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<PermissionResult> {
  const h = handle as unknown as {
    queryPermission?: (d: { mode: string }) => Promise<string>;
    requestPermission?: (d: { mode: string }) => Promise<string>;
  };
  if (!h.queryPermission || !h.requestPermission) return 'unsupported';
  try {
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return 'granted';
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } finally {
    await writable.close();
  }
}

/** Triggers a browser download of the given text. */
export function downloadText(text: string, name: string): void {
  const blob = new Blob([text], { type: 'application/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Extracts a file source from a drop event (handle when available, File otherwise). */
export async function sourceFromDrop(event: DragEvent): Promise<FileSource | null> {
  const item = event.dataTransfer?.items?.[0];
  if (item && item.kind === 'file') {
    const withHandle = item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
    if (typeof withHandle.getAsFileSystemHandle === 'function') {
      try {
        const handle = await withHandle.getAsFileSystemHandle();
        if (handle && handle.kind === 'file') {
          return { kind: 'handle', name: handle.name, handle: handle as FileSystemFileHandle };
        }
      } catch {
        /* fall through to File */
      }
    }
    const file = item.getAsFile();
    if (file) return { kind: 'file', name: file.name, file };
  }
  const file = event.dataTransfer?.files?.[0];
  return file ? { kind: 'file', name: file.name, file } : null;
}

/** Resolves a repository-relative path (forward slashes) inside a directory handle. */
export async function getFileFromDirectory(root: FileSystemDirectoryHandle, relativePath: string): Promise<File | null> {
  const segments = relativePath.split('/').filter(Boolean);
  let dir: FileSystemDirectoryHandle = root;
  try {
    for (let i = 0; i < segments.length - 1; i += 1) {
      dir = await dir.getDirectoryHandle(segments[i] as string);
    }
    const fileHandle = await dir.getFileHandle(segments[segments.length - 1] as string);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function directoryHasFile(root: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await root.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** Detects the newline convention of loaded text so saves keep it. */
export function detectEol(text: string): '\n' | '\r\n' {
  return /\r\n/.test(text) ? '\r\n' : '\n';
}

export function applyEol(text: string, eol: '\n' | '\r\n'): string {
  const normalized = text.replace(/\r\n/g, '\n');
  return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}
