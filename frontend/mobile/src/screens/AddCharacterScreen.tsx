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

type Props = NativeStackScreenProps<CharactersStackParamList, "AddCharacter">;

function AddCharacterScreen({ navigation }: Props) {
  const [name, setName] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [saving, setSaving] = useState(false);

  const addAssets = (picked?: Asset[]) => {
    if (picked?.length) {
      setAssets((prev) => [...prev, ...picked]);
    }
  };

  const pickPhotos = async () => {
    const r = await launchImageLibrary({
      mediaType: "photo",
      selectionLimit: 0,
    });
    addAssets(r.assets);
  };

  const pickVideo = async () => {
    const r = await launchImageLibrary({
      mediaType: "video",
      selectionLimit: 1,
    });
    addAssets(r.assets);
  };

  const takePhoto = async () => {
    const r = await launchCamera({ mediaType: "photo", saveToPhotos: false });
    addAssets(r.assets);
  };

  const takeVideo = async () => {
    const r = await launchCamera({ mediaType: "video", saveToPhotos: false });
    addAssets(r.assets);
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Name required");
      return;
    }
    setSaving(true);
    try {
      const character = await createCharacter(name.trim());
      const files = assets.map((a, i) => ({
        filename: a.fileName ?? `media-${i}`,
        contentType: a.type ?? "application/octet-stream",
      }));
      if (files.length > 0) {
        const targets = await requestUploadUrls(character.id, files);
        await Promise.all(
          targets.map((t, i) =>
            uploadToPresignedUrl(
              t.uploadUrl,
              assets[i].uri!,
              files[i].contentType,
            ),
          ),
        );
      }
      navigation.goBack();
    } catch (e) {
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
        <Pressable style={styles.pickerButton} onPress={pickPhotos}>
          <Text style={styles.pickerText}>Photos from gallery</Text>
        </Pressable>
        <Pressable style={styles.pickerButton} onPress={takePhoto}>
          <Text style={styles.pickerText}>Take photo</Text>
        </Pressable>
      </View>
      <View style={styles.pickerRow}>
        <Pressable style={styles.pickerButton} onPress={pickVideo}>
          <Text style={styles.pickerText}>Video from gallery</Text>
        </Pressable>
        <Pressable style={styles.pickerButton} onPress={takeVideo}>
          <Text style={styles.pickerText}>Record video</Text>
        </Pressable>
      </View>

      <View style={styles.thumbGrid}>
        {assets.map((a, i) => (
          <View key={`${a.uri}-${i}`} style={styles.thumbWrap}>
            {a.type?.startsWith("video/") ? (
              <View style={[styles.thumb, styles.videoThumb]}>
                <Text style={styles.videoLabel}>VIDEO</Text>
              </View>
            ) : (
              <Image source={{ uri: a.uri }} style={styles.thumb} />
            )}
          </View>
        ))}
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
  thumbGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: { width: "23%", aspectRatio: 1 },
  thumb: { width: "100%", height: "100%", borderRadius: 8 },
  videoThumb: {
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  videoLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
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
