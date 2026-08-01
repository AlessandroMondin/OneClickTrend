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
import {
  Asset,
  launchCamera,
  launchImageLibrary,
} from "react-native-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  createCharacter,
  requestUploadUrls,
  uploadToPresignedUrl,
} from "../api/client";
import type { CharactersStackParamList } from "../navigation";

const MAX_PHOTOS = 4;

type Props = NativeStackScreenProps<CharactersStackParamList, "AddCharacter">;

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

  const movePhoto = (index: number, direction: -1 | 1) => {
    setPhotos((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Name required");
      return;
    }
    setSaving(true);
    try {
      const assets = [
        ...photos.map((a, i) => ({ asset: a, position: i })),
        ...(video ? [{ asset: video, position: 100 }] : []),
      ];
      const character = await createCharacter(name.trim());
      if (assets.length > 0) {
        const files = assets.map(({ asset, position }, i) => ({
          filename: asset.fileName ?? `media-${i}`,
          contentType: asset.type ?? "application/octet-stream",
          position,
        }));
        const targets = await requestUploadUrls(character.id, files);
        await Promise.all(
          targets.map((t, i) =>
            uploadToPresignedUrl(
              t.uploadUrl,
              assets[i].asset.uri!,
              files[i].contentType,
            ),
          ),
        );
      }
      navigation.goBack();
    } catch (e) {
      console.error("save character failed:", e instanceof Error ? `${e.message}` : e);
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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
        Up to {MAX_PHOTOS} pictures and 1 video. The first picture is the
        character image — reorder with the arrows.
      </Text>

      <View style={styles.thumbGrid}>
        {photos.map((a, i) => (
          <View key={`${a.uri}-${i}`} style={styles.thumbWrap}>
            <Image source={{ uri: a.uri }} style={styles.thumb} />
            {i === 0 && (
              <View style={styles.mainBadge}>
                <Text style={styles.mainBadgeText}>MAIN</Text>
              </View>
            )}
            <View style={styles.thumbControls}>
              <Pressable
                style={styles.controlButton}
                onPress={() => movePhoto(i, -1)}
              >
                <Text style={styles.controlText}>◀</Text>
              </Pressable>
              <Pressable
                style={styles.controlButton}
                onPress={() => removePhoto(i)}
              >
                <Text style={styles.controlText}>✕</Text>
              </Pressable>
              <Pressable
                style={styles.controlButton}
                onPress={() => movePhoto(i, 1)}
              >
                <Text style={styles.controlText}>▶</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {video && (
          <View style={styles.thumbWrap}>
            <View style={[styles.thumb, styles.videoThumb]}>
              <Text style={styles.videoLabel}>VIDEO</Text>
            </View>
            <View style={styles.thumbControls}>
              <Pressable
                style={styles.controlButton}
                onPress={() => setVideo(null)}
              >
                <Text style={styles.controlText}>✕</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

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
  thumbGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: { width: "23%" },
  thumb: { width: "100%", aspectRatio: 1, borderRadius: 8 },
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
  videoThumb: {
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  videoLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  thumbControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  controlButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 2,
  },
  controlText: { fontSize: 13, color: "#333" },
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
