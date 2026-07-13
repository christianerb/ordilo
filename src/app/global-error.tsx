"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Global Error Boundary — catches errors that escape the root layout.
 *
 * This is Next.js's outermost error boundary. It replaces the root layout
 * entirely, so it must render its own <html> and <body> tags. The styling
 * is minimal (inline) because globals.css may not have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FDFCFA",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, sans-serif",
          color: "#262421",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "24px",
            maxWidth: "400px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              backgroundColor: "#F1EEE8",
              marginBottom: "20px",
            }}
            aria-hidden="true"
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9C978C"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            Etwas ist schiefgelaufen
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#625D54",
              marginTop: "6px",
              lineHeight: 1.5,
            }}
          >
            Ein unerwarteter Fehler ist aufgetreten. Versuche es erneut.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "24px",
              height: "48px",
              padding: "0 24px",
              borderRadius: "20px",
              backgroundColor: "#305460",
              color: "#FDFCFA",
              border: "none",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
