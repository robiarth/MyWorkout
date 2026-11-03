import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
export async function exportFile(name: string, content: string, type: string) {
  const path = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(path, content);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Le partage de fichiers est indisponible.");
  await Sharing.shareAsync(path, {
    mimeType: type,
    dialogTitle: "Exporter mes données",
  });
}
