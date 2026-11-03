import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useStore } from "./store";
export const colors = {
  bg: "#0c111b",
  panel: "#182232",
  border: "#33445a",
  text: "#f1f5fb",
  muted: "#a9bbd1",
  accent: "#a9ef75",
  danger: "#ffb5b5",
};
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 20,
    gap: 18,
    width: "100%",
    maxWidth: 1050,
    alignSelf: "center",
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.panel,
    padding: 18,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  title: { color: colors.text, fontSize: 29, fontWeight: "800" },
  heading: { color: colors.text, fontSize: 19, fontWeight: "700" },
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 48,
  },
  button: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
});
export function Txt({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return <Text style={muted ? styles.muted : styles.text}>{children}</Text>;
}
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  danger = false,
}: {
  label: string;
  onPress: () => void | Promise<unknown>;
  secondary?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const { setMessage } = useStore();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={async () => {
        setBusy(true);
        try {
          await onPress();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
      style={[
        styles.button,
        secondary && styles.secondary,
        { opacity: disabled || busy ? 0.5 : 1 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && { color: colors.text },
          danger && { color: secondary ? colors.danger : "#7d1717" },
        ]}
      >
        {busy ? "Patientez…" : label}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  numeric = false,
  email = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  numeric?: boolean;
  email?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 5, flexGrow: 1 }}>
      <Text style={styles.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={
          email ? "email-address" : numeric ? "decimal-pad" : "default"
        }
        autoCapitalize={numeric || email ? "none" : "sentences"}
        autoComplete={email ? "email" : undefined}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 90 }]}
      />
    </View>
  );
}
export function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <Field
      label={label}
      value={draft}
      numeric
      onChange={(text) => {
        setDraft(text);
        if (/^\d+(?:[.,]\d+)?$/.test(text))
          onChange(Number(text.replace(",", ".")));
      }}
    />
  );
}
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Txt muted>{label}</Txt>
      <Row>
        {options.map((o) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: value === o.value }}
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.button, value !== o.value && styles.secondary]}
          >
            <Text
              style={[
                styles.buttonText,
                value !== o.value && { color: colors.text },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </Row>
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.button, styles.secondary]}
    >
      <Txt>
        {value ? "●" : "○"} {label}
      </Txt>
    </Pressable>
  );
}
export function Page({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.page}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      {children}
    </ScrollView>
  );
}
export function date(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
