import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
async function updateRestNotification(end: number | null) {
  if (!end || end <= Date.now()) {
    await Notifications.cancelScheduledNotificationAsync("workout-rest");
    return;
  }
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("rest", {
      name: "Repos",
      importance: Notifications.AndroidImportance.HIGH,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted)
    permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Notifications refusées : le minuteur reste visible dans la séance.",
    );
  await Notifications.scheduleNotificationAsync({
    // Scheduling with the same identifier replaces the previous rest alert.
    identifier: "workout-rest",
    content: {
      title: "Repos terminé",
      body: "Prêt pour la prochaine série ?",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(end),
      channelId: "rest",
    },
  });
}

// An optional native alert must never turn a saved workout action into a failure.
export async function scheduleRest(end: number | null): Promise<string | null> {
  try {
    await updateRestNotification(end);
    return null;
  } catch (error) {
    console.warn("Rest notification unavailable", error);
    return end && end > Date.now()
      ? "Alerte de repos indisponible : le minuteur reste actif dans la séance."
      : "Impossible d’annuler l’alerte de repos sur cet appareil.";
  }
}
