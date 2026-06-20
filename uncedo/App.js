import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="auto" />
    </ErrorBoundary>
  );
}
