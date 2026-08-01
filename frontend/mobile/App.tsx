import React, { useEffect } from "react";
import { Alert, AppState, Linking } from "react-native";
import { NavigationContainer } from "@react-navigation/native";

import { consumeSharedLink, pendingSharedLinks } from "./src/api/client";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { initRemoteLogging } from "./src/log";
import type { CharactersStackParamList } from "./src/navigation";

initRemoteLogging();
import AddCharacterScreen from "./src/screens/AddCharacterScreen";
import CharacterDetailScreen from "./src/screens/CharacterDetailScreen";
import CharactersListScreen from "./src/screens/CharactersListScreen";
import GenerationsScreen from "./src/screens/GenerationsScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<CharactersStackParamList>();

function CharactersStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CharactersList"
        component={CharactersListScreen}
        options={{ title: "Characters" }}
      />
      <Stack.Screen
        name="AddCharacter"
        component={AddCharacterScreen}
        options={{ title: "Add a Character", gestureEnabled: false }}
      />
      <Stack.Screen
        name="CharacterDetail"
        component={CharacterDetailScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}

function handleSharedUrl(deepLink: string | null) {
  if (deepLink) {
    console.log("deep link received:", deepLink);
  }
  if (!deepLink?.startsWith("oneclicktrend://shared")) {
    return;
  }
  const encoded = deepLink.split("url=")[1] ?? "";
  const shared = decodeURIComponent(encoded);
  console.log("received shared link:", shared);
  Alert.alert("Shared link received", shared);
}

async function checkPendingSharedLinks() {
  try {
    const links = await pendingSharedLinks();
    for (const link of links) {
      console.log("pending shared link:", link.url);
      Alert.alert("Shared link received", link.url);
      await consumeSharedLink(link.id);
    }
  } catch (e) {
    console.warn("pending shared links check failed:", String(e));
  }
}

function App(): React.JSX.Element {
  useEffect(() => {
    Linking.getInitialURL().then(handleSharedUrl);
    const linkSub = Linking.addEventListener("url", ({ url }) =>
      handleSharedUrl(url),
    );

    checkPendingSharedLinks();
    const stateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkPendingSharedLinks();
      }
    });

    return () => {
      linkSub.remove();
      stateSub.remove();
    };
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen
          name="Characters"
          component={CharactersStack}
          options={{ headerShown: false }}
        />
        <Tab.Screen
          name="Generations"
          component={GenerationsScreen}
          options={{ title: "My Generations" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default App;
