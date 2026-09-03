/** The native scanner has no web build; the preview never opens the camera. */
export async function launchScanner() {
  return { didCancel: true, images: [] };
}
