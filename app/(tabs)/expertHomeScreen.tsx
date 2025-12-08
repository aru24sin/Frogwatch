// expertHomeScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import NavigationMenu from "../../components/NavigationMenu";
import { auth, db } from "../firebaseConfig";

export default function ExpertHomeScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const [pendingReviews, setPendingReviews] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [discardedCount, setDiscardedCount] = useState(0);

  const [isConnected, setIsConnected] = useState<boolean | null>(true);

  // --- Network status listener ---
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // --- Load expert profile (name) on auth change ---
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
      } catch (e) {
        console.warn("Profile load failed:", e);
      }
    });
    return () => unsub();
  }, []);

  // --- Helper: load counts for needs_review / approved / discarded ---
  const loadReviewCounts = useCallback(async () => {
    try {
      if (!auth.currentUser) {
        setPendingReviews(0);
        setApprovedCount(0);
        setDiscardedCount(0);
        return;
      }

      // Check if user is expert or admin before loading all recordings
      const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
      const userData = userSnap.data() || {};
      const roleStr = (userData.role || '').toString().toLowerCase();
      const isExpert = userData.isExpert === true || roleStr === 'expert';
      const isAdmin = userData.isAdmin === true || roleStr === 'admin';
      
      if (!isExpert && !isAdmin) {
        // Not authorized to view all recordings
        return;
      }

      const rec = collection(db, "recordings");

      const needsReviewSnap = await getCountFromServer(
        query(rec, where("status", "==", "needs_review"))
      );
      const approvedSnap = await getCountFromServer(
        query(rec, where("status", "==", "approved"))
      );
      const discardedSnap = await getCountFromServer(
        query(rec, where("status", "==", "discarded"))
      );

      setPendingReviews(needsReviewSnap.data().count || 0);
      setApprovedCount(approvedSnap.data().count || 0);
      setDiscardedCount(discardedSnap.data().count || 0);
    } catch (e) {
      console.warn("Failed to load review counts:", e);
    }
  }, []);

  // --- Refresh counts whenever this screen is focused (e.g., after approve/discard) ---
  useFocusEffect(
    useCallback(() => {
      loadReviewCounts();
    }, [loadReviewCounts])
  );

  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    (firstName || lastName) ||
    "";

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace("./landingScreen");
          } catch (error) {
            console.error("Error logging out:", error);
            Alert.alert("Error", "Failed to logout");
          }
        },
      },
    ]);
  };

  const buttons = [
    {
      icon: "radio-button-on" as const,
      label: "Recording",
      route: "./recordScreen",
    },
    {
      icon: "bookmark" as const,
      label: "History",
      route: "./historyScreen",
    },
    {
      icon: "map" as const,
      label: "Map",
      route: "./mapHistoryScreen",
    },
    {
      icon: "time" as const,
      label: "Reviews",
      route: "./expert",
      badge: pendingReviews > 0 ? pendingReviews : undefined,
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
    <ImageBackground
      source={require("../../assets/images/homeBackground.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <NavigationMenu
        isVisible={menuVisible}
        onClose={() => setMenuVisible(false)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.overlay}>
          {/* Header with logout and menu buttons */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
              <Ionicons name="log-out-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={styles.iconButton}
            >
              <Ionicons name="menu" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <View>
            <Text style={styles.hello}>
              Hello{fullName ? `, ${fullName}` : ","}
            </Text>
            <Text style={styles.date}>{formattedDate}</Text>
            <View style={styles.roleBadge}>
              <Ionicons
                name="shield-checkmark"
                size={14}
                color="#fff"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.roleText}>Expert</Text>
            </View>
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.status}>
              Status:{" "}
              <Text
                style={{ color: isConnected ? "#4CAF50" : "#FF6B6B" }}
              >
                {isConnected ? "Online" : "Offline"}
              </Text>
              {pendingReviews > 0 && (
                <Text style={styles.pendingText}>
                  {" "}
                  • {pendingReviews} pending reviews
                </Text>
              )}
            </Text>

            {/* Optional: show quick counts summary */}
            <Text style={styles.reviewSummary}>
              Needs review: {pendingReviews} • Approved: {approvedCount} •
              Discarded: {discardedCount}
            </Text>

            <View style={styles.grid}>
              {buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.button}
                  onPress={() => router.push(button.route as any)}
                >
                  <View style={styles.buttonContent}>
                    <Ionicons
                      name={button.icon}
                      size={28}
                      color="#ccff00"
                    />
                    {button.badge !== undefined && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {button.badge > 99 ? "99+" : button.badge}
                        </Text>
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
  overlay: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: "space-between",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },

  hello: {
    marginTop: 0,
    fontSize: 32,
    fontWeight: "400",
    color: "#f2f2f2ff",
  },
  date: {
    fontSize: 30,
    fontWeight: "500",
    color: "#ccff00",
    marginBottom: 8,
  },

  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#4db8e8",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 300,
  },
  roleText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  bottomSection: { marginTop: 20 },
  status: { fontSize: 18, color: "#ffffffff", marginBottom: 8 },
  pendingText: { color: "#d4ff00" },
  reviewSummary: {
    fontSize: 14,
    color: "#e0e0e0",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
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
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -8,
    right: -12,
    backgroundColor: "#FF6B6B",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  buttonText: { marginTop: 6, fontSize: 16, color: "#ffffffff" },
});