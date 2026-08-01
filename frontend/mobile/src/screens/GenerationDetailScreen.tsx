import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import ReactNativeBlobUtil from "react-native-blob-util";
import Video, { VideoRef } from "react-native-video";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  generationPhotoUrl,
  generationSoundUrl,
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

// TikTok-style carousel: full-width swipeable pager with a page counter and
// the post's sound looping while it is on screen.
function PhotoCarousel({
  id,
  count,
  hasSound,
}: {
  id: string;
  count: number;
  hasSound: boolean;
}) {
  const { width } = useWindowDimensions();
  const pageWidth = width - 32;
  const [page, setPage] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  // Stop the sound when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      setSoundOn(true);
      return () => setSoundOn(false);
    }, []),
  );

  const download = async () => {
    setBusy("download");
    try {
      const fileUrl = await downloadPhotoToCache(id, page);
      await CameraRoll.saveAsset(fileUrl, { type: "photo" });
      Alert.alert("Saved", `Photo ${page + 1} saved to your photo library.`);
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
      const fileUrl = await downloadPhotoToCache(id, page);
      await Share.share({ url: fileUrl });
    } catch (e) {
      console.error("photo share failed:", e instanceof Error ? e.message : e);
      Alert.alert("Share failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.carouselWrap}>
      {hasSound && (
        <Video
          source={{ uri: generationSoundUrl(id) }}
          style={styles.hiddenAudio}
          paused={!soundOn}
          repeat
          ignoreSilentSwitch="ignore"
        />
      )}
      <View>
        <FlatList
          data={Array.from({ length: count }, (_, i) => i)}
          keyExtractor={(i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={pageWidth}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) =>
            setPage(
              Math.max(
                0,
                Math.min(
                  count - 1,
                  Math.round(e.nativeEvent.contentOffset.x / pageWidth),
                ),
              ),
            )
          }
          renderItem={({ item }) => (
            <Image
              source={{ uri: generationPhotoUrl(id, item) }}
              style={[styles.carouselPhoto, { width: pageWidth }]}
              resizeMode="cover"
            />
          )}
        />
        <View style={styles.pageBadge}>
          <Text style={styles.pageBadgeText}>
            {page + 1}/{count}
          </Text>
        </View>
        {hasSound && (
          <Pressable
            style={styles.soundToggle}
            onPress={() => setSoundOn((v) => !v)}
          >
            <Text style={styles.soundToggleText}>{soundOn ? "🔊" : "🔇"}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.dots}>
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i === page && styles.dotActive]}
          />
        ))}
      </View>
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
          {generation.soundName && (
            <View style={styles.soundRow}>
              <Text style={styles.sectionLabel}>Sound</Text>
              <Text style={styles.soundName}>
                {generation.soundName} — {generation.soundAuthor ?? "?"}
              </Text>
              {generation.soundS3Key && (
                <Pressable
                  style={styles.soundButton}
                  onPress={async () => {
                    try {
                      const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/sound-${generation.id}.mp3`;
                      await ReactNativeBlobUtil.config({ path }).fetch(
                        "GET",
                        generationSoundUrl(generation.id),
                      );
                      await Share.share({ url: `file://${path}` });
                    } catch (e) {
                      Alert.alert(
                        "Share failed",
                        e instanceof Error ? e.message : String(e),
                      );
                    }
                  }}
                >
                  <Text style={styles.actionText}>Share Sound</Text>
                </Pressable>
              )}
            </View>
          )}
          <Text style={styles.sectionLabel}>Generated Carousel:</Text>
          <PhotoCarousel
            id={id}
            count={(generation.outputS3Keys ?? []).length}
            hasSound={Boolean(generation.soundS3Key)}
          />
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
  soundRow: { gap: 6, marginBottom: 8 },
  carouselWrap: { gap: 10 },
  hiddenAudio: { width: 0, height: 0 },
  carouselPhoto: {
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: "#f2f2f7",
  },
  pageBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pageBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  soundToggle: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  soundToggleText: { fontSize: 16 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#d0d0d5",
  },
  dotActive: { backgroundColor: "#111" },
  soundName: { fontSize: 15, fontWeight: "500" },
  soundButton: {
    backgroundColor: "#e5e5ea",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
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
