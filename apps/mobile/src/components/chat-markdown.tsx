import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";

/** A small native renderer for the deliberately limited chat format. No HTML or links execute. */
export function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (line.trim().startsWith("|") && lines[index + 1]?.match(/^\s*\|?[\s:|-]+\|\s*$/)) {
      const table = [line];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) table.push(lines[index++]);
      index--;
      blocks.push(<ScrollView horizontal key={`table-${index}`} showsHorizontalScrollIndicator>
        <View accessibilityRole="summary" style={styles.table}>
          {table.map((row, rowIndex) => <View style={styles.row} key={rowIndex}>
            {row.trim().replace(/^\||\|$/g, "").split("|").map((cell, cellIndex) =>
              <Text selectable style={[styles.cell, rowIndex === 0 && styles.strong]} key={cellIndex}>{inline(cell.trim())}</Text>)}
          </View>)}
        </View>
      </ScrollView>);
    } else {
      const heading = /^#{1,4}\s+/.test(line);
      blocks.push(<Text selectable style={[styles.body, heading && styles.heading]} key={index}>
        {inline(line.replace(/^#{1,4}\s+/, "").replace(/^\s*[-*]\s+/, "• "))}
      </Text>);
    }
  }
  return <View style={styles.blocks}>{blocks}</View>;
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <Text key={index} style={styles.strong}>{part.slice(2, -2)}</Text>
      : part.startsWith("`") && part.endsWith("`") ? part.slice(1, -1) : part);
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.sm },
  body: { ...typography.body, color: colors.graphite, lineHeight: 25 },
  strong: { fontFamily: "Figtree_600SemiBold" },
  heading: { ...typography.display, marginTop: spacing.sm },
  table: { borderTopWidth: 1, borderColor: colors.mistLight },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: colors.mistLight },
  cell: { ...typography.body, color: colors.graphite, width: 160, padding: spacing.sm },
});
