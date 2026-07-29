import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { View } from "react-native";

import { AddTransactionSheet } from "../screens/AddTransactionSheet";
import Activity from "../screens/Activity";
import Budgets from "../screens/Budgets";
import Home from "../screens/Home";
import Settings from "../screens/Settings";
import Summary from "../screens/Summary";
import { useIsMobileWeb } from "../hooks/useIsMobileWeb";
import { SearchProvider } from "../store/SearchProvider";
import { useAppData } from "../store/TransactionsProvider";
import { colors } from "../theme/tokens";
import { uncategorized } from "../utils/derive";
import { PageHeader } from "./PageHeader";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";

export type MainTabParamList = {
  Home: undefined;
  Summary: undefined;
  Activity: undefined;
  Budgets: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// The bottom-tabs navigator's own container is a fixed column flex (screen, then tab bar
// stacked vertically) -- there's no prop to turn that into a left-column layout, so on wide
// (desktop) viewports the sidebar sits outside the tab navigator entirely in a
// flexDirection:"row" wrapper, and the built-in tab bar is hidden. On narrow (mobile) viewports
// this flips: no sidebar, and the same TabBar native already uses takes over instead.
export function MainTabs() {
  const navigation = useNavigation<any>();
  const { transactions, accounts } = useAppData();
  const [activeRoute, setActiveRoute] = useState<keyof MainTabParamList>("Home");
  const [addOpen, setAddOpen] = useState(false);
  const isMobile = useIsMobileWeb();

  const reviewCount = uncategorized(transactions).length;

  return (
    <SearchProvider>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.canvas }}>
        {!isMobile && (
          <Sidebar
            activeRoute={activeRoute}
            onNavigate={(routeName) => navigation.navigate("MainTabs", { screen: routeName })}
            reviewCount={reviewCount}
            accounts={accounts}
            onAddExpense={() => setAddOpen(true)}
          />
        )}
        <View style={{ flex: 1 }}>
          <PageHeader activeRoute={activeRoute} />
          <Tab.Navigator
            screenOptions={{ headerShown: false }}
            tabBar={isMobile ? (props) => <TabBar {...props} /> : () => null}
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
            <Tab.Screen name="Budgets" component={Budgets} />
            <Tab.Screen name="Settings" component={Settings} />
          </Tab.Navigator>
        </View>
      </View>
      <AddTransactionSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </SearchProvider>
  );
}
