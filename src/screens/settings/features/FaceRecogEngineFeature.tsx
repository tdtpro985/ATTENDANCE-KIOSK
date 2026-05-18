import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SettingRow } from '../components/SettingRow';
import { Colors, useTheme } from '../../../config/theme';

export type FaceEngine = 'facepp' | 'camera_vision';

type Props = {
  engine: FaceEngine;
  onSelect: (engine: FaceEngine) => void;
};

export function FaceRecogEngineFeature({ engine, onSelect }: Props) {
  const { colors } = useTheme();

  const options: { value: FaceEngine; label: string }[] = [
    { value: 'facepp', label: 'Face++' },
    { value: 'camera_vision', label: 'Camera Vision' },
  ];

  return (
    <SettingRow
      title="Face Recognition Engine"
      description="Face++ sends photos to the cloud. Camera Vision runs on-device (offline-capable, faster)."
      action={
        <View style={styles.row}>
          {options.map((opt, i) => {
            const isActive = engine === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onSelect(opt.value)}
                style={[
                  styles.pill,
                  i === 0 ? styles.pillLeft : styles.pillRight,
                  isActive
                    ? { backgroundColor: Colors.powerOrange, borderColor: Colors.powerOrange }
                    : { backgroundColor: 'transparent', borderColor: colors.border },
                ]}
              >
                <Text style={[styles.pillText, { color: isActive ? '#fff' : colors.textSecondary }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginTop: 12,
  },
  pill: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  pillLeft: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    borderRightWidth: 0.75,
  },
  pillRight: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderLeftWidth: 0.75,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
