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
  const [saving, setSaving] = useState(false);

  const addAssets = (picked?: Asset[]) => {
    if (!picked?.length) {
      return;
    }
    const newPhotos = picked.filter((a) => !a.type?.startsWith("video/"));
    setPhotos((prev) => {
      const merged = [...prev, ...newPhotos];
      if (merged.length > MAX_PHOTOS) {
        Alert.alert(`Up to ${MAX_PHOTOS} pictures`);
      }
      return merged.slice(0, MAX_PHOTOS);
    });
  };

  const uploadMedia = async () => {
    const r = await launchImageLibrary({
      mediaType: "photo",
      selectionLimit: MAX_PHOTOS,
    });
    addAssets(r.assets);
  };

  const takePhoto = async () => {
    const r = await launchCamera({ mediaType: "photo", saveToPhotos: false });
    addAssets(r.assets);
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
      await uploadAssets(
        character.id,
        photos.map((asset, i) => ({ asset, position: i })),
      );
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
        <Pressable style={styles.pickerButton} onPress={takePhoto}>
          <Text style={styles.pickerText}>Take Photo</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Up to {MAX_PHOTOS} pictures. Drag to reorder — the first picture is the
        character image. Tap a picture to remove it.
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
