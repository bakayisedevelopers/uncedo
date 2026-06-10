import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { HelpersAppProvider } from './src/context/HelpersAppContext';
import { colors } from './src/theme/colors';

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <HelpersAppProvider>
        <RootNavigator />
      </HelpersAppProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
