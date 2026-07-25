// ponytail: lib.dom.d.ts doesn't cover the File System Access API (a WICG
// spec, not WHATWG DOM) — this declares only the two entry points and the
// handle surface file-io.ts actually calls, not the full spec. Extend when
// file-io.ts starts calling another part of the API.
interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string | string[]>;
}

interface Window {
  showSaveFilePicker?(options?: {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
  }): Promise<FileSystemFileHandle>;
  showOpenFilePicker?(options?: { types?: FilePickerAcceptType[] }): Promise<FileSystemFileHandle[]>;
}
