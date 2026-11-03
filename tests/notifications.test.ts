import { beforeEach, expect, jest, test } from "@jest/globals";
import * as Notifications from "expo-notifications";
import { scheduleRest } from "../src/notifications";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  scheduleNotificationAsync: jest.fn(async () => "workout-rest"),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("replaces the rest alert without cancelling notifications before validation", async () => {
  const end = Date.now() + 60000;
  expect(await scheduleRest(end)).toBeNull();
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      identifier: "workout-rest",
      trigger: expect.objectContaining({ date: new Date(end) }),
    }),
  );
});

test("native NPE returns a nonblocking warning instead of rejecting a saved action", async () => {
  const log = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest
    .mocked(Notifications.scheduleNotificationAsync)
    .mockRejectedValueOnce(new Error("NPE getClass on null object"));
  await expect(scheduleRest(Date.now() + 60000)).resolves.toContain(
    "minuteur reste actif",
  );
  log.mockRestore();
});

test("permission refusal skips scheduling and preserves the in-page timer", async () => {
  const log = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValueOnce({
      granted: false,
    } as Notifications.NotificationPermissionsStatus);
  await expect(scheduleRest(Date.now() + 60000)).resolves.toContain(
    "minuteur reste actif",
  );
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  log.mockRestore();
});

test("stopping cancels only the rest alert and tolerates native cancellation failure", async () => {
  const log = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest
    .mocked(Notifications.cancelScheduledNotificationAsync)
    .mockRejectedValueOnce(new Error("native failure"));
  await expect(scheduleRest(null)).resolves.toContain("annuler");
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
    "workout-rest",
  );
  log.mockRestore();
});
