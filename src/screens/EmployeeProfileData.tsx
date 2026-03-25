import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  onBack: () => void;
};

export default function EmployeeProfileData({ onBack }: Props) {
  type EmployeeRow = {
    emp_id: number;
    name: string;
    role: string | null;
    dept_id: number | null;
    log_id: number | null;
    accounts?: {
      log_id: number;
      username: string | null;
      qr_code?: string | null;
      face?: string | null;
    } | null;
    departments?: {
      name?: string | null;
    } | null;
  };

  const [statusText, setStatusText] = useState('Loading employees...');
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  useEffect(() => {
    const API_BASE_URL = 'http://192.168.15.10:8000';

    const fetchEmployees = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/employees.php`);
        const payload = await response.json();
        if (payload?.ok && Array.isArray(payload?.data)) {
          console.log('employees.php payload', payload);
          setEmployees(payload.data);
          setStatusText(payload.data.length ? 'Employees loaded' : 'No employees found');
        } else {
          console.log('employees.php error payload', payload);
          setStatusText(`Load failed (status ${payload?.status ?? response.status})`);
        }
      } catch (error) {
        console.log('employees.php fetch error', error);
        setStatusText('Connection error: check API URL and PHP server');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Employee Profile Data</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Database</Text>
        <View style={styles.connectionRow}>
          {isLoading ? <ActivityIndicator color="#c8742e" /> : null}
          <Text style={styles.value}>{statusText}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {employees.map((emp) => (
          <View key={emp.emp_id} style={styles.employeeCard}>
            <Text style={styles.employeeName}>{emp.name}</Text>
            {emp.accounts?.face ? (
              <Image source={{ uri: emp.accounts.face }} style={styles.faceImage} />
            ) : null}
            <Text style={styles.employeeMeta}>Role: {emp.role ?? 'N/A'}</Text>
            <Text style={styles.employeeMeta}>
              Dept: {emp.departments?.name ?? 'N/A'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 18,
    backgroundColor: '#ffffff',
  },
  backText: {
    color: '#345d86',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    marginTop: 18,
    fontSize: 28,
    fontWeight: '700',
    color: '#c8742e',
  },
  card: {
    marginTop: 24,
    borderRadius: 24,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#c8742e',
    padding: 22,
    gap: 10,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 13,
    letterSpacing: 0.6,
    color: '#c8742e',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  value: {
    fontSize: 18,
    color: '#1f2a37',
    fontWeight: '600',
  },
  list: {
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12,
  },
  employeeCard: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#c8742e',
    borderRadius: 18,
    padding: 16,
  },
  faceImage: {
    width: 96,
    height: 96,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: '#e2e6ee',
  },
  employeeName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2a37',
  },
  employeeMeta: {
    marginTop: 6,
    color: '#5b6674',
    fontSize: 14,
  },
});
