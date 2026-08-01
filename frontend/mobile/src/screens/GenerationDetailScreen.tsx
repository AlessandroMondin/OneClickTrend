import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import ReactNativeBlobUtil from "react-native-blob-util";
import Video, { VideoRef } from "react-native-video";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  generationPhotoUrl,
  generationVideoUrl,
  getGeneration,
} from "../api/client";
import VideoThumbnail from "../components/VideoThumbnail";
import type { GenerationsStackParamList } from "../navigation";
import type { Generation } from "../types";

type Props = NativeStackScreenProps<
  GenerationsStackParamList,
  "GenerationDetail"
>;

async function downloadToCache(id: string): Promise<string> {
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/generation-${id}.mp4`;
  await ReactNativeBlobUtil.config({ path }).fetch(
    "GET",
    generationVideoUrl(id),
  );
  return `file://${path}`;
}

async function downloadPhotoToCache(id: string, index: number): Promise<string> {
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/generation-${id}-${index}.png`;
  await ReactNativeBlobUtil.config({ path }).fetch(
    "GET",
    generationPhotoUrl(id, index),
  );
  return `file://${path}`;
}

function GeneratedPhoto({ id, index }: { id: string; index: number }) {
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  const download = async () => {
    setBusy("download");
    try {
      const fileUrl = await downloadPhotoToCache(id, index);
      await CameraRoll.saveAsset(fileUrl, { type: "photo" });
      Alert.alert("Saved", "Photo saved to your photo library.");
    } catch (e) {
      console.error("photo download failed:", e instanceof Error ? e.message : e);
      Alert.alert("Download failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const fileUrl = await downloadPhotoToCache(id, index);
      await Share.share({ url: fileUrl });
    } catch (e) {
      console.error("photo share failed:", e instanceof Error ? e.message : e);
      Alert.alert("Share failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.photoWrap}>
      <Image
        source={{ uri: generationPhotoUrl(id, index) }}
        style={styles.photo}
        resizeMode="cover"
      />
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButton, busy != null && styles.disabled]}
          onPress={download}
          disabled={busy != null}
        >
          {busy === "download" ? (
            <ActivityIndicator size="small" color="#111" />
          ) : (
            <Text style={styles.actionText}>Download</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.actionButton, busy != null && styles.disabled]}
          onPress={share}
          disabled={busy != null}
        >
          {busy === "share" ? (
            <ActivityIndicator size="small" color="#111" />
          ) : (
            <Text style={styles.actionText}>Share</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function GenerationDetailScreen({ route }: Props) {
  const { id } = route.params;
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const videoRef = useRef<VideoRef>(null);

  useFocusEffect(
    useCallback(() => {
      getGeneration(id)
        .then((g) => {
          setGeneration(g);
          setError(null);
        })
        .catch((e) => setError(String(e.message ?? e)));
    }, [id]),
  );

  const download = async () => {
    setBusy("download");
    try {
      const fileUrl = await downloadToCache(id);
      await CameraRoll.saveAsset(fileUrl, { type: "video" });
      Alert.alert("Saved", "Video saved to your photo library.");
    } catch (e) {
      console.error("download failed:", e instanceof Error ? e.message : e);
      Alert.alert("Download failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const fileUrl = await downloadToCache(id);
      await Share.share({ url: fileUrl });
    } catch (e) {
      console.error("share failed:", e instanceof Error ? e.message : e);
      Alert.alert("Share failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!generation) {
    return (
      <View style={[styles.container, styles.loading]}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {generation.sharedLink && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Link of Source File</Text>
          <Pressable
            onPress={() => Linking.openURL(generation.sharedLink!.url)}
          >
            <Text style={styles.sourceLink} numberOfLines={2}>
              {generation.sharedLink.title || generation.sharedLink.url}
            </Text>
            <Text style={styles.sourceUrl} numberOfLines={1}>
              {generation.sharedLink.url}
            </Text>
          </Pressable>
        </View>
      )}

      {generation.status === "completed" &&
      generation.outputKind === "photos" ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Generated Photos:</Text>
          {(generation.outputS3Keys ?? []).map((_, index) => (
            <GeneratedPhoto key={index} id={id} index={index} />
          ))}
        </View>
      ) : generation.status === "completed" ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Play Generated Content:</Text>
          {playing ? (
            <Video
              ref={videoRef}
              source={{ uri: generationVideoUrl(id) }}
              style={styles.video}
              controls
              resizeMode="contain"
              onEnd={() => setPlaying(false)}
              onError={(e) => {
                console.error("video playback error:", JSON.stringify(e));
                setPlaying(false);
              }}
            />
          ) : (
            <Pressable
              style={styles.videoPlaceholder}
              onPress={() => setPlaying(true)}
            >
              <VideoThumbnail
                uri={generationVideoUrl(id)}
                style={styles.videoThumb}
              />
              <View style={styles.playOverlay}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            </Pressable>
          )}
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, busy != null && styles.disabled]}
              onPress={download}
              disabled={busy != null}
            >
              {busy === "download" ? (
                <ActivityIndicator size="small" color="#111" />
              ) : (
                <Text style={styles.actionText}>Download</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.actionButton, busy != null && styles.disabled]}
              onPress={share}
              disabled={busy != null}
            >
              {busy === "share" ? (
                <ActivityIndicator size="small" color="#111" />
              ) : (
                <Text style={styles.actionText}>Share</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Status</Text>
          <View style={styles.statusRow}>
            {generation.status === "running" && <ActivityIndicator size="small" />}
            <Text
              style={[
                styles.status,
                generation.status === "failed" && styles.statusFailed,
              ]}
            >
              {generation.status}
            </Text>
          </View>
          {generation.error && (
            <Text style={styles.errorDetail}>{generation.error}</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  loading: { alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#666" },
  sourceLink: { fontSize: 16, fontWeight: "500" },
  sourceUrl: { fontSize: 12, color: "#4a90d9", marginTop: 2 },
  video: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 12,
    backgroundColor: "#000",
  },
  videoPlaceholder: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 12,
    backgroundColor: "#111",
    overflow: "hidden",
  },
  videoThumb: { width: "100%", height: "100%" },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  playIcon: { color: "#fff", fontSize: 48 },
  photoWrap: { gap: 8, marginBottom: 8 },
  photo: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
  },
  actions: { flexDirection: "row", gap: 12 },
  actionButton: {
    flex: 1,
    backgroundColor: "#e5e5ea",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  actionText: { fontSize: 15, fontWeight: "600", color: "#111" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  status: { fontSize: 16, fontWeight: "600" },
  statusFailed: { color: "#c00" },
  errorDetail: { fontSize: 13, color: "#c00" },
  error: { color: "#c00", textAlign: "center", padding: 8 },
});

export default GenerationDetailScreen;
