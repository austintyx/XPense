import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import Activity from "../screens/Activity";
import Home from "../screens/Home";
import Settings from "../screens/Settings";
import Summary from "../screens/Summary";
import { TabBar } from "./TabBar";

export type MainTabParamList = {
  Home: undefined;
  Summary: undefined;
  Activity: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Summary" component={Summary} />
      <Tab.Screen name="Activity" component={Activity} />
      <Tab.Screen name="Settings" component={Settings} />
    </Tab.Navigator>
  );
}
