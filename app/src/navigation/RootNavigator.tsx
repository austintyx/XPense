import { createNativeStackNavigator } from "@react-navigation/native-stack";

import Circle from "../screens/Circle";
import QuickSort from "../screens/QuickSort";
import { MainTabs } from "./MainTabs";

export type RootStackParamList = {
  MainTabs: undefined;
  QuickSort: undefined;
  Circle: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="QuickSort" component={QuickSort} options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="Circle" component={Circle} options={{ presentation: "transparentModal" }} />
    </Stack.Navigator>
  );
}
