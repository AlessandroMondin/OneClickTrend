import React, { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Video from "react-native-video";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { getCharacter, mediaUrl } from "../api/client";
import type { CharactersStackParamList } from "../navigation";
import type { CharacterDetail } from "../types";

type Props = NativeStackScreenProps<
  CharactersStackParamList,
  "CharacterDetail"
>;

function CharacterDetailScreen({ route, navigation }: Props) {
  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: route.params.name });
      getCharacter(route.params.id)
        .then((c) => {
          setCharacter(c);
          setError(null);
        })
        .catch((e) => setError(String(e.message ?? e)));
    }, [navigation, route.params.id, route.params.name]),
  );

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={character?.media ?? []}
        keyExtractor={(m) => m.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) =>
          item.kind === "VIDEO" ? (
            <Video
              source={{ uri: mediaUrl(item.url) }}
              style={styles.tile}
              controls
              paused
              resizeMode="cover"
            />
          ) : (
            <Image source={{ uri: mediaUrl(item.url) }} style={styles.tile} />
          )
        }
        ListEmptyComponent={<Text style={styles.empty}>No media</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  grid: { padding: 12, gap: 12 },
  gridRow: { gap: 12 },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
  },
  empty: { textAlign: "center", color: "#999", marginTop: 48, fontSize: 16 },
  error: { color: "#c00", textAlign: "center", padding: 8 },
});

export default CharacterDetailScreen;
