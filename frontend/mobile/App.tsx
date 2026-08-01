import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { NavigationContainer } from "@react-navigation/native";

import { listSharedLinks } from "./src/api/client";
import { SharedLinksContext } from "./src/context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { initRemoteLogging } from "./src/log";
import type { CharactersStackParamList } from "./src/navigation";

initRemoteLogging();
import AddCharacterScreen from "./src/screens/AddCharacterScreen";
import CharacterDetailScreen from "./src/screens/CharacterDetailScreen";
import CharactersListScreen from "./src/screens/CharactersListScreen";
import GenerationsScreen from "./src/screens/GenerationsScreen";
import SharedLinksScreen from "./src/screens/SharedLinksScreen";

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
}

function App(): React.JSX.Element {
  const [unseenCount, setUnseenCount] = useState(0);

  const refreshUnseen = useCallback(() => {
    listSharedLinks()
      .then((links) => setUnseenCount(links.filter((l) => !l.seen).length))
      .catch((e) => console.warn("unseen check failed:", String(e)));
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(handleSharedUrl);
    const linkSub = Linking.addEventListener("url", ({ url }) =>
      handleSharedUrl(url),
    );

    refreshUnseen();
    const stateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshUnseen();
      }
    });

    return () => {
      linkSub.remove();
      stateSub.remove();
    };
  }, [refreshUnseen]);

  return (
    <SharedLinksContext.Provider value={{ refreshUnseen }}>
      <NavigationContainer>
        <Tab.Navigator>
          <Tab.Screen
            name="Characters"
            component={CharactersStack}
            options={{ headerShown: false }}
          />
          <Tab.Screen
            name="SharedLinks"
            component={SharedLinksScreen}
            options={{
              title: "Shared Links",
              tabBarBadge: unseenCount > 0 ? unseenCount : undefined,
            }}
          />
          <Tab.Screen
            name="Generations"
            component={GenerationsScreen}
            options={{ title: "My Generations" }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SharedLinksContext.Provider>
  );
}

export default App;
