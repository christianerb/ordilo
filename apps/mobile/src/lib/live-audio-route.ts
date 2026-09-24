import { requireOptionalNativeModule } from "expo";

interface OrdiloLiveAudioModule {
  enableSpeaker(): boolean;
  restore(): void;
}

// Optional: a binary built before the module existed, Android, and unit
// tests simply keep the system's default route.
function nativeModule(): OrdiloLiveAudioModule | null {
  return requireOptionalNativeModule<OrdiloLiveAudioModule>("OrdiloLiveAudio");
}

/**
 * Sends the Live conversation to the loudspeaker instead of the earpiece.
 * Must run before the WebRTC call starts its audio; headphones and
 * Bluetooth still win over the speaker.
 */
export function routeLiveAudioToSpeaker(): void {
  try {
    nativeModule()?.enableSpeaker();
  } catch {
    // Routing is a comfort, never a reason to fail the conversation.
  }
}

/** Hands the audio route back to WebRTC's defaults after the call. */
export function restoreLiveAudioRoute(): void {
  try {
    nativeModule()?.restore();
  } catch {
    // Nothing to undo when the module is missing or already restored.
  }
}
