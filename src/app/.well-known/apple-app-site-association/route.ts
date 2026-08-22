/**
 * GET /.well-known/apple-app-site-association
 *
 * Apple App Site Association (AASA) file for iOS universal links. It tells
 * iOS that https://<domain>/invite/* links belong to the Ordilo app, so a
 * family invite tapped on an iPhone opens the app directly instead of the
 * browser. The file is only served when APPLE_TEAM_ID is configured —
 * without a team id the appID would be meaningless, so the route 404s.
 */
export async function GET(): Promise<Response> {
  const teamId = process.env.APPLE_TEAM_ID;
  if (!teamId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.com.ordilo.app`,
            paths: ["/invite/*"],
          },
        ],
      },
    },
    { status: 200 },
  );
}
