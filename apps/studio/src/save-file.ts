type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept?: Record<string, string[]> }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export type SaveFileMode = 'picker' | 'download';

export interface SaveBlobOptions {
  suggestedName: string;
  description: string;
  mimeType: string;
  extensions: string[];
}

export async function saveBlobToDisk(blob: Blob, options: SaveBlobOptions): Promise<SaveFileMode> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('save is only available in browser mode');
  }

  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName: options.suggestedName,
      types: [
        {
          description: options.description,
          accept: {
            [options.mimeType]: options.extensions,
          },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'picker';
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = options.suggestedName;
    link.rel = 'noopener';
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }

  return 'download';
}
