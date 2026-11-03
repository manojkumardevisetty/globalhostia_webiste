'use client';
// Last-resort error boundary for the React pages (it replaces the root layout): the same branded page as
// lib/ux/error-page.ts (hexagon mark, "Try again", support links). The error itself is logged by Next.js on the
// server; only the digest is shown, as a reference for support.
import { useEffect } from 'react';
import { ERROR_PAGE_CSS, hexMark } from '@/lib/ux/error-page';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="en" dir="ltr">
      <head>
        <meta name="robots" content="noindex" />
        <title>Something went wrong · GlobalHostia</title>
        <style dangerouslySetInnerHTML={{ __html: ERROR_PAGE_CSS }} />
      </head>
      <body>
        <main className="gh-ep">
          <span dangerouslySetInnerHTML={{ __html: hexMark('alert') }} />
          <span className="gh-ep__code">Error 500</span>
          <h1>Something went wrong on our side</h1>
          <p>The page could not be shown. Please try again. If it keeps happening, our team is one message away.</p>
          <div className="gh-ep__act">
            <button type="button" className="gh-ep__btn" onClick={() => reset()}>Try again</button>
            <a className="gh-ep__btn gh-ep__btn--ghost" href="/">Go to the homepage</a>
          </div>
          <p className="gh-ep__help">Still not working? Email <a href="mailto:support@globalhostia.com">support@globalhostia.com</a> or <a href="/contact">contact our team</a>. Your hosting, email and domains keep running.</p>
          {error.digest ? <p className="gh-ep__ref">Reference: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
