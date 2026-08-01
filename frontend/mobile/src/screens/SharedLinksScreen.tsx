import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  animateSharedLink,
  listSharedLinks,
  markSharedLinksSeen,
  SharedLink,
} from "../api/client";
import { useSharedLinksContext } from "../context";

function SourceIcon({ source }: { source: string }) {
  if (source === "tiktok") {
    return (
      <View style={[styles.icon, styles.tiktokIcon]}>
        <Text style={styles.tiktokGlyph}>♪</Text>
      </View>
    );
  }
  if (source === "instagram") {
    return (
      <View style={[styles.icon, styles.instagramIcon]}>
        <Text style={styles.iconGlyph}>◎</Text>
      </View>
    );
  }
  return (
    <View style={[styles.icon, styles.otherIcon]}>
      <Text style={styles.iconGlyph}>🔗</Text>
    </View>
  );
}

function SharedLinksScreen() {
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { refreshUnseen } = useSharedLinksContext();

  useFocusEffect(
    useCallback(() => {
      listSharedLinks()
        .then(async (list) => {
          setLinks(list);
          setError(null);
          if (list.some((l) => !l.seen)) {
            await markSharedLinksSeen();
          }
          refreshUnseen();
        })
        .catch((e) => setError(String(e.message ?? e)));
    }, [refreshUnseen]),
  );

  const animate = async (link: SharedLink) => {
    try {
      await animateSharedLink(link.id);
      Alert.alert("Animation queued", "Check My Generations.");
    } catch (e) {
      console.error("animate failed:", e instanceof Error ? e.message : e);
      Alert.alert("Failed", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={links}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <SourceIcon source={item.source} />
            <Pressable
              style={styles.linkInfo}
              onPress={() => Linking.openURL(item.url)}
            >
              <Text style={styles.url} numberOfLines={1}>
                {item.url}
              </Text>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </Pressable>
            <Pressable
              style={styles.animateButton}
              onPress={() => animate(item)}
            >
              <Text style={styles.animateText}>Animate</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No shared links yet.{"\n"}Share a TikTok video to OneClickTrend to
            see it here.
          </Text>
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
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tiktokIcon: { backgroundColor: "#010101" },
  tiktokGlyph: { color: "#fff", fontSize: 22, fontWeight: "700" },
  instagramIcon: { backgroundColor: "#C13584" },
  otherIcon: { backgroundColor: "#ddd" },
  iconGlyph: { fontSize: 18, color: "#fff" },
  linkInfo: { flex: 1 },
  url: { fontSize: 14, fontWeight: "500" },
  date: { fontSize: 12, color: "#666", marginTop: 2 },
  animateButton: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  animateText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  empty: {
    textAlign: "center",
    color: "#999",
    marginTop: 48,
    fontSize: 15,
    lineHeight: 22,
  },
  error: { color: "#c00", textAlign: "center", padding: 8 },
});

export default SharedLinksScreen;
