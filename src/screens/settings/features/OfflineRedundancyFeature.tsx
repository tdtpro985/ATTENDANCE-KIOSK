import { SettingRow } from '../components/SettingRow';

type Props = {
  isOnline: boolean;
};

export function OfflineRedundancyFeature({ isOnline }: Props) {
  return (
    <SettingRow
      title="Offline Redundancy"
      description="Automatically buffers attendance and scanner users when connection is unstable"
      extraText={[`Status: ${isOnline ? 'ONLINE' : 'OFFLINE'} (auto)`]}
    />
  );
}
