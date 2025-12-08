// app/(tabs)/usersScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NavigationMenu from '../../components/NavigationMenu';
import { auth, db } from '../firebaseConfig';
import { usersAPI } from '../../services/api';

type User = {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  location?: string;
  isExpert: boolean;
  isPendingExpert: boolean;
  submissionCount: number;
  recordings?: Recording[];
  avatarColor?: string;
};

type Recording = {
  recordingId: string;
  predictedSpecies: string;
  species?: string;
  location: { latitude: number; longitude: number };
  locationCity?: string;
  status: string;
  timestampISO?: string;
  imageUrl?: string;
  confidence?: number;
  volunteerConfidence?: 'high' | 'medium' | 'low';
  aiSpecies?: string;
  aiConfidence?: number;
  notes?: string;
};

const speciesImageMap: Record<string, any> = {
  'Bullfrog': require('../../assets/frogs/bullfrog.png'),
  'Green Frog': require('../../assets/frogs/treefrog.png'),
  'Northern Spring Peeper': require('../../assets/frogs/spring_peeper.png'),
  'Northern Leopard Frog': require('../../assets/frogs/northern_leopard.png'),
  'Eastern Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
  'Wood Frog': require('../../assets/frogs/wood_frog.png'),
  'American Toad': require('../../assets/frogs/american_toad.png'),
  'Midland Chorus Frog': require('../../assets/frogs/midland_chorus.png')
};
const placeholderImage = require('../../assets/frogs/placeholder.png');

const avatarColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#AED6F1'
];

// Helper function to get the correct home screen based on user role
const getHomeScreen = async (): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) return './adminHomeScreen'; // UsersScreen is admin-only, so default to admin
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data() || {};
    
    // Check both role field (string) and boolean fields for compatibility
    const roleStr = (userData.role || '').toString().toLowerCase();
    const isAdmin = userData.isAdmin === true || roleStr === 'admin';
    const isExpert = userData.isExpert === true || roleStr === 'expert';
    
    if (isAdmin) return './adminHomeScreen';
    if (isExpert) return './expertHomeScreen';
    return './volunteerHomeScreen';
  } catch {
    return './adminHomeScreen';
  }
};

