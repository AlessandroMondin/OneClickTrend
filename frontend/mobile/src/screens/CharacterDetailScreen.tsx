import React, { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DraggableGrid } from "react-native-draggable-grid";
import {
  Asset,
  launchCamera,
  launchImageLibrary,
} from "react-native-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  deleteMedia,
  getCharacter,
  mediaUrl,
  reorderMedia,
} from "../api/client";
import { uploadAssets } from "../media";
import type { CharactersStackParamList } from "../navigation";
import type { CharacterDetail, MediaAsset } from "../types";

const MAX_PHOTOS = 4;

type Props = NativeStackScreenProps<
  CharactersStackParamList,
  "CharacterDetail"
>;

interface GridItem {
  key: string;
  media: MediaAsset;
}

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

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: route.params.name });
      refetch();
    }, [navigation, route.params.name, refetch]),
  );

  const photos = character?.media.filter((m) => m.kind === "PHOTO") ?? [];

  const addPicked = async (picked?: Asset[]) => {
    if (!picked?.length || !character) {
      return;
    }
    const newPhotos = picked
      .filter((a) => !a.type?.startsWith("video/"))
      .slice(0, MAX_PHOTOS - photos.length);

    if (newPhotos.length === 0) {
      Alert.alert(`Already at ${MAX_PHOTOS} pictures`);
      return;
    }

    setBusy(true);
    try {
      await uploadAssets(
        character.id,
        newPhotos.map((asset, i) => ({
          asset,
          position: photos.length + i,
        })),
      );
      refetch();
    } catch (e) {
      console.error("add media failed:", e instanceof Error ? e.message : e);
      Alert.alert("Upload failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadMediaAction = async () => {
    const r = await launchImageLibrary({
      mediaType: "photo",
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    await addPicked(r.assets);
  };

  const takePhoto = async () => {
    const r = await launchCamera({ mediaType: "photo", saveToPhotos: false });
    await addPicked(r.assets);
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

  const onReorder = async (data: GridItem[]) => {
    if (!character) {
      return;
    }
    const orderedPhotos = data.map((d) => d.media);
    // Optimistic: show the new order immediately, then persist.
    setCharacter({ ...character, media: orderedPhotos });
    try {
      await reorderMedia(
        character.id,
        orderedPhotos.map((m) => m.id),
      );
    } catch (e) {
      console.error("reorder failed:", e instanceof Error ? e.message : e);
      refetch();
    }
  };

  const gridData: GridItem[] = photos.map((media) => ({
    key: media.id,
    media,
  }));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {error && <Text style={styles.error}>{error}</Text>}
        {photos.length > 0 && (
          <Text style={styles.hint}>
            Drag to reorder — the first picture is the character image. Tap a
            picture to remove it.
          </Text>
        )}
        <DraggableGrid<GridItem>
          numColumns={2}
          delayLongPress={80}
          data={gridData}
          onDragRelease={onReorder}
          onItemPress={(item) => confirmRemove(item.media.id)}
          renderItem={(item, order) => (
            <View style={styles.tileWrap} key={item.key}>
              <Image
                source={{ uri: mediaUrl(item.media.url) }}
                style={styles.tile}
              />
              {order === 0 && (
                <View style={styles.mainBadge}>
                  <Text style={styles.mainBadgeText}>MAIN</Text>
                </View>
              )}
            </View>
          )}
        />
        {!character?.media.length && (
          <Text style={styles.empty}>No media</Text>
        )}
      </ScrollView>
      <View style={styles.pickerRow}>
        <Pressable
          style={[styles.pickerButton, busy && styles.disabled]}
          onPress={uploadMediaAction}
          disabled={busy}
        >
          <Text style={styles.pickerText}>Upload Media</Text>
        </Pressable>
        <Pressable
          style={[styles.pickerButton, busy && styles.disabled]}
          onPress={takePhoto}
          disabled={busy}
        >
          <Text style={styles.pickerText}>Take Photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 12, gap: 12 },
  hint: { fontSize: 13, color: "#666", paddingHorizontal: 4 },
  tileWrap: { width: 170, height: 170 },
  tile: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
  },
  mainBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#111",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  mainBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
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
});

export default CharacterDetailScreen;
