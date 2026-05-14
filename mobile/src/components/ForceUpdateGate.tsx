import type { ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { useAppConfig } from "../api/appConfig";
import { theme } from "../theme";

interface ForceUpdateGateProps {
  children: ReactNode;
}

function normalizeVersion(version: string | null | undefined): number[] {
  return (version ?? "0")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/\D.*$/, ""), 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(current: string, required: string): number {
  const currentParts = normalizeVersion(current);
  const requiredParts = normalizeVersion(required);
  const length = Math.max(currentParts.length, requiredParts.length);

  for (let index = 0; index < length; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const requiredPart = requiredParts[index] ?? 0;
    if (currentPart !== requiredPart) return currentPart > requiredPart ? 1 : -1;
  }

  return 0;
}

function currentAppVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.0";
}

export function ForceUpdateGate({ children }: ForceUpdateGateProps): JSX.Element {
  const config = useAppConfig();

  if (config.isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.body}>בודק עדכונים...</Text>
      </View>
    );
  }

  if (!config.data) return <>{children}</>;

  const appVersion = currentAppVersion();
  const mustUpdate = compareVersions(appVersion, config.data.minAppVersion) < 0;
  const shouldBlock = mustUpdate || config.data.maintenanceMode;
  const title = mustUpdate ? "נדרש עדכון לאפליקציה" : "המערכת בתחזוקה";
  const message = mustUpdate
    ? "כדי להמשיך לעבוד צריך להתקין את הגרסה העדכנית של האפליקציה."
    : (config.data.maintenanceMessage ?? "אנחנו מבצעים תחזוקה קצרה. נסו שוב בעוד כמה דקות.");

  if (!shouldBlock) return <>{children}</>;

  const canOpenUpdateUrl = mustUpdate && config.data.updateUrl;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{message}</Text>
        {mustUpdate ? (
          <Text style={styles.caption}>
            גרסה מותקנת: {appVersion} | גרסה מינימלית: {config.data.minAppVersion}
          </Text>
        ) : null}
        {canOpenUpdateUrl ? (
          <Pressable style={styles.button} onPress={() => void Linking.openURL(config.data.updateUrl!)}>
            <Text style={styles.buttonText}>הורדת גרסה חדשה</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceContainerLowest,
    ...theme.shadow.floating,
  },
  title: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    textAlign: "right",
  },
  body: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "right",
  },
  caption: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "right",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  buttonText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onPrimary,
    fontFamily: theme.fontFamily.bold,
  },
});
