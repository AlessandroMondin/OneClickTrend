import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import Video from "react-native-video";

// Shows the first frame of a video as a static thumbnail.
function VideoThumbnail({
  uri,
  style,
}: {
  uri: string;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style} pointerEvents="none">
      <Video
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        paused
        muted
        resizeMode="cover"
      />
    </View>
  );
}

export default VideoThumbnail;
