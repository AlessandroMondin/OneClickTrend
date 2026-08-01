import React from "react";
import { NavigationContainer } from "@react-navigation/native";
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
        options={{ title: "Add a Character" }}
      />
      <Stack.Screen name="CharacterDetail" component={CharacterDetailScreen} />
    </Stack.Navigator>
  );
}

function App(): React.JSX.Element {
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
