/** expo-local-authentication for the web preview: no hardware, never locks. */
export const AuthenticationType = { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 };
export async function hasHardwareAsync() { return false; }
export async function isEnrolledAsync() { return false; }
export async function supportedAuthenticationTypesAsync() { return []; }
export async function authenticateAsync() { return { success: true }; }
