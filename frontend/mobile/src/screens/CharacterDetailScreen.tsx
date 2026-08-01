import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Asset,
  launchCamera,
  launchImageLibrary,
} from "react-native-image-picker";
import Video from "react-native-video";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  deleteCharacter,
  deleteMedia,
  getCharacter,
  mediaUrl,
} from "../api/client";
import { uploadAssets } from "../media";
import type { CharactersStackParamList } from "../navigation";
import type { CharacterDetail } from "../types";

const MAX_PHOTOS = 4;

type Props = NativeStackScreenProps<
  CharactersStackParamList,
  "CharacterDetail"
>;

function CharacterDetailScreen({ route, navigation }: Props) {
  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(() => {
    getCharacter(route.params.id)
      .then((c) => {
        setCharacter(c);
        setError(null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [route.params.id]);

  const confirmDeleteCharacter = useCallback(() => {
    Alert.alert(`Delete ${route.params.name}?`, "This removes all its media.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCharacter(route.params.id);
            navigation.goBack();
          } catch (e) {
            console.error(
              "delete character failed:",
              e instanceof Error ? e.message : e,
            );
            Alert.alert(
              "Delete failed",
              e instanceof Error ? e.message : String(e),
            );
          }
        },
      },
    ]);
  }, [navigation, route.params.id, route.params.name]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: route.params.name,
        headerRight: () => (
          <Pressable onPress={confirmDeleteCharacter} hitSlop={8}>
            <Text style={styles.deleteHeader}>Delete</Text>
          </Pressable>
        ),
      });
      refetch();
    }, [navigation, route.params.name, refetch, confirmDeleteCharacter]),
  );

  const photoCount =
    character?.media.filter((m) => m.kind === "PHOTO").length ?? 0;
  const hasVideo = character?.media.some((m) => m.kind === "VIDEO") ?? false;

  const addPicked = async (picked?: Asset[]) => {
    if (!picked?.length || !character) {
      return;
    }
    const photos = picked
      .filter((a) => !a.type?.startsWith("video/"))
      .slice(0, MAX_PHOTOS - photoCount);
    const video = hasVideo
      ? null
      : picked.find((a) => a.type?.startsWith("video/")) ?? null;

    if (photos.length === 0 && !video) {
      Alert.alert(`Already at ${MAX_PHOTOS} pictures / 1 video`);
      return;
    }

    setBusy(true);
    try {
      await uploadAssets(character.id, [
        ...photos.map((asset, i) => ({ asset, position: photoCount + i })),
        ...(video ? [{ asset: video, position: 100 }] : []),
      ]);
      refetch();
    } catch (e) {
      console.error("add media failed:", e instanceof Error ? e.message : e);
      Alert.alert("Upload failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadMedia = async () => {
    const r = await launchImageLibrary({
      mediaType: "mixed",
      selectionLimit: MAX_PHOTOS - photoCount + (hasVideo ? 0 : 1),
    });
    await addPicked(r.assets);
  };

  const takePhotoOrVideo = () => {
    Alert.alert("Take Photo or Video", undefined, [
      {
        text: "Photo",
        onPress: async () => {
          const r = await launchCamera({
            mediaType: "photo",
            saveToPhotos: false,
          });
          await addPicked(r.assets);
        },
      },
      {
        text: "Video",
        onPress: async () => {
          const r = await launchCamera({
            mediaType: "video",
            saveToPhotos: false,
          });
          await addPicked(r.assets);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const confirmRemove = (id: string) => {
    Alert.alert("Remove media?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMedia(id);
            refetch();
          } catch (e) {
            console.error(
              "delete media failed:",
              e instanceof Error ? e.message : e,
            );
            Alert.alert(
              "Delete failed",
              e instanceof Error ? e.message : String(e),
            );
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={character?.media ?? []}
        keyExtractor={(m) => m.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <View style={styles.tileWrap}>
            {item.kind === "VIDEO" ? (
              <Video
                source={{ uri: mediaUrl(item.url) }}
                style={styles.tile}
                controls
                paused
                resizeMode="cover"
              />
            ) : (
              <Image
                source={{ uri: mediaUrl(item.url) }}
                style={styles.tile}
              />
            )}
            <Pressable
              style={styles.removeButton}
              onPress={() => confirmRemove(item.id)}
            >
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No media</Text>}
      />
      <View style={styles.pickerRow}>
        <Pressable
          style={[styles.pickerButton, busy && styles.disabled]}
          onPress={uploadMedia}
          disabled={busy}
        >
          <Text style={styles.pickerText}>Upload Media</Text>
        </Pressable>
        <Pressable
          style={[styles.pickerButton, busy && styles.disabled]}
          onPress={takePhotoOrVideo}
          disabled={busy}
        >
          <Text style={styles.pickerText}>Take Photo or Video</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  grid: { padding: 12, gap: 12 },
  gridRow: { gap: 12 },
  tileWrap: { flex: 1 },
  tile: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
  },
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  empty: { textAlign: "center", color: "#999", marginTop: 48, fontSize: 16 },
  error: { color: "#c00", textAlign: "center", padding: 8 },
  pickerRow: { flexDirection: "row", gap: 12, padding: 16 },
  pickerButton: {
    flex: 1,
    backgroundColor: "#f2f2f7",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  pickerText: { fontSize: 15, fontWeight: "500" },
  disabled: { opacity: 0.5 },
  deleteHeader: { color: "#c00", fontSize: 16 },
});

export default CharacterDetailScreen;
