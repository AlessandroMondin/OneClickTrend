import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  deleteGeneration,
  generationVideoUrl,
  listGenerations,
} from "../api/client";
import VideoThumbnail from "../components/VideoThumbnail";
import type { GenerationsStackParamList } from "../navigation";
import type { Generation } from "../types";

type Props = NativeStackScreenProps<
  GenerationsStackParamList,
  "GenerationsList"
>;

function GenerationsScreen({ navigation }: Props) {
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
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate("GenerationDetail", { id: item.id })
            }
          >
            {item.sharedLink?.thumbnailUrl ? (
              <Image
                source={{ uri: item.sharedLink.thumbnailUrl }}
                style={styles.thumbnail}
              />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                <Text style={styles.thumbnailGlyph}>♪</Text>
              </View>
            )}
            {item.status === "completed" && (
              <VideoThumbnail
                uri={generationVideoUrl(item.id)}
                style={styles.thumbnail}
              />
            )}
            <View style={styles.info}>
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
            <Pressable
              style={styles.deleteButton}
              hitSlop={6}
              onPress={() => confirmDelete(item.id)}
            >
              <Text style={styles.deleteText}>✕</Text>
            </Pressable>
          </Pressable>
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
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumbnail: {
    width: 48,
    height: 64,
    borderRadius: 8,
    backgroundColor: "#ddd",
    overflow: "hidden",
  },
  thumbnailPlaceholder: {
    backgroundColor: "#010101",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailGlyph: { color: "#fff", fontSize: 20, fontWeight: "700" },
  info: { flex: 1, gap: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  status: { fontSize: 16, fontWeight: "600" },
  statusFailed: { color: "#c00" },
  statusCompleted: { color: "#0a7d33" },
  date: { fontSize: 12, color: "#666" },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e5e5ea",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#c00", fontSize: 13, fontWeight: "700" },
  empty: { textAlign: "center", color: "#999", marginTop: 48, fontSize: 16 },
  error: { color: "#c00", textAlign: "center", padding: 8 },
});

export default GenerationsScreen;
