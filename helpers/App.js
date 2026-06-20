import { StatusBar, StyleSheet, View } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { HelpersAppProvider } from './src/context/HelpersAppContext';
import { colors } from './src/theme/colors';

export default function App() {
  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <HelpersAppProvider>
          <RootNavigator />
        </HelpersAppProvider>
      </AuthProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
