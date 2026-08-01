import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import {
  animateSharedLink,
  deleteSharedLink,
  listCharacters,
  listSharedLinks,
  markSharedLinksSeen,
  mediaUrl,
  SharedLink,
} from "../api/client";
import { useSharedLinksContext } from "../context";
import type { Character } from "../types";

function SourceIcon({
  source,
  thumbnailUrl,
}: {
  source: string;
  thumbnailUrl: string | null;
}) {
  if (thumbnailUrl) {
    return <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />;
  }
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

  const navigation = useNavigation();

  const startAnimation = async (link: SharedLink, characterId: string) => {
    try {
      await animateSharedLink(link.id, characterId);
      (navigation as { navigate: (screen: string) => void }).navigate(
        "Generations",
      );
    } catch (e) {
      console.error("animate failed:", e instanceof Error ? e.message : e);
      Alert.alert("Failed", e instanceof Error ? e.message : String(e));
    }
  };

  const [pickerLink, setPickerLink] = useState<SharedLink | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);

  const animate = async (link: SharedLink) => {
    try {
      const list = await listCharacters();
      if (list.length === 0) {
        Alert.alert(
          "No characters",
          "Create a character with at least one picture first.",
        );
        return;
      }
      setCharacters(list);
      setPickerLink(link);
    } catch (e) {
      console.error("character load failed:", e instanceof Error ? e.message : e);
      Alert.alert("Failed", e instanceof Error ? e.message : String(e));
    }
  };

  const pickCharacter = (character: Character) => {
    const link = pickerLink;
    if (!link) {
      return;
    }
    Alert.alert(
      `Animate with ${character.name}?`,
      "This runs the render pipeline and spends credits.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Animate",
          onPress: () => {
            setPickerLink(null);
            startAnimation(link, character.id);
          },
        },
      ],
    );
  };

  const confirmDelete = (link: SharedLink) => {
    Alert.alert("Delete shared link?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSharedLink(link.id);
            setLinks((prev) => prev.filter((l) => l.id !== link.id));
          } catch (e) {
            console.error(
              "delete link failed:",
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
        data={links}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <SourceIcon source={item.source} thumbnailUrl={item.thumbnailUrl} />
            <Pressable
              style={styles.linkInfo}
              onPress={() => Linking.openURL(item.url)}
            >
              <Text style={styles.url} numberOfLines={2}>
                {item.title || item.url}
              </Text>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable
                style={styles.animateButton}
                onPress={() => animate(item)}
              >
                <Text style={styles.animateText}>Animate</Text>
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                hitSlop={6}
                onPress={() => confirmDelete(item)}
              >
                <Text style={styles.deleteText}>✕</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No shared links yet.{"\n"}Share a TikTok video to OneClickTrend to
            see it here.
          </Text>
        }
      />

      <Modal
        visible={pickerLink != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerLink(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerLink(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Animate with which character?</Text>
            <FlatList
              data={characters}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.characterRow}
                  onPress={() => pickCharacter(item)}
                >
                  {item.thumbnailUrl ? (
                    <Image
                      source={{ uri: mediaUrl(item.thumbnailUrl) }}
                      style={styles.characterAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.characterAvatar,
                        styles.characterAvatarPlaceholder,
                      ]}
                    >
                      <Text style={styles.characterInitial}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.characterName}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Pressable
              style={styles.modalCancel}
              onPress={() => setPickerLink(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  thumbnail: {
    width: 48,
    height: 64,
    borderRadius: 8,
    backgroundColor: "#ddd",
  },
  tiktokIcon: { backgroundColor: "#010101" },
  tiktokGlyph: { color: "#fff", fontSize: 22, fontWeight: "700" },
  instagramIcon: { backgroundColor: "#C13584" },
  otherIcon: { backgroundColor: "#ddd" },
  iconGlyph: { fontSize: 18, color: "#fff" },
  linkInfo: { flex: 1 },
  url: { fontSize: 14, fontWeight: "500" },
  date: { fontSize: 12, color: "#666", marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  animateButton: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  animateText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e5e5ea",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#c00", fontSize: 13, fontWeight: "700" },
  empty: {
    textAlign: "center",
    color: "#999",
    marginTop: 48,
    fontSize: 15,
    lineHeight: 22,
  },
  error: { color: "#c00", textAlign: "center", padding: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  characterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  characterAvatar: { width: 44, height: 44, borderRadius: 22 },
  characterAvatarPlaceholder: {
    backgroundColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  characterInitial: { fontSize: 18, fontWeight: "700", color: "#666" },
  characterName: { fontSize: 16, fontWeight: "500" },
  modalCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 16, color: "#666" },
});

export default SharedLinksScreen;
