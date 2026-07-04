/**
 * Scan page (placeholder). The full capture UI is built by a subsequent
 * feature. This page exists so the route is reachable and middleware
 * protection can be exercised.
 */
export default function ScanPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Scan
      </h1>
      <p className="text-sm text-muted-foreground">
        Dokument erfassen — bald verfügbar.
      </p>
    </div>
  );
}
