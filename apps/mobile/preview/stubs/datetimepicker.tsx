import { Text } from "react-native";

export type DateTimePickerEvent = { type: "set" | "dismissed"; nativeEvent: { timestamp?: number } };

/** Native date picker stand-in for the web preview. */
export default function DateTimePicker({ value }: { value: Date }) {
  return <Text>{value.toLocaleDateString("de-DE")}</Text>;
}
