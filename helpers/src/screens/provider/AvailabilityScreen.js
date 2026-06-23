import { PlaceholderScreen } from '../../components/PlaceholderScreen';

export function AvailabilityScreen() {
  return (
    <PlaceholderScreen
      eyebrow="Helper"
      title="Availability"
      description="This screen will later support going online, setting work hours, service radius, busy states, and map-based availability."
      actions={[
        { label: 'Set service radius' },
        { label: 'Toggle online status' },
      ]}
    />
  );
}
