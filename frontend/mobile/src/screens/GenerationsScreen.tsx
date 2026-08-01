import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { listGenerations } from "../api/client";
import type { Generation } from "../types";

function GenerationsScreen() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listGenerations()
        .then((list) => {
          setGenerations(list);
          setError(null);
        })
        .catch((e) => setError(String(e.message ?? e)));
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
            <View style={styles.rowMain}>
              <Text style={styles.status}>{item.status}</Text>
              {item.sharedLink && (
                <Text style={styles.source} numberOfLines={1}>
                  {item.sharedLink.source}: {item.sharedLink.url}
                </Text>
              )}
            </View>
            <Text style={styles.date}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>
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
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowMain: { flex: 1, marginRight: 8 },
  status: { fontSize: 16, fontWeight: "600" },
  source: { fontSize: 12, color: "#666", marginTop: 2 },
  date: { fontSize: 12, color: "#666" },
  empty: { textAlign: "center", color: "#999", marginTop: 48, fontSize: 16 },
  error: { color: "#c00", textAlign: "center", padding: 8 },
});

export default GenerationsScreen;
