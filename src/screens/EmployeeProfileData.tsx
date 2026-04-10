import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BACKEND_URL } from '../config/backend';
import { refreshOfflineUserCache } from '../utils/offlineUsers';

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
      profile_picture?: string | null;
    } | null;
    departments?: {
      name?: string | null;
    } | null;
  };

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Debounce search text to improve performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${BACKEND_URL}/employees.php`);
        const payload = await response.json();
        if (payload?.ok && Array.isArray(payload?.data)) {
          console.log('employees.php payload', payload);
          setEmployees(payload.data);
          // Run cache refresh in background to avoid blocking UI
          setTimeout(() => {
            refreshOfflineUserCache().catch(() => undefined);
          }, 100);
        } else {
          console.log('employees.php error payload', payload);
        }
      } catch (error) {
        console.log('employees.php fetch error', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees
      .filter(emp => 
        emp.name.toLowerCase().includes(debouncedSearchText.toLowerCase()) ||
        (emp.role && emp.role.toLowerCase().includes(debouncedSearchText.toLowerCase()))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, debouncedSearchText]);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Employee Profile Data</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or role..."
        value={searchText}
        onChangeText={setSearchText}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#c8742e" />
          <Text style={styles.loadingText}>Loading employees...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filteredEmployees.map((emp) => (
            <View key={emp.emp_id} style={styles.employeeCard}>
              <Text style={styles.employeeName}>{emp.name}</Text>
              {emp.accounts?.profile_picture ? (
                <Image 
                  source={{ uri: emp.accounts.profile_picture }} 
                  style={styles.profileImage}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={styles.employeeMeta}>Role: {emp.role ?? 'N/A'}</Text>
              <Text style={styles.employeeMeta}>
                Dept: {emp.departments?.name ?? 'N/A'}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 8,
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
  searchInput: {
    marginTop: 18,
    borderWidth: 2,
    borderColor: '#c8742e',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#1f2a37',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#5b6674',
    textAlign: 'center',
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
  profileImage: {
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
