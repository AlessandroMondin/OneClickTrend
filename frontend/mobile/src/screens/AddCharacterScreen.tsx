import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { DraggableGrid } from "react-native-draggable-grid";
import {
  Asset,
  launchCamera,
  launchImageLibrary,
} from "react-native-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { createCharacter } from "../api/client";
import { uploadAssets } from "../media";
import type { CharactersStackParamList } from "../navigation";

const MAX_PHOTOS = 4;

type Props = NativeStackScreenProps<CharactersStackParamList, "AddCharacter">;

interface GridItem {
  key: string;
  asset: Asset;
}

function AddCharacterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [video, setVideo] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);

  const addAssets = (picked?: Asset[]) => {
    if (!picked?.length) {
      return;
    }
    const newPhotos = picked.filter((a) => !a.type?.startsWith("video/"));
    const newVideos = picked.filter((a) => a.type?.startsWith("video/"));

    setPhotos((prev) => {
      const merged = [...prev, ...newPhotos];
      if (merged.length > MAX_PHOTOS) {
        Alert.alert(`Up to ${MAX_PHOTOS} pictures`);
      }
      return merged.slice(0, MAX_PHOTOS);
    });
    if (newVideos.length > 0) {
      if (video) {
        Alert.alert("Only one video");
      }
      setVideo(newVideos[0]);
    }
  };

  const uploadMedia = async () => {
    const r = await launchImageLibrary({
      mediaType: "mixed",
      selectionLimit: MAX_PHOTOS + 1,
    });
    addAssets(r.assets);
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
          addAssets(r.assets);
        },
      },
      {
        text: "Video",
        onPress: async () => {
          const r = await launchCamera({
            mediaType: "video",
            saveToPhotos: false,
          });
          addAssets(r.assets);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const confirmRemovePhoto = (key: string) => {
    Alert.alert("Remove picture?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          setPhotos((prev) => prev.filter((a, i) => `${a.uri}-${i}` !== key)),
      },
    ]);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Name required");
      return;
    }
    setSaving(true);
    try {
      const character = await createCharacter(name.trim());
      await uploadAssets(character.id, [
        ...photos.map((asset, i) => ({ asset, position: i })),
        ...(video ? [{ asset: video, position: 100 }] : []),
      ]);
      navigation.goBack();
    } catch (e) {
      console.error(
        "save character failed:",
        e instanceof Error ? `${e.message}` : e,
      );
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const gridData: GridItem[] = photos.map((asset, i) => ({
    key: `${asset.uri}-${i}`,
    asset,
  }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TextInput
        style={styles.input}
        placeholder="Character name"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
      />

      <View style={styles.pickerRow}>
        <Pressable style={styles.pickerButton} onPress={uploadMedia}>
          <Text style={styles.pickerText}>Upload Media</Text>
        </Pressable>
        <Pressable style={styles.pickerButton} onPress={takePhotoOrVideo}>
          <Text style={styles.pickerText}>Take Photo or Video</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Up to {MAX_PHOTOS} pictures and 1 video. Drag to reorder — the first
        picture is the character image. Tap a picture to remove it.
      </Text>

      {photos.length > 0 && (
        <DraggableGrid<GridItem>
          numColumns={4}
          delayLongPress={80}
          data={gridData}
          onDragRelease={(data) => setPhotos(data.map((d) => d.asset))}
          onItemPress={(item) => confirmRemovePhoto(item.key)}
          renderItem={(item, order) => (
            <View style={styles.thumbWrap} key={item.key}>
              <Image source={{ uri: item.asset.uri }} style={styles.thumb} />
              {order === 0 && (
                <View style={styles.mainBadge}>
                  <Text style={styles.mainBadgeText}>MAIN</Text>
                </View>
              )}
            </View>
          )}
        />
      )}

      {video && (
        <View style={styles.videoRow}>
          <View style={[styles.thumb, styles.videoThumb, styles.videoTile]}>
            <Text style={styles.videoLabel}>VIDEO</Text>
          </View>
          <Pressable
            style={styles.removeVideoButton}
            onPress={() => setVideo(null)}
          >
            <Text style={styles.removeVideoText}>Remove video</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={[styles.saveButton, saving && styles.saveDisabled]}
        onPress={save}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>Save</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    fontSize: 17,
  },
  pickerRow: { flexDirection: "row", gap: 12 },
  pickerButton: {
    flex: 1,
    backgroundColor: "#f2f2f7",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  pickerText: { fontSize: 15, fontWeight: "500" },
  hint: { fontSize: 13, color: "#666" },
  thumbWrap: { width: 80, height: 80 },
  thumb: { width: "100%", height: "100%", borderRadius: 8 },
  mainBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "#111",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  mainBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  videoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  videoTile: { width: 80, height: 80 },
  videoThumb: {
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  videoLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  removeVideoButton: { padding: 8 },
  removeVideoText: { color: "#c00", fontSize: 14 },
  saveButton: {
    backgroundColor: "#111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});

export default AddCharacterScreen;
