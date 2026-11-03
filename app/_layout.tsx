import React from "react";
import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { StoreProvider, useStore } from "../src/store";
import { AuthScreen } from "../src/auth-screen";
import { Button, Card, Row, Txt, colors, styles } from "../src/ui";
import { exportFile } from "../src/export";
import { registerOffline } from "../src/offline";
function Shell() {
  React.useEffect(registerOffline, []);
  const store = useStore();
  if (!store.demo && (!store.auth || !store.member || store.member.suspended))
    return <AuthScreen />;
  if (!store.ready)
    return (
      <View style={styles.page}>
        <Text style={styles.text}>Chargement… {store.message}</Text>
      </View>
    );
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="light" />
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        <Row>
          <Text
            style={{ color: colors.accent, fontWeight: "800", fontSize: 18 }}
          >
            MYWORKOUT
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.muted, { flex: 1 }]}
          >
            {store.cloudStatus}
          </Text>
        </Row>
        {!!store.message && (
          <Card>
            <Text accessibilityRole="alert" style={styles.text}>
              {store.message}
            </Text>
            <Button
              secondary
              label="Fermer le message"
              onPress={() => store.setMessage("")}
            />
          </Card>
        )}
        {store.conflict && (
          <Card>
            <Txt>
              Deux versions ont changé. Les éléments absents de la version
              choisie seront conservés ; pour les éléments modifiés des deux
              côtés, choisissez la version à garder.
            </Txt>
            <Txt muted>
              Appareil : {store.state.sessions.length} séances · Serveur :{" "}
              {store.conflict.data.sessions.length} séances
            </Txt>
            <Row>
              <Button
                label="Exporter les deux versions"
                secondary
                onPress={() =>
                  exportFile(
                    "myworkout-conflit.json",
                    JSON.stringify(
                      { local: store.state, remote: store.conflict?.data },
                      null,
                      2,
                    ),
                    "application/json",
                  )
                }
              />
              <Button
                label="Priorité à cet appareil"
                onPress={() => store.resolve("local")}
              />
              <Button
                label="Priorité au serveur"
                secondary
                onPress={() => store.resolve("remote")}
              />
            </Row>
          </Card>
        )}
      </View>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.panel,
            borderTopColor: colors.border,
            height: 68,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Progression",
            tabBarIcon: ({ color }) => <Text style={{ color }}>↗</Text>,
          }}
        />
        <Tabs.Screen
          name="workout"
          options={{
            title: "Séance",
            tabBarIcon: ({ color }) => <Text style={{ color }}>▶</Text>,
          }}
        />
        <Tabs.Screen
          name="templates"
          options={{
            title: "Modèles",
            tabBarIcon: ({ color }) => <Text style={{ color }}>▤</Text>,
          }}
        />
        <Tabs.Screen
          name="exercises"
          options={{
            title: "Exercices",
            tabBarIcon: ({ color }) => <Text style={{ color }}>◇</Text>,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Compte",
            tabBarIcon: ({ color }) => <Text style={{ color }}>⚙</Text>,
          }}
        />
        <Tabs.Screen name="community" options={{ href: null }} />
      </Tabs>
    </SafeAreaView>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
