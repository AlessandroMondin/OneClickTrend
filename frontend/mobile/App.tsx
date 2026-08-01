import React, { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { API_URL } from "./src/config";

function App(): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/hello`);
      const data: { message: string } = await res.json();
      console.log(data.message);
      setMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Pressable style={styles.button} onPress={onPress}>
          <Text style={styles.buttonText}>hello world</Text>
        </Pressable>
        {message && <Text style={styles.message}>{message}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  button: {
    backgroundColor: "#111",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  message: {
    fontSize: 24,
  },
  error: {
    color: "#c00",
    fontSize: 14,
  },
});

export default App;
