import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

export type PlaceholderIconName = ComponentProps<typeof Ionicons>["name"];

interface Props {
  icon?: PlaceholderIconName;
  title: string;
  description?: string;
  phase?: string;
}

export function Placeholder({ icon, title, description, phase }: Props): JSX.Element {
  return (
    <View style={styles.screen}>
      <View style={[styles.card, theme.shadow.floating]}>
        {phase ? (
          <View style={styles.phasePill}>
            <Text style={styles.phaseText}>{phase}</Text>
          </View>
        ) : null}
        {icon ? (
          <View style={styles.iconRing}>
            <Ionicons name={icon} size={36} color={theme.colors.primary} />
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.desc}>{description}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.marginMobile,
    justifyContent: "center",
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    alignItems: "center",
  },
  phasePill: {
    alignSelf: "center",
    backgroundColor: theme.colors.primaryFixed,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primaryFixedDim,
  },
  phaseText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimaryFixed,
    letterSpacing: 0.5,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "center",
  },
  desc: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
  },
});
