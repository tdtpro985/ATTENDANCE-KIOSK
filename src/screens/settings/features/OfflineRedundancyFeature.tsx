import { SettingRow } from '../components/SettingRow';

type Props = {
  isOnline: boolean;
};

export function OfflineRedundancyFeature({ isOnline }: Props) {
  return (
    <SettingRow
      title="Offline Redundancy"
      description="Automatically buffers attendance locally when offline and auto-syncs after 1 minute of stable connection."
      extraText={[`Status: ${isOnline ? 'ONLINE' : 'OFFLINE'} (auto)`]}
    />
  );
}
