export function townLoadErrorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The town config could not be read.';
}

export function BootError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 bg-canvas px-4 py-8 text-ink">
      <h1 className="font-display text-2xl font-semibold">This build could not load a town</h1>
      <p className="whitespace-pre-wrap text-base leading-relaxed">{message}</p>
      <p className="text-sm leading-relaxed text-muted">
        Set VITE_TOWN to the name of a file in data/towns, without .json, and build again.
      </p>
    </main>
  );
}
