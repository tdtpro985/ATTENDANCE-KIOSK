import { Switch } from 'react-native';
import { SettingRow } from '../components/SettingRow';
import { Colors } from '../../../config/theme';

type Props = {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  isDisabled: boolean;
};

export function TouchlessCountdownFeature({ enabled, onToggle, isDisabled }: Props) {
  return (
    <SettingRow
      title="3-Second Countdown"
      description="Give employees 3 seconds to prepare before auto-capturing."
      disabled={isDisabled}
      onPress={() => onToggle(!enabled)}
      action={
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={isDisabled}
          trackColor={{ false: Colors.steelGray, true: Colors.powerOrange }}
          thumbColor="#ffffff"
        />
      }
    />
  );
}
