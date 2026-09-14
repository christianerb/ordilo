import { FIRST_VALUE_EXAMPLE as example } from "@ordilo/document-contract";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OrdiloButton } from "@/src/components/ui";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/** Local-only demonstration: no account, permissions, network or writes. */
export function FirstValueExample({ onContinue }: { onContinue?: () => void }) {
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(false);

  return (
    <View style={styles.container}>
      <OrdiloButton
        title={open ? "Beispiel schließen" : "Ohne eigenen Brief ausprobieren"}
        variant="ghost"
        onPress={() => {
          setOpen(!open);
          setAnswered(false);
        }}
      />
      {open ? (
        <View style={styles.example}>
          <Text style={styles.label}>Beispiel</Text>
          <Text style={styles.title}>{example.title}</Text>
          <Text style={styles.note}>{example.notice}</Text>
          <Text style={styles.body}>{example.letter}</Text>
          {!answered ? (
            <OrdiloButton
              title={example.question}
              size="lg"
              onPress={() => setAnswered(true)}
            />
          ) : (
            <View accessibilityLiveRegion="polite" style={styles.answer}>
              <Text style={styles.question}>{example.question}</Text>
              <Text accessibilityRole="header" style={styles.highlight}>
                {example.answer}
              </Text>
              <Text style={styles.label}>Die Fundstelle im Beispielbrief</Text>
              <Text style={styles.body}>„{example.quote}“</Text>
              <Text style={styles.note}>{example.takeaway}</Text>
              {onContinue ? (
                <OrdiloButton
                  title="Mit eigenem Brief loslegen"
                  size="lg"
                  onPress={onContinue}
                />
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: "stretch", gap: spacing.sm },
  example: {
    backgroundColor: colors.sand,
    borderColor: colors.mistLight,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  answer: { gap: spacing.md },
  label: { ...typography.label, color: colors.harborBlue },
  title: { ...typography.display, color: colors.graphite },
  body: { ...typography.body, color: colors.graphite },
  note: { ...typography.timestamp, color: colors.mistDark },
  question: { ...typography.title, color: colors.graphite },
  highlight: { ...typography.display, color: colors.harborBlue },
});
