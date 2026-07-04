import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ErrorState } from './States';
import { colors } from '../../theme/colors';
import { logError } from '../../services/logger';

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logError('ErrorBoundary', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.safe}>
          <ErrorState
            message={this.state.error?.message || 'Restart the app and try again.'}
          />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
