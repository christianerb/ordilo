import { Plus } from "lucide-react-native";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import {
  getPersonColor,
  getPersonInitial,
  getPersonShortName,
  type Person,
} from "@/src/lib/people";
import { colors, radii, sizes, typography } from "@/src/theme/tokens";

/**
 * The family on a row. A circle with the person's photo, or — with none
 * uploaded — the first letter on a coloured background, so "wer?" reads
 * identically on tasks, events, documents and in the chat. Never
 * decorative: an avatar always stands for a real person, and an empty
 * seat (dashed circle) always means the question is still open.
 */
export function PersonAvatar({
  person,
  pending = false,
  size = sizes.avatar,
  style,
}: {
  person: Pick<Person, "name" | "color" | "photoUrl">;
  /**
   * Assigned, but that person hasn't accepted it yet. Reuses the empty
   * seat's dashed ring for "still open" instead of a second, separate
   * signal — the face says who, the dashing says it isn't settled yet.
   */
  pending?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const fontSize = Math.max(10, Math.round(size * 0.44));
  const photoUrl = person.photoUrl;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.avatar,
        pending && styles.avatarPending,
        {
          backgroundColor: photoUrl ? colors.sand : getPersonColor(person),
          borderRadius: size / 2,
          height: size,
          width: size,
        },
        style,
      ]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ borderRadius: size / 2, height: size, width: size }}
        />
      ) : (
        <Text
          allowFontScaling={false}
          style={[styles.initial, { fontSize, lineHeight: Math.round(fontSize * 1.2) }]}
        >
          {getPersonInitial(person.name)}
        </Text>
      )}
    </View>
  );
}

/** The dashed empty seat: nobody has this yet. */
export function EmptyPersonSeat({
  size = sizes.avatar,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.emptySeat,
        { borderRadius: size / 2, height: size, width: size },
        style,
      ]}
    >
      <Plus color={colors.mistDark} size={Math.round(size * 0.45)} strokeWidth={2} />
    </View>
  );
}

/**
 * Several people at once, overlapping like a family photo. Shows at most
 * `max` faces and a "+N" seat for the rest.
 */
export function AvatarStack({
  people,
  max = 3,
  size = sizes.avatar,
  style,
}: {
  people: Pick<Person, "name" | "color" | "photoUrl">[];
  max?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const overlap = Math.round(size * 0.3);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.stack, style]}
    >
      {shown.map((person, index) => (
        <PersonAvatar
          key={`${person.name}-${index}`}
          person={person}
          size={size}
          style={[styles.stackItem, index > 0 && { marginLeft: -overlap }]}
        />
      ))}
      {rest > 0 ? (
        <View
          style={[
            styles.stackItem,
            styles.stackRest,
            {
              borderRadius: size / 2,
              height: size,
              marginLeft: -overlap,
              width: size,
            },
          ]}
        >
          <Text allowFontScaling={false} style={styles.stackRestText}>
            +{rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A name pill with its face — for lists that answer "wer?" in words too. */
export function PersonChip({
  person,
  selected = false,
  style,
}: {
  person: Pick<Person, "name" | "color" | "photoUrl">;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.chip, selected && styles.chipSelected, style]}>
      <PersonAvatar person={person} size={sizes.avatarSmall} />
      <Text
        numberOfLines={1}
        style={[styles.chipText, selected && styles.chipTextSelected]}
      >
        {getPersonShortName(person.name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initial: {
    color: colors.warmWhite,
    fontFamily: typography.title.fontFamily,
  },
  emptySeat: {
    alignItems: "center",
    borderColor: colors.mistLight,
    borderStyle: "dashed",
    borderWidth: 1.5,
    justifyContent: "center",
  },
  avatarPending: {
    borderColor: colors.warmWhite,
    borderStyle: "dashed",
    borderWidth: 2,
  },
  stack: {
    alignItems: "center",
    flexDirection: "row",
  },
  stackItem: {
    borderColor: colors.warmWhite,
    borderWidth: 2,
  },
  stackRest: {
    alignItems: "center",
    backgroundColor: colors.sandWarm,
    justifyContent: "center",
  },
  stackRestText: {
    color: colors.mistDark,
    fontFamily: typography.label.fontFamily,
    fontSize: 11,
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: 160,
    minHeight: 32,
    paddingLeft: 4,
    paddingRight: 10,
  },
  chipSelected: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
  chipText: {
    color: colors.graphite,
    flexShrink: 1,
    ...typography.caption,
  },
  chipTextSelected: {
    color: colors.warmWhite,
  },
});
