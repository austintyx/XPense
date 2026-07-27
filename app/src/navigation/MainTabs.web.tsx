import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { View } from "react-native";

import Activity from "../screens/Activity";
import Home from "../screens/Home";
import Settings from "../screens/Settings";
import Summary from "../screens/Summary";
import { Sidebar } from "./Sidebar";

export type MainTabParamList = {
  Home: undefined;
  Summary: undefined;
  Activity: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// The bottom-tabs navigator's own container is a fixed column flex (screen, then tab bar
// stacked vertically) -- there's no prop to turn that into a left-column layout, so instead of
// swapping the `tabBar` render prop (as TabBar.tsx does), the sidebar sits outside the tab
// navigator entirely in a flexDirection:"row" wrapper, and the built-in tab bar is just hidden.
export function MainTabs() {
  const navigation = useNavigation<any>();
  const [activeRoute, setActiveRoute] = useState<keyof MainTabParamList>("Home");

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <Sidebar
        activeRoute={activeRoute}
        onNavigate={(routeName) => navigation.navigate("MainTabs", { screen: routeName })}
      />
      <View style={{ flex: 1 }}>
        <Tab.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={() => null}
          screenListeners={{
            state: (e: any) => {
              const state = e.data.state;
              setActiveRoute(state.routes[state.index].name);
            },
          }}
        >
          <Tab.Screen name="Home" component={Home} />
          <Tab.Screen name="Summary" component={Summary} />
          <Tab.Screen name="Activity" component={Activity} />
          <Tab.Screen name="Settings" component={Settings} />
        </Tab.Navigator>
      </View>
    </View>
  );
}
