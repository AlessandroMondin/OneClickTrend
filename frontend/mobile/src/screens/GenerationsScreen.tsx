import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Video from "react-native-video";
import { useFocusEffect } from "@react-navigation/native";

import { generationVideoUrl, listGenerations } from "../api/client";
import type { Generation } from "../types";

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
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
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
            {item.status === "completed" && (
              <Video
                source={{ uri: generationVideoUrl(item.id) }}
                style={styles.video}
                controls
                paused
                resizeMode="contain"
              />
            )}
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
  status: { fontSize: 16, fontWeight: "600" },
  statusFailed: { color: "#c00" },
  statusCompleted: { color: "#0a7d33" },
  source: { fontSize: 12, color: "#666" },
  errorDetail: { fontSize: 12, color: "#c00" },
  video: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 10,
    backgroundColor: "#000",
    marginTop: 4,
  },
  date: { fontSize: 12, color: "#666" },
  empty: { textAlign: "center", color: "#999", marginTop: 48, fontSize: 16 },
  error: { color: "#c00", textAlign: "center", padding: 8 },
});

export default GenerationsScreen;
