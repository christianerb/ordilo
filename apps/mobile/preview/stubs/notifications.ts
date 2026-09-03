/** expo-notifications for the web preview: permission never asked. */
export function setNotificationHandler() {}
export async function getPermissionsAsync() {
  return { granted: false, canAskAgain: true, status: "undetermined" };
}
export async function requestPermissionsAsync() {
  return { granted: false, canAskAgain: true, status: "undetermined" };
}
export async function getExpoPushTokenAsync() { return { data: "preview" }; }
export async function setNotificationChannelAsync() { return null; }
export const AndroidImportance = { DEFAULT: 3 };
