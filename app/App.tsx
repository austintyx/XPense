import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import ConnectEmail from './src/screens/ConnectEmail';
import Summary from './src/screens/Summary';
import Transactions from './src/screens/Transactions';

export type RootTabParamList = {
  Transactions: undefined;
  Summary: undefined;
  ConnectEmail: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Transactions: 'list',
  Summary: 'stats-chart',
  ConnectEmail: 'mail',
};

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={TAB_ICONS[route.name as keyof RootTabParamList]} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Transactions" component={Transactions} />
        <Tab.Screen name="Summary" component={Summary} />
        <Tab.Screen name="ConnectEmail" component={ConnectEmail} options={{ title: 'Connect Email' }} />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
