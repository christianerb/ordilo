/** expo-audio for the web preview: a recorder that never records. */
export const RecordingPresets = { HIGH_QUALITY: {} };
export const AudioModule = {
  async requestRecordingPermissionsAsync() { return { granted: false }; },
};
export async function setAudioModeAsync() {}
export function useAudioRecorder() {
  return {
    uri: null,
    currentTime: 0,
    async prepareToRecordAsync() {},
    record() {},
    async stop() {},
  };
}
export function useAudioRecorderState() {
  return { durationMillis: 0, metering: -60, isRecording: false };
}