export default function UsersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'experts' | 'volunteers' | 'pending'>('all');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [homeScreen, setHomeScreen] = useState<string>('./adminHomeScreen');
  const [menuVisible, setMenuVisible] = useState(false);

  // Determine the correct home screen on mount
  useEffect(() => {
    getHomeScreen().then(setHomeScreen);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        router.push('/');
        return;
      }

      try {
        // Check if user is admin
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          
          // Check both role field (string) and boolean fields for compatibility
          const roleStr = (userData.role || '').toString().toLowerCase();
          const userIsAdmin = userData.isAdmin === true || roleStr === 'admin';
          const userIsExpert = userData.isExpert === true || roleStr === 'expert';
          
          setIsAdmin(userIsAdmin);
          
          if (!userIsAdmin) {
            // Silently redirect non-admin users to their appropriate home screen
            // This can happen if the screen is loaded during auth state change
            if (userIsExpert) {
              router.replace('./expertHomeScreen');
            } else {
              router.replace('./volunteerHomeScreen');
            }
            return;
          }
        }

        // Load all users
        await loadUsers();
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadUsers = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      
      // Filter out admin users first
      const nonAdminDocs = usersSnapshot.docs.filter(userDoc => {
        const userData = userDoc.data() as DocumentData;
        const roleStr = (userData.role || '').toString().toLowerCase();
        const userIsAdmin = userData.isAdmin === true || roleStr === 'admin';
        return !userIsAdmin;
      });
      
      // Fetch all recording counts in parallel
      const userPromises = nonAdminDocs.map(async (userDoc) => {
        const userData = userDoc.data() as DocumentData;
        
        // Get user's recordings count
        const recordingsQuery = query(
          collection(db, 'recordings'),
          where('userId', '==', userDoc.id)
        );
        const recordingsSnapshot = await getDocs(recordingsQuery);

        // Check both role field (string) and boolean fields for compatibility
        const roleStr = (userData.role || '').toString().toLowerCase();
        const userIsExpert = userData.isExpert === true || roleStr === 'expert';

        return {
          userId: userDoc.id,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          username: userData.username || '',
          email: userData.email || '',
          location: userData.location || '',
          isExpert: userIsExpert,
          isPendingExpert: userData.isPendingExpert || false,
          submissionCount: recordingsSnapshot.size,
          avatarColor: avatarColors[Math.floor(Math.random() * avatarColors.length)],
        } as User;
      });
      
      const usersData = await Promise.all(userPromises);

      // Sort by submission count (highest first)
      usersData.sort((a, b) => b.submissionCount - a.submissionCount);
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      Alert.alert('Error', 'Failed to load users');
    }
  };

  const loadUserRecordings = async (userId: string) => {
    try {
      const recordingsQuery = query(
        collection(db, 'recordings'),
        where('userId', '==', userId)
      );
      const recordingsSnapshot = await getDocs(recordingsQuery);
      
      const recordings: Recording[] = [];
      recordingsSnapshot.forEach((doc) => {
        const data = doc.data();
        
        // User's manually input confidence (if any)
        const userConfidence = typeof data.confidence === 'number' 
          ? Math.round(data.confidence * 100) 
          : undefined;
        
        // AI's confidence score - only from aiConfidence or confidenceScore fields
        const aiConfidenceRaw = data.aiConfidence ?? data.confidenceScore;
        const aiConfidence = typeof aiConfidenceRaw === 'number' 
          ? Math.round(aiConfidenceRaw * 100) 
          : undefined;
            
        recordings.push({
          recordingId: doc.id,
          predictedSpecies: data.predictedSpecies || '',
          species: data.species || '',
          location: {
            latitude: data.location?.lat || 0,
            longitude: data.location?.lng || 0,
          },
          locationCity: data.locationCity || 'Unknown Location',
          status: data.status || 'pending',
          timestampISO: data.timestamp?.toDate?.()?.toLocaleDateString() || 'Unknown',
          confidence: userConfidence ?? aiConfidence, // Display confidence (user's or AI's)
          volunteerConfidence: data.volunteerConfidenceLevel || data.volunteerConfidence || undefined,
          aiSpecies: data.aiSpecies || data.predictedSpecies || '',
          aiConfidence: aiConfidence, // Only the AI's actual confidence, undefined if not available
          notes: data.notes || '',
        });
      });

      // Sort by date (newest first)
      recordings.sort((a, b) => {
        if (!a.timestampISO || !b.timestampISO) return 0;
        return new Date(b.timestampISO).getTime() - new Date(a.timestampISO).getTime();
      });

      // Update the user with recordings
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.userId === userId ? { ...user, recordings } : user
        )
      );
    } catch (error) {
      console.error('Error loading user recordings:', error);
    }
  };

  const handleUserPress = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
      const user = users.find(u => u.userId === userId);
      if (user && !user.recordings) {
        await loadUserRecordings(userId);
      }
    }
  };

  const handleToggleExpert = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'remove' : 'grant';
    const newRole = currentStatus ? 'volunteer' : 'expert';
    
    Alert.alert(
      `${currentStatus ? 'Remove' : 'Grant'} Expert Access`,
      `Are you sure you want to ${action} expert access for this user?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'grant' ? 'Grant' : 'Remove',
          style: action === 'remove' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              // Try backend API first
              try {
                await usersAPI.updateRole(userId, newRole);
                console.log(`User ${userId} role updated to ${newRole} via backend API`);
              } catch (apiError) {
                console.log('Backend API not available, using Firestore fallback');
                // Fallback to Firestore
                await updateDoc(doc(db, 'users', userId), {
                  role: newRole,
                  isExpert: !currentStatus,
                  isPendingExpert: false,
                });
              }

              setUsers(prevUsers =>
                prevUsers.map(user =>
                  user.userId === userId
                    ? { ...user, isExpert: !currentStatus, isPendingExpert: false }
                    : user
                )
              );

              Alert.alert('Success', `Expert access ${action}ed successfully`);
            } catch (error) {
              console.error('Error updating expert status:', error);
              Alert.alert('Error', 'Failed to update expert status');
            }
          },
        },
      ]
    );
  };

  const handleApprovePending = async (userId: string) => {
    Alert.alert(
      'Approve Expert Request',
      'Grant expert access to this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              // Try backend API first
              try {
                await usersAPI.updateRole(userId, 'expert');
                console.log(`User ${userId} approved as expert via backend API`);
              } catch (apiError) {
                console.log('Backend API not available, using Firestore fallback');
                // Fallback to Firestore
                await updateDoc(doc(db, 'users', userId), {
                  role: 'expert',
                  isExpert: true,
                  isPendingExpert: false,
                });
              }

              setUsers(prevUsers =>
                prevUsers.map(user =>
                  user.userId === userId
                    ? { ...user, isExpert: true, isPendingExpert: false }
                    : user
                )
              );

              Alert.alert('Success', 'Expert access granted');
            } catch (error) {
              console.error('Error approving expert:', error);
              Alert.alert('Error', 'Failed to approve expert request');
            }
          },
        },
      ]
    );
  };

  const handleDenyPending = async (userId: string) => {
    Alert.alert(
      'Deny Expert Request',
      'Are you sure you want to deny this expert request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deny',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update Firestore to clear pending status
              await updateDoc(doc(db, 'users', userId), {
                isPendingExpert: false,
                expertRequestDeniedAt: new Date().toISOString(),
              });

              setUsers(prevUsers =>
                prevUsers.map(user =>
                  user.userId === userId
                    ? { ...user, isPendingExpert: false }
                    : user
                )
              );

              Alert.alert('Request Denied', 'The expert access request has been denied.');
            } catch (error) {
              console.error('Error denying expert request:', error);
              Alert.alert('Error', 'Failed to deny expert request');
            }
          },
        },
      ]
    );
  };

  const handleFilterSelect = (type: 'all' | 'experts' | 'volunteers' | 'pending') => {
    setFilterType(type);
    setShowFilterModal(false);
  };

  const filteredUsers = users.filter(user => {
    // Search filter
    const matchesSearch =
      user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Type filter
    if (filterType === 'experts' && !user.isExpert) return false;
    if (filterType === 'volunteers' && (user.isExpert || user.isPendingExpert)) return false;
    if (filterType === 'pending' && !user.isPendingExpert) return false;

    return true;
  });
  
  // Count pending expert requests
  const pendingCount = users.filter(u => u.isPendingExpert).length;

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#d4ff00" style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.innerContainer}>
        <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push(homeScreen as any)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>

          <View>
            <Text style={styles.headerTitle}>Users</Text>
            <View style={styles.underline} />
          </View>

          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search and Filter */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={24} color="#d4ff00" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilterModal(true)}
        >
          <Text style={styles.filterButtonText}>
            {filterType === 'all' ? 'filter' : filterType}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Users</Text>
            
            <TouchableOpacity
              style={[styles.filterOption, filterType === 'all' && styles.filterOptionActive]}
              onPress={() => handleFilterSelect('all')}
            >
              <Text style={[styles.filterOptionText, filterType === 'all' && styles.filterOptionTextActive]}>
                All Users
              </Text>
              {filterType === 'all' && <Ionicons name="checkmark" size={24} color="#d4ff00" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterOption, filterType === 'pending' && styles.filterOptionActive]}
              onPress={() => handleFilterSelect('pending')}
            >
              <View style={styles.filterOptionRow}>
                <Text style={[styles.filterOptionText, filterType === 'pending' && styles.filterOptionTextActive]}>
                  Pending Requests
                </Text>
                {pendingCount > 0 && (
                  <View style={styles.pendingCountBadge}>
                    <Text style={styles.pendingCountText}>{pendingCount}</Text>
                  </View>
                )}
              </View>
              {filterType === 'pending' && <Ionicons name="checkmark" size={24} color="#d4ff00" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterOption, filterType === 'experts' && styles.filterOptionActive]}
              onPress={() => handleFilterSelect('experts')}
            >
              <Text style={[styles.filterOptionText, filterType === 'experts' && styles.filterOptionTextActive]}>
                Experts Only
              </Text>
              {filterType === 'experts' && <Ionicons name="checkmark" size={24} color="#d4ff00" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterOption, filterType === 'volunteers' && styles.filterOptionActive]}
              onPress={() => handleFilterSelect('volunteers')}
            >
              <Text style={[styles.filterOptionText, filterType === 'volunteers' && styles.filterOptionTextActive]}>
                Volunteers Only
              </Text>
              {filterType === 'volunteers' && <Ionicons name="checkmark" size={24} color="#d4ff00" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Users List */}
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Pending Expert Requests Banner */}
        {pendingCount > 0 && filterType !== 'pending' && (
          <TouchableOpacity 
            style={styles.pendingBanner}
            onPress={() => setFilterType('pending')}
          >
            <View style={styles.pendingBannerContent}>
              <View style={styles.pendingBannerIcon}>
                <Ionicons name="time" size={24} color="#2d3e34" />
              </View>
              <View style={styles.pendingBannerText}>
                <Text style={styles.pendingBannerTitle}>
                  {pendingCount} Expert Request{pendingCount !== 1 ? 's' : ''} Pending
                </Text>
                <Text style={styles.pendingBannerSubtitle}>Tap to review</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#2d3e34" />
          </TouchableOpacity>
        )}
        
        {filteredUsers.map((user) => (
          <View key={user.userId} style={styles.userCard}>
            <TouchableOpacity
              style={styles.userHeader}
              onPress={() => handleUserPress(user.userId)}
              activeOpacity={0.7}
            >
              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <View style={styles.nameTag}>
                    <Text style={styles.nameTagText}>
                      {user.firstName} {user.lastName}
                    </Text>
                  </View>
                  {user.isExpert && (
                    <View style={styles.expertBadge}>
                      <Ionicons name="checkmark-circle" size={24} color="#2d3e34" />
                    </View>
                  )}
                  {user.isPendingExpert && (
                    <View style={styles.pendingBadge}>
                      <Ionicons name="time" size={24} color="#2d3e34" />
                    </View>
                  )}
                </View>
                <Text style={styles.userLocation}>{user.location || 'Unknown Location'}</Text>
                <Text style={styles.userSubmissions}>
                  {user.isPendingExpert 
                    ? 'awaiting approval...' 
                    : `completed ${user.submissionCount} submission${user.submissionCount !== 1 ? 's' : ''}`}
                </Text>
              </View>
              <View style={[styles.userAvatar, { backgroundColor: user.avatarColor }]}>
                <Ionicons name="person" size={40} color="#fff" />
              </View>
            </TouchableOpacity>

            {/* Expanded Content */}
            {expandedUserId === user.userId && (
              <View style={styles.expandedContent}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => Alert.alert('Edit User', `Edit ${user.firstName} ${user.lastName}`)}
                >
                  <Text style={styles.editButtonText}>edit</Text>
                </TouchableOpacity>

                {/* User Recordings */}
                {user.recordings && user.recordings.length > 0 ? (
                  user.recordings.map((recording, index) => (
                    <View key={recording.recordingId} style={styles.recordingCard}>
                      <View style={styles.recordingHeader}>
                        <View style={styles.recordingHeaderLeft}>
                          <View style={styles.recordingTag}>
                            <Text style={styles.recordingTagText}>
                              #{index + 1}
                            </Text>
                          </View>
                          <View style={[
                            styles.statusBadge,
                            recording.status === 'approved' && styles.statusApproved,
                            recording.status === 'needs_review' && styles.statusPending,
                            recording.status === 'discarded' && styles.statusDiscarded,
                          ]}>
                            <Text style={styles.statusBadgeText}>
                              {recording.status === 'approved' ? 'Approved' : 
                               recording.status === 'needs_review' ? 'Pending' : 
                               recording.status === 'discarded' ? 'Discarded' : recording.status}
                            </Text>
                          </View>
                        </View>
                        <Image
                          source={speciesImageMap[recording.species || recording.predictedSpecies] || placeholderImage}
                          style={styles.recordingImage}
                        />
                      </View>
                      
                      <View style={styles.recordingDetails}>
                        <View style={styles.recordingDetailRow}>
                          <Text style={styles.recordingDetailLabel}>Species:</Text>
                          <Text style={styles.recordingDetailValue}>
                            {recording.species || recording.predictedSpecies || 'Unknown'}
                          </Text>
                        </View>
                        <View style={styles.recordingDetailRow}>
                          <Text style={styles.recordingDetailLabel}>Date:</Text>
                          <Text style={styles.recordingDetailValue}>{recording.timestampISO}</Text>
                        </View>
                        <View style={styles.recordingDetailRow}>
                          <Text style={styles.recordingDetailLabel}>Location:</Text>
                          <Text style={styles.recordingDetailValue}>{recording.locationCity}</Text>
                        </View>
                        {(recording.confidence != null || recording.aiConfidence != null) && (
                          <View style={styles.recordingDetailRow}>
                            <Text style={styles.recordingDetailLabel}>Confidence:</Text>
                            <Text style={styles.recordingDetailValue}>
                              {recording.confidence ?? recording.aiConfidence ?? 0}%
                            </Text>
                          </View>
                        )}
                        {recording.aiSpecies && recording.aiSpecies.trim() !== '' && (
                          <View style={styles.aiPredictionSection}>
                            <View style={styles.aiPredictionHeader}>
                              <Ionicons name="sparkles" size={14} color="#d4ff00" />
                              <Text style={styles.aiPredictionLabel}>AI Prediction</Text>
                            </View>
                            <View style={styles.aiPredictionContent}>
                              <View style={styles.aiPredictionRow}>
                                <Text style={styles.aiPredictionRowLabel}>Species:</Text>
                                <Text style={styles.aiPredictionRowValue}>{recording.aiSpecies}</Text>
                              </View>
                              <View style={styles.aiPredictionRow}>
                                <Text style={styles.aiPredictionRowLabel}>Confidence:</Text>
                                <Text style={styles.aiPredictionRowValue}>
                                  {recording.aiConfidence != null ? `${recording.aiConfidence}%` : 'N/A'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        )}
                        {recording.volunteerConfidence && (
                          <View style={styles.userConfidenceSection}>
                            <View style={styles.userConfidenceHeader}>
                              <Ionicons name="person" size={14} color="#4db8e8" />
                              <Text style={styles.userConfidenceLabel}>User Confidence</Text>
                            </View>
                            <View style={[
                              styles.userConfidenceBadge,
                              recording.volunteerConfidence === 'high' && styles.confidenceHigh,
                              recording.volunteerConfidence === 'medium' && styles.confidenceMedium,
                              recording.volunteerConfidence === 'low' && styles.confidenceLow,
                            ]}>
                              <Text style={styles.userConfidenceText}>
                                {recording.volunteerConfidence.charAt(0).toUpperCase() + recording.volunteerConfidence.slice(1)}
                              </Text>
                            </View>
                          </View>
                        )}
                        {recording.notes && recording.notes.trim() !== '' && (
                          <View style={styles.notesSection}>
                            <Text style={styles.notesLabel}>Notes:</Text>
                            <Text style={styles.notesText}>{recording.notes}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noRecordingsText}>No recordings yet</Text>
                )}

                {/* Add/Remove Expert Button */}
                {user.isPendingExpert ? (
                  <View style={styles.pendingButtonsContainer}>
                    <TouchableOpacity
                      style={styles.approveButton}
                      onPress={() => handleApprovePending(user.userId)}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#2d3e34" />
                      <Text style={styles.approveButtonText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.denyButton}
                      onPress={() => handleDenyPending(user.userId)}
                    >
                      <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                      <Text style={styles.denyButtonText}>Deny</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={user.isExpert ? styles.removeExpertButton : styles.addExpertButton}
                    onPress={() => handleToggleExpert(user.userId, user.isExpert)}
                  >
                    <Text style={styles.expertButtonText}>
                      {user.isExpert ? 'remove expert' : 'add expert'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}

        {filteredUsers.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No users found</Text>
          </View>
        )}
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3d5e44',
  },
  innerContainer: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '500',
    color: '#fff',
  },
  underline: {
    height: 3,
    backgroundColor: '#d4ff00',
    marginTop: 4,
    width: '100%',
    borderRadius: 2,
  },
  menuButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
    flexDirection: 'row',
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d3e34',
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#d4ff00',
    paddingHorizontal: 15,
  },
  searchIcon: {
    marginRight: 10,
    color: '#d4ff00',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
  },
  filterButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  filterButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3e34',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#2d3e34',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 3,
    borderColor: '#d4ff00',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#d4ff00',
    marginBottom: 20,
    textAlign: 'center',
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#3d4f44',
    marginBottom: 12,
  },
  filterOptionActive: {
    backgroundColor: '#4a5f54',
    borderWidth: 2,
    borderColor: '#d4ff00',
  },
  filterOptionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  filterOptionTextActive: {
    color: '#d4ff00',
  },
  modalCloseButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2d3e34',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  userCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  nameTag: {
    backgroundColor: '#d4ff00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  nameTagText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3e34',
  },
  expertBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4db8e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5a623',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocation: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  userSubmissions: {
    fontSize: 14,
    color: '#aaa',
  },
  userAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedContent: {
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  editButton: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editButtonText: {
    fontSize: 16,
    color: '#d4ff00',
    fontWeight: '500',
  },
  recordingCard: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  recordingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recordingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  recordingTag: {
    backgroundColor: '#d4ff00',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  recordingTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2d3e34',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#666',
  },
  statusApproved: {
    backgroundColor: '#4CAF50',
  },
  statusPending: {
    backgroundColor: '#f5a623',
  },
  statusDiscarded: {
    backgroundColor: '#FF6B6B',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  recordingImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  recordingDetails: {
    gap: 6,
  },
  recordingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordingDetailLabel: {
    fontSize: 13,
    color: '#aaa',
  },
  recordingDetailValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  aiPredictionSection: {
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  aiPredictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  aiPredictionLabel: {
    fontSize: 12,
    color: '#d4ff00',
    fontWeight: '600',
  },
  aiPredictionContent: {
    gap: 4,
  },
  aiPredictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiPredictionRowLabel: {
    fontSize: 13,
    color: '#aaa',
  },
  aiPredictionRowValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  aiPredictionText: {
    fontSize: 13,
    color: '#fff',
  },
  notesSection: {
    marginTop: 4,
  },
  notesLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 2,
  },
  notesText: {
    fontSize: 13,
    color: '#fff',
    fontStyle: 'italic',
  },
  noRecordingsText: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    paddingVertical: 16,
  },
  addExpertButton: {
    backgroundColor: '#3d4f44',
    borderRadius: 25,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#d4ff00',
    marginTop: 8,
  },
  removeExpertButton: {
    backgroundColor: '#3d4f44',
    borderRadius: 25,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#d4ff00',
    marginTop: 8,
  },
  pendingButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  denyButton: {
    flex: 1,
    backgroundColor: '#3d4f44',
    borderRadius: 25,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  denyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  expertButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#d4ff00',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    color: '#aaa',
  },
  // Pending banner styles
  pendingBanner: {
    backgroundColor: '#f5a623',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pendingBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pendingBannerText: {
    flex: 1,
  },
  pendingBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3e34',
  },
  pendingBannerSubtitle: {
    fontSize: 14,
    color: '#2d3e34',
    opacity: 0.7,
  },
  // Filter option row with badge
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingCountBadge: {
    backgroundColor: '#f5a623',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pendingCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2d3e34',
  },
  // User Confidence styles
  userConfidenceSection: {
    backgroundColor: 'rgba(77, 184, 232, 0.15)',
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(77, 184, 232, 0.3)',
  },
  userConfidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  userConfidenceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4db8e8',
  },
  userConfidenceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  userConfidenceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  confidenceHigh: {
    backgroundColor: '#4CAF50',
  },
  confidenceMedium: {
    backgroundColor: '#FF9800',
  },
  confidenceLow: {
    backgroundColor: '#f44336',
  },
});