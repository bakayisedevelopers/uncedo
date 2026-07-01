import { StatusBar, StyleSheet, View } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { HelpersAppProvider } from './src/context/HelpersAppContext';
import {
  GoogleNavigationProvider,
  GoogleTaskRemovedBehavior,
  googleNavigationSdkAvailable,
} from './src/services/googleNavigationSdk';
import { colors } from './src/theme/colors';
import './src/services/activeJobTrackingService';

export default function App() {
  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <GoogleNavigationProvider
        {...(googleNavigationSdkAvailable ? {
          termsAndConditionsDialogOptions: {
            title: 'Google Navigation Terms',
            companyName: 'Uncedo',
            showOnlyDisclaimer: true,
          },
          taskRemovedBehavior: GoogleTaskRemovedBehavior.CONTINUE_SERVICE,
        } : {})}
      >
        <AuthProvider>
          <HelpersAppProvider>
            <RootNavigator />
          </HelpersAppProvider>
        </AuthProvider>
      </GoogleNavigationProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
