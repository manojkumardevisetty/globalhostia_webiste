'use client';
// Admin error boundary: a failed page load or save (most often the database being unavailable) shows a clear
// message inside the admin layout instead of the generic Next.js error screen.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
      <h1 className="text-lg font-semibold">Database unavailable, or this action failed</h1>
      <p className="mt-2 text-sm">
        The change was not saved. If the banner above says the database is unavailable (for example, the plan quota is used up),
        the public website keeps running from its last saved copy; try again once the database is back.
      </p>
      {error.digest && <p className="mt-2 text-xs text-amber-800">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="btn btn-primary mt-4">Try again</button>
    </div>
  );
}
