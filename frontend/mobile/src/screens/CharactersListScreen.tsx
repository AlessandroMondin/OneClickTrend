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
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { deleteCharacter, listCharacters, mediaUrl } from "../api/client";
import type { CharactersStackParamList } from "../navigation";
import type { Character } from "../types";

type Props = NativeStackScreenProps<CharactersStackParamList, "CharactersList">;

function CharactersListScreen({ navigation }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    listCharacters()
      .then((list) => {
        setCharacters(list);
        setError(null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  useFocusEffect(refetch);

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(`Delete ${name}?`, "This removes all its media.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCharacter(id);
            refetch();
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
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={characters}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate("CharacterDetail", {
                id: item.id,
                name: item.name,
              })
            }
          >
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: mediaUrl(item.thumbnailUrl) }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.count}>
              {item._count?.media ?? 0} media
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => confirmDelete(item.id, item.name)}
            >
              <Text style={styles.deleteText}>✕</Text>
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No characters yet</Text>
        }
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={styles.addButton}
        onPress={() => navigation.navigate("AddCharacter")}
      >
        <Text style={styles.addButtonText}>Add a Character</Text>
      </Pressable>
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
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    backgroundColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 20, fontWeight: "700", color: "#666" },
  name: { fontSize: 17, fontWeight: "600", flex: 1 },
  count: { fontSize: 14, color: "#666" },
  deleteText: { color: "#c00", fontSize: 16, paddingHorizontal: 4 },
  empty: { textAlign: "center", color: "#999", marginTop: 48, fontSize: 16 },
  error: { color: "#c00", textAlign: "center", padding: 8 },
  addButton: {
    margin: 16,
    backgroundColor: "#111",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});

export default CharactersListScreen;
