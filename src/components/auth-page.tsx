export function AuthPage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}
