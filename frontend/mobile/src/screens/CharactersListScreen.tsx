import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { listCharacters } from "../api/client";
import type { CharactersStackParamList } from "../navigation";
import type { Character } from "../types";

type Props = NativeStackScreenProps<CharactersStackParamList, "CharactersList">;

function CharactersListScreen({ navigation }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listCharacters()
        .then((list) => {
          setCharacters(list);
          setError(null);
        })
        .catch((e) => setError(String(e.message ?? e)));
    }, []),
  );

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
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.count}>
              {item._count?.media ?? 0} media
            </Text>
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
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 17, fontWeight: "600" },
  count: { fontSize: 14, color: "#666" },
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
