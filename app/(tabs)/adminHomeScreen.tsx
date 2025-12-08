// adminHomeScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getCountFromServer, getDoc, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Alert, ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NavigationMenu from "../../components/NavigationMenu";
import { auth, db } from "../firebaseConfig";

export default function AdminHomeScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRecordings: 0,
    pendingExperts: 0,
  });

  // Network status listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirstName(null);
        setLastName(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.data() || {};
        
        // Check if user is admin before loading admin-only data
        const roleStr = (data.role || '').toString().toLowerCase();
        const isAdmin = data.isAdmin === true || roleStr === 'admin';
        
        if (!isAdmin) {
          // Not an admin, don't try to load stats (would fail due to permissions)
          return;
        }
        
        const fn = (data.firstName || data.firstname || "").toString().trim();
        const ln = (data.lastName || data.lastname || "").toString().trim();

        if (fn || ln) {
          setFirstName(fn || null);
          setLastName(ln || null);
        } else if (user.displayName) {
          const parts = user.displayName.trim().split(/\s+/);
          setFirstName(parts[0] || null);
          setLastName(parts.slice(1).join(" ") || null);
        } else {
          const local = (user.email || "").split("@")[0];
          setFirstName(local ? local : null);
          setLastName(null);
        }

        // Load stats (only runs if user is admin)
        const rec = collection(db, 'recordings');
        const usersCol = collection(db, 'users');
        
        const [totalUsers, totalRecordings, pendingExperts] = await Promise.all([
          getCountFromServer(usersCol),
          getCountFromServer(rec),
          getCountFromServer(query(usersCol, where('isPendingExpert', '==', true))),
        ]);
        
        setStats({
          totalUsers: totalUsers.data().count || 0,
          totalRecordings: totalRecordings.data().count || 0,
          pendingExperts: pendingExperts.data().count || 0,
        });
      } catch (e) {
        console.warn("Profile load failed:", e);
      }
    });
    return () => unsub();
  }, []);

  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    (firstName || lastName) ||
    "";

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              router.replace('./landingScreen');
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  const buttons = [
    {
      icon: "people" as const,
      label: "Users",
      route: "./usersScreen",
      badge: stats.pendingExperts > 0 ? stats.pendingExperts : undefined,
    },
    {
      icon: "person-circle" as const,
      label: "Profile",
      route: "./profileScreen",
    },
    {
      icon: "settings" as const,
      label: "Settings",
      route: "./settingsScreen",
    },
  ];

  return (
    <ImageBackground source={require("../../assets/images/homeBackground.png")} style={styles.background} resizeMode="cover">
      <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
      
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.overlay}>
          {/* Header with logout and menu buttons */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
              <Ionicons name="log-out-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.iconButton}>
              <Ionicons name="menu" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <View>
            <Text style={styles.hello}>Hello{fullName ? `, ${fullName}` : ","}</Text>
            <Text style={styles.date}>{formattedDate}</Text>
            <View style={styles.roleBadge}>
              <Ionicons name="shield" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.roleText}>Administrator</Text>
            </View>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalUsers}</Text>
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.totalRecordings}</Text>
              <Text style={styles.statLabel}>Total Recordings</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{stats.pendingExperts}</Text>
              <Text style={styles.statLabel}>Expert Requests</Text>
            </View>
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.status}>
              Status:{" "}
              <Text style={{ color: isConnected ? "#4CAF50" : "#FF6B6B" }}>
                {isConnected ? "Online" : "Offline"}
              </Text>
            </Text>

            <View style={styles.grid}>
              {buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.button}
                  onPress={() => router.push(button.route as any)}
                >
                  <View style={styles.buttonContent}>
                    <Ionicons name={button.icon} size={28} color="#ccff00" />
                    {button.badge !== undefined && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{button.badge > 99 ? '99+' : button.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.buttonText}>{button.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: "100%", height: "100%" },
  scrollContainer: { flexGrow: 1 },
  overlay: { flex: 1, paddingTop: 50, paddingHorizontal: 24, paddingBottom: 40, justifyContent: "space-between" },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  hello: { marginTop: 10, fontSize: 32, fontWeight: "400", color: "#f2f2f2ff" },
  date: { fontSize: 30, fontWeight: "500", color: "#ccff00", marginBottom: 8 },
  
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 280,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(47, 66, 51, 0.9)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#d4ff00',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#d4ff00',
  },
  statLabel: {
    fontSize: 12,
    color: '#fff',
    marginTop: 4,
  },

  bottomSection: { marginTop: 20 },
  status: { fontSize: 18, color: "#ffffffff", marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  button: {
    width: "32%",
    height: 90,
    backgroundColor: "rgba(47, 66, 51, 0.9)",
    borderRadius: 20,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonContent: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  buttonText: { marginTop: 6, fontSize: 16, color: "#ffffffff" },
});
