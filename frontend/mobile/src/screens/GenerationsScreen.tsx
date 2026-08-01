import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import ReactNativeBlobUtil from "react-native-blob-util";
import Video from "react-native-video";
import { useFocusEffect } from "@react-navigation/native";

import {
  deleteGeneration,
  generationVideoUrl,
  listGenerations,
} from "../api/client";
import type { Generation } from "../types";

async function downloadToCache(id: string): Promise<string> {
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/generation-${id}.mp4`;
  await ReactNativeBlobUtil.config({ path }).fetch(
    "GET",
    generationVideoUrl(id),
  );
  return `file://${path}`;
}

function GenerationVideo({ id }: { id: string }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  const download = async () => {
    setBusy("download");
    try {
      const fileUrl = await downloadToCache(id);
      await CameraRoll.saveAsset(fileUrl, { type: "video" });
      Alert.alert("Saved", "Video saved to your photo library.");
    } catch (e) {
      console.error("download failed:", e instanceof Error ? e.message : e);
      Alert.alert("Download failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const fileUrl = await downloadToCache(id);
      await Share.share({ url: fileUrl });
    } catch (e) {
      console.error("share failed:", e instanceof Error ? e.message : e);
      Alert.alert("Share failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.videoWrap}>
      {playing ? (
        <Video
          source={{ uri: generationVideoUrl(id) }}
          style={styles.video}
          controls
          resizeMode="contain"
        />
      ) : (
        <Pressable style={styles.videoPlaceholder} onPress={() => setPlaying(true)}>
          <Text style={styles.playIcon}>▶</Text>
          <Text style={styles.playLabel}>Tap to play</Text>
        </Pressable>
      )}
      <View style={styles.videoActions}>
        <Pressable
          style={[styles.actionButton, busy != null && styles.actionDisabled]}
          onPress={download}
          disabled={busy != null}
        >
          {busy === "download" ? (
            <ActivityIndicator size="small" color="#111" />
          ) : (
            <Text style={styles.actionText}>Download</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.actionButton, busy != null && styles.actionDisabled]}
          onPress={share}
          disabled={busy != null}
        >
          {busy === "share" ? (
            <ActivityIndicator size="small" color="#111" />
          ) : (
            <Text style={styles.actionText}>Share</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function GenerationsScreen() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const refetch = () =>
        listGenerations()
          .then((list) => {
            setGenerations(list);
            setError(null);
          })
          .catch((e) => setError(String(e.message ?? e)));

      refetch();
      // Poll while the tab is focused so running jobs update live.
      const interval = setInterval(refetch, 5000);
      return () => clearInterval(interval);
    }, []),
  );

  const confirmDelete = (id: string) => {
    Alert.alert("Delete generation?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteGeneration(id);
            setGenerations((prev) => prev.filter((g) => g.id !== id));
          } catch (e) {
            console.error(
              "delete generation failed:",
              e instanceof Error ? e.message : e,
            );
            Alert.alert("Failed", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={generations}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.header}>
              <View style={styles.statusRow}>
                {item.status === "running" && (
                  <ActivityIndicator size="small" />
                )}
                <Text
                  style={[
                    styles.status,
                    item.status === "failed" && styles.statusFailed,
                    item.status === "completed" && styles.statusCompleted,
                  ]}
                >
                  {item.status}
                </Text>
              </View>
              <View style={styles.headerRight}>
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
                <Pressable
                  style={styles.deleteButton}
                  hitSlop={6}
                  onPress={() => confirmDelete(item.id)}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </Pressable>
              </View>
            </View>
            {item.sharedLink && (
              <Text style={styles.source} numberOfLines={1}>
                {item.sharedLink.source}: {item.sharedLink.url}
              </Text>
            )}
            {item.status === "failed" && item.error && (
              <Text style={styles.errorDetail} numberOfLines={4}>
                {item.error}
              </Text>
            )}
            {item.status === "completed" && <GenerationVideo id={item.id} />}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No generations yet</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16, gap: 12 },
  row: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
    gap: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e5e5ea",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#c00", fontSize: 12, fontWeight: "700" },
  status: { fontSize: 16, fontWeight: "600" },
  statusFailed: { color: "#c00" },
  statusCompleted: { color: "#0a7d33" },
  source: { fontSize: 12, color: "#666" },
  errorDetail: { fontSize: 12, color: "#c00" },
  videoWrap: { gap: 8, marginTop: 4 },
  video: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 10,
    backgroundColor: "#000",
  },
  videoPlaceholder: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 10,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  playIcon: { color: "#fff", fontSize: 42 },
  playLabel: { color: "#aaa", fontSize: 14 },
  videoActions: { flexDirection: "row", gap: 12 },
  actionButton: {
    flex: 1,
    backgroundColor: "#e5e5ea",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionDisabled: { opacity: 0.5 },
  actionText: { fontSize: 15, fontWeight: "600", color: "#111" },
  date: { fontSize: 12, color: "#666" },
  empty: { textAlign: "center", color: "#999", marginTop: 48, fontSize: 16 },
  error: { color: "#c00", textAlign: "center", padding: 8 },
});

export default GenerationsScreen;
