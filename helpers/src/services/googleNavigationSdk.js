import { Fragment } from 'react';

let navigationSdk = null;

try {
  navigationSdk = require('@googlemaps/react-native-navigation-sdk');
} catch (error) {
  navigationSdk = null;
}

const noopAsync = async () => {};
const noopNavigationController = {
  areTermsAccepted: async () => false,
  showTermsAndConditionsDialog: async () => false,
  resetTermsAccepted: noopAsync,
  init: async () => 'unknownError',
  cleanup: noopAsync,
  getCurrentRouteSegment: async () => null,
  getRouteSegments: async () => [],
  getCurrentTimeAndDistance: async () => null,
  getTraveledPath: async () => [],
  getNavSDKVersion: async () => '',
  setDestination: async () => 'UNKNOWN',
  setDestinations: async () => 'UNKNOWN',
  continueToNextDestination: async () => ({ waypoint: null }),
  clearDestinations: noopAsync,
  startGuidance: noopAsync,
  stopGuidance: noopAsync,
  setAbnormalTerminatingReportingEnabled: () => {},
  setSpeedAlertOptions: () => {},
  setAudioGuidanceType: () => {},
  stopUpdatingLocation: () => {},
  startUpdatingLocation: () => {},
  setBackgroundLocationUpdatesEnabled: () => {},
  setTurnByTurnLoggingEnabled: () => {},
  simulator: {
    simulateLocationsAlongExistingRoute: () => {},
    stopLocationSimulation: () => {},
    resumeLocationSimulation: () => {},
    pauseLocationSimulation: () => {},
    simulateLocation: () => {},
  },
};

export const googleNavigationSdkAvailable = Boolean(navigationSdk);
export const GoogleNavigationProvider = navigationSdk?.NavigationProvider || Fragment;
export const GoogleTaskRemovedBehavior = navigationSdk?.TaskRemovedBehavior || {
  CONTINUE_SERVICE: 0,
};
export const GoogleMapView = navigationSdk?.MapView || null;
export const GoogleNavigationView = navigationSdk?.NavigationView || null;
export const GoogleCameraPerspective = navigationSdk?.CameraPerspective || {
  TILTED: 0,
  TOP_DOWN_NORTH_UP: 1,
  TOP_DOWN_HEADING_UP: 2,
};
export const GoogleNavigationSessionStatus = navigationSdk?.NavigationSessionStatus || {
  OK: 'ok',
  NOT_AUTHORIZED: 'notAuthorized',
  TERMS_NOT_ACCEPTED: 'termsNotAccepted',
  NETWORK_ERROR: 'networkError',
  LOCATION_PERMISSION_MISSING: 'locationPermissionMissing',
  UNKNOWN_ERROR: 'unknownError',
};
export const GoogleNavigationUIEnabledPreference = navigationSdk?.NavigationUIEnabledPreference || {
  AUTOMATIC: 0,
  DISABLED: 1,
};
export const GoogleRouteStatus = navigationSdk?.RouteStatus || {
  OK: 'OK',
  UNKNOWN: 'UNKNOWN',
};
export const GoogleTravelMode = navigationSdk?.TravelMode || {
  DRIVING: 0,
};

export function useGoogleNavigationSafe() {
  if (typeof navigationSdk?.useNavigation === 'function') {
    return navigationSdk.useNavigation();
  }

  return {
    navigationController: noopNavigationController,
    removeAllListeners: () => {},
    setOnStartGuidance: () => {},
    setOnArrival: () => {},
    setOnLocationChanged: () => {},
    setOnRawLocationChanged: () => {},
    setOnNavigationReady: () => {},
    setOnRouteChanged: () => {},
    setOnReroutingRequestedByOffRoute: () => {},
    setOnTrafficUpdated: () => {},
    setOnRemainingTimeOrDistanceChanged: () => {},
    setOnTurnByTurn: () => {},
    setLogDebugInfo: () => {},
  };
}
