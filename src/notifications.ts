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
export async function scheduleRest(end: number | null) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!end || end <= Date.now()) return;
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
