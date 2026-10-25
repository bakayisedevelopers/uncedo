import { Fragment } from 'react';

const noop = () => {};
const noopAsync = async () => {};
const navigationController = {
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
  setAbnormalTerminatingReportingEnabled: noop,
  setSpeedAlertOptions: noop,
  setAudioGuidanceType: noop,
  stopUpdatingLocation: noop,
  startUpdatingLocation: noop,
  setBackgroundLocationUpdatesEnabled: noop,
  setTurnByTurnLoggingEnabled: noop,
  simulator: {
    simulateLocationsAlongExistingRoute: noop,
    stopLocationSimulation: noop,
    resumeLocationSimulation: noop,
    pauseLocationSimulation: noop,
    simulateLocation: noop,
  },
};

export const googleNavigationSdkAvailable = false;
export const GoogleNavigationProvider = Fragment;
export const GoogleTaskRemovedBehavior = { CONTINUE_SERVICE: 0 };
export const GoogleMapView = null;
export const GoogleNavigationView = null;
export const GoogleMapColorScheme = { FOLLOW_SYSTEM: 0, LIGHT: 1, DARK: 2 };
export const GoogleCameraPerspective = { TILTED: 0, TOP_DOWN_NORTH_UP: 1, TOP_DOWN_HEADING_UP: 2 };
export const GoogleNavigationSessionStatus = {
  OK: 'ok',
  NOT_AUTHORIZED: 'notAuthorized',
  TERMS_NOT_ACCEPTED: 'termsNotAccepted',
  NETWORK_ERROR: 'networkError',
  LOCATION_PERMISSION_MISSING: 'locationPermissionMissing',
  UNKNOWN_ERROR: 'unknownError',
};
export const GoogleNavigationUIEnabledPreference = { AUTOMATIC: 0, DISABLED: 1 };
export const GoogleRouteStatus = { OK: 'OK', UNKNOWN: 'UNKNOWN' };
export const GoogleTravelMode = { DRIVING: 0 };

export function useGoogleNavigationSafe() {
  return {
    navigationController,
    removeAllListeners: noop,
    setOnStartGuidance: noop,
    setOnArrival: noop,
    setOnLocationChanged: noop,
    setOnRawLocationChanged: noop,
    setOnNavigationReady: noop,
    setOnRouteChanged: noop,
    setOnReroutingRequestedByOffRoute: noop,
    setOnTrafficUpdated: noop,
    setOnRemainingTimeOrDistanceChanged: noop,
    setOnTurnByTurn: noop,
    setLogDebugInfo: noop,
  };
}
