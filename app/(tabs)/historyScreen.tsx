// app/(tabs)/historyScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NavigationMenu from '../../components/NavigationMenu';
import app, { auth, db } from '../firebaseConfig';

type Recording = {
  recordingId: string;
  userId: string;
  predictedSpecies: string;
  species: string;
  audioURL?: string;
  filePath?: string;
  location: { latitude: number; longitude: number };
  locationCity?: string;
  status: string;
  timestampISO?: string;        // display string (now date+time)
  timestampMs?: number;         // numeric for sorting
  confidence?: number;
  volunteerConfidence?: 'high' | 'medium' | 'low';
  notes?: string;
  submitterName?: string;
  recordingNumber?: number;
  // AI prediction fields
  aiSpecies?: string;
  aiConfidence?: number;
};

const speciesImageMap: Record<string, any> = {
  Bullfrog: require('../../assets/frogs/bullfrog.png'),
  'Green Frog': require('../../assets/frogs/treefrog.png'),
  'Northern Spring Peeper': require('../../assets/frogs/spring_peeper.png'),
  'Northern Leopard Frog': require('../../assets/frogs/northern_leopard.png'),
  'Eastern Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
  'Wood Frog': require('../../assets/frogs/wood_frog.png'),
  'American Toad': require('../../assets/frogs/american_toad.png'),
  'Midland Chorus Frog': require('../../assets/frogs/midland_chorus.png'),
};
const placeholderImage = require('../../assets/frogs/placeholder.png');

// All available species options
const speciesOptions = [
  'Bullfrog',
  'Green Frog',
  'Northern Spring Peeper',
  'Northern Leopard Frog',
  'Eastern Gray Treefrog',
  'Wood Frog',
  'American Toad',
  'Midland Chorus Frog',
];

// Helper function to get the correct home screen based on user role
const getHomeScreen = async (): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) return './volunteerHomeScreen';

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
    return './volunteerHomeScreen';
  }
};

function pickDevHost() {
  const url: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const m = url?.match(/\/\/([^/:]+):\d+/);
  return m?.[1] ?? 'localhost';
}
const API_BASE = __DEV__
  ? `http://${pickDevHost()}:8000`
  : 'https://your-production-domain';

function resolveAudioURL(d: any): string | undefined {
  const filePath =
    d?.filePath || (d?.fileName ? `uploaded_audios/${d.fileName}` : undefined);
  if (filePath) {
    const bucket = (app.options as any).storageBucket as string;
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
      filePath
    )}?alt=media`;
  }
  const a = d?.audioURL;
  if (typeof a === 'string') {
    if (/^https?:\/\//i.test(a)) return a;
    if (a.startsWith('/get-audio/')) return `${API_BASE}${a}`;
  }
  return undefined;
}

// Cache for geocoding results to avoid repeated API calls
const geocodeCache: Record<string, string> = {};

async function getCityFromCoords(lat: number, lon: number): Promise<string> {
  // Create cache key from rounded coordinates
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  
  // Return cached result if available
  if (geocodeCache[cacheKey]) {
    return geocodeCache[cacheKey];
  }
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );
    const data = await response.json();
    const city =
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      'Unknown';
    const state = data.address?.state || '';
    const result = state ? `${city}, ${state}` : city;
    
    // Cache the result
    geocodeCache[cacheKey] = result;
    return result;
  } catch (error) {
    return 'Unknown Location';
  }
}

export default function HistoryScreen() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editSpecies, setEditSpecies] = useState('');
  const [editConfidence, setEditConfidence] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [homeScreen, setHomeScreen] =
    useState<string>('./volunteerHomeScreen');
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Determine the correct home screen on mount
  useEffect(() => {
    getHomeScreen().then(setHomeScreen);
  }, []);

  useEffect(() => {
    let offAuth: (() => void) | undefined;
    let offSnap: (() => void) | undefined;

    offAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous snapshot listener when auth state changes
      if (offSnap) {
        offSnap();
        offSnap = undefined;
      }

      if (!user) {
        setRecordings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorText(null);

      const q = query(
        collection(db, 'recordings'),
        where('userId', '==', user.uid)
      );

      offSnap = onSnapshot(
        q,
        (snap) => {
          // Double-check user is still logged in
          if (!auth.currentUser) {
            setRecordings([]);
            setLoading(false);
            return;
          }

          const rows: Recording[] = [];

          for (const docSnap of snap.docs) {
            const d = docSnap.data() as DocumentData;

            // --- Robust timestamp handling + date-time formatting ---
            const ts: Timestamp | undefined = d.timestamp;
            let jsDate: Date | null = null;

            if (ts?.toDate && typeof ts.toDate === 'function') {
              jsDate = ts.toDate();
            } else if (typeof d.timestamp === 'number') {
              jsDate = new Date(d.timestamp);
            } else if (typeof d.timestamp === 'string') {
              const parsed = new Date(d.timestamp);
              if (!Number.isNaN(parsed.getTime())) jsDate = parsed;
            } else if (typeof d.timestamp_iso === 'string') {
              const parsed = new Date(d.timestamp_iso);
              if (!Number.isNaN(parsed.getTime())) jsDate = parsed;
            }

            let timestampDisplay = 'Unknown';
            let timestampMs: number | undefined;

            if (jsDate) {
              timestampDisplay = jsDate.toLocaleString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              });
              timestampMs = jsDate.getTime();
            }

            const lat = Number(d?.location?.lat) || 0;
            const lon = Number(d?.location?.lng) || 0;
            // Use stored locationCity if available, otherwise show coordinates temporarily
            const locationCity = d.locationCity || (lat && lon ? `${lat.toFixed(2)}, ${lon.toFixed(2)}` : 'Unknown Location');

            const submitterName =
              d.submitter?.displayName ||
              `${d.submitter?.firstName || ''} ${
                d.submitter?.lastName || ''
              }`.trim() ||
              'Unknown';

            rows.push({
              recordingId: d.recordingId ?? docSnap.id,
              userId: d.userId ?? '',
              predictedSpecies: d.predictedSpecies ?? '',
              species: d.species ?? '',
              audioURL: resolveAudioURL(d),
              filePath:
                d.filePath ||
                (d.fileName
                  ? `uploaded_audios/${d.userId || user.uid}/${d.fileName}`
                  : undefined),
              location: { latitude: lat, longitude: lon },
              locationCity,
              status: d.status ?? 'pending_analysis',
              timestampISO: timestampDisplay,
              timestampMs,
              confidence:
                typeof d.confidenceScore === 'number'
                  ? Math.round(d.confidenceScore * 100)
                  : undefined,
              volunteerConfidence:
                d.volunteerConfidenceLevel ||
                d.volunteerConfidence ||
                undefined,
              notes: d.notes || '',
              submitterName,
              // AI prediction fields
              aiSpecies: d.aiSpecies || d.predictedSpecies || '',
              aiConfidence:
                typeof d.aiConfidence === 'number'
                  ? Math.round(d.aiConfidence * 100)
                  : typeof d.confidenceScore === 'number'
                  ? Math.round(d.confidenceScore * 100)
                  : undefined,
            });
          }

          // Sort by recording time (newest first)
          rows.sort(
            (a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0)
          );

          // Re-number Frog Spec # so #1 is most recent
          rows.forEach((r, idx) => {
            r.recordingNumber = idx + 1;
          });

          setRecordings(rows);
          setLoading(false);
          
          // Background geocoding: update locations that show coordinates
          const needsGeocode = rows.filter(r => 
            r.locationCity?.includes(',') && 
            !r.locationCity?.includes(' ') &&
            r.location.latitude && 
            r.location.longitude
          );
          
          if (needsGeocode.length > 0) {
            Promise.all(
              needsGeocode.map(async (r) => {
                const city = await getCityFromCoords(r.location.latitude, r.location.longitude);
                return { recordingId: r.recordingId, city };
              })
            ).then((results) => {
              setRecordings(prev => prev.map(rec => {
                const update = results.find(u => u.recordingId === rec.recordingId);
                return update ? { ...rec, locationCity: update.city } : rec;
              }));
            });
          }
        },
        (err) => {
          // Only log error if user is still logged in (ignore permission errors on logout)
          if (auth.currentUser) {
            console.error('Error fetching recordings:', err);
            setErrorText(err?.message || String(err));
          }
          setRecordings([]);
          setLoading(false);
        }
      );
    });

    return () => {
      offSnap?.();
      offAuth?.();
    };
  }, []); // no sound dependency

  // Separate cleanup for sound
  useEffect(() => {
    return () => {
      sound?.unloadAsync().catch(() => {});
    };
  }, [sound]);

  const handlePlay = async (
    uri?: string,
    recordingId?: string,
    filePath?: string
  ) => {
    if (!uri && !filePath) return;
    try {
      // Stop and unload any existing sound
      if (sound) {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
        } catch {}
        setSound(null);
        setPlayingId(null);
      }

      if (playingId === recordingId) {
        // Was playing this one, now stopped
        return;
      }

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Get authenticated download URL from Firebase Storage
      let audioUri = uri;
      if (filePath) {
        try {
          const storage = getStorage(app);
          const audioRef = ref(storage, filePath);
          audioUri = await getDownloadURL(audioRef);
        } catch (storageErr) {
          console.log(
            'Storage URL fetch failed, trying direct URI:',
            storageErr
          );
          // Fall back to the provided URI
        }
      }

      if (!audioUri) {
        Alert.alert('Error', 'No audio URL available');
        return;
      }

      const { sound: newSound } = await Audio.Sound.createAsync({
        uri: audioUri,
      });
      setSound(newSound);
      setPlayingId(recordingId || null);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setPlayingId(null);
        }
      });

      await newSound.playAsync();
    } catch (e) {
      console.error('Audio play error:', e);
      Alert.alert('Playback Error', 'Unable to play audio file');
    }
  };

  const handleExpand = (rec: Recording) => {
    if (expandedId === rec.recordingId) {
      setExpandedId(null);
      setEditMode(null);
    } else {
      setExpandedId(rec.recordingId);
      setEditMode(null);
      setEditSpecies(rec.predictedSpecies);
      setEditConfidence(String(rec.confidence ?? ''));
      setEditNotes(rec.notes ?? '');
    }
  };

  const handleEdit = (rec: Recording) => {
    if (editMode === rec.recordingId) {
      setEditMode(null);
    } else {
      setEditMode(rec.recordingId);
      setEditSpecies(rec.species || rec.predictedSpecies);
      setEditConfidence(String(rec.confidence ?? ''));
      setEditNotes(rec.notes ?? '');
    }
  };

  const handleResubmit = async (recordingId: string) => {
    // Validate confidence score
    const confidenceNum = parseInt(editConfidence, 10);
    if (
      editConfidence &&
      (isNaN(confidenceNum) || confidenceNum < 0 || confidenceNum > 100)
    ) {
      Alert.alert(
        'Invalid Confidence',
        'Please enter a number between 0 and 100'
      );
      return;
    }

    setIsSaving(true);
    try {
      const recordingRef = doc(db, 'recordings', recordingId);

      const updates: any = {
        species: editSpecies,
        predictedSpecies: editSpecies,
        notes: editNotes,
        status: 'needs_review', // Reset status for re-review
      };

      // Only update confidence if a valid number was entered
      if (editConfidence && !isNaN(confidenceNum)) {
        updates.confidenceScore = confidenceNum / 100; // Store as decimal
      }

      await updateDoc(recordingRef, updates);

      // Update local state
      setRecordings((prevRecordings) =>
        prevRecordings.map((rec) =>
          rec.recordingId === recordingId
            ? {
                ...rec,
                species: editSpecies,
                predictedSpecies: editSpecies,
                notes: editNotes,
                confidence: confidenceNum || rec.confidence,
                status: 'needs_review',
              }
            : rec
        )
      );

      setEditMode(null);
      Alert.alert('Success', 'Recording updated and resubmitted for review');
    } catch (error) {
      console.error('Error updating recording:', error);
      Alert.alert('Error', 'Failed to update recording. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRecordings = useMemo(() => {
    if (!searchQuery.trim()) return recordings;
    const lower = searchQuery.toLowerCase();
    return recordings.filter(
      (r) =>
        r.predictedSpecies.toLowerCase().includes(lower) ||
        r.locationCity?.toLowerCase().includes(lower)
    );
  }, [recordings, searchQuery]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <Ionicons name="checkmark-circle" size={24} color="#6ee96e" />;
      case 'needs_review':
        return <Ionicons name="time" size={24} color="#f5a623" />;
      case 'discarded':
        return <Ionicons name="close-circle" size={24} color="#FF6B6B" />;
      default:
        return <Ionicons name="cloud-upload" size={24} color="#4db8e8" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'needs_review':
        return 'Pending Review';
      case 'discarded':
        return 'Discarded';
      default:
        return 'Processing';
    }
  };

  const renderItem = ({ item }: { item: Recording }) => {
    const img = speciesImageMap[item.predictedSpecies] || placeholderImage;
    const isExpanded = expandedId === item.recordingId;
    const isEditing = editMode === item.recordingId;
    const isPlaying = playingId === item.recordingId;

    return (
      <View style={styles.itemContainer}>
        <TouchableOpacity onPress={() => handleExpand(item)}>
          <View style={styles.card}>
            <View style={styles.cardLeft}>
              <View style={styles.speciesTag}>
                <Text style={styles.speciesTagText}>
                  Frog Spec #{item.recordingNumber}
                </Text>
              </View>
              <View style={styles.statusIcon}>{getStatusIcon(item.status)}</View>
              <Text style={styles.locationText}>{item.locationCity}</Text>
            </View>
            <Image source={img} style={styles.cardImage} />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedCard}>
            <View style={styles.expandedHeader}>
              <Text style={styles.expandedDate}>{item.timestampISO}</Text>
              <TouchableOpacity onPress={() => handleEdit(item)}>
                <Text style={styles.editText}>
                  {isEditing ? 'cancel' : 'edit'}
                </Text>
              </TouchableOpacity>
            </View>

            {isEditing ? (
              <View style={styles.editContainer}>
                {/* Species Dropdown */}
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={editSpecies}
                    onValueChange={(value) => setEditSpecies(value)}
                    style={styles.picker}
                    dropdownIconColor="#d4ff00"
                  >
                    {speciesOptions.map((species) => (
                      <Picker.Item
                        key={species}
                        label={species}
                        value={species}
                        color="#000"
                      />
                    ))}
                  </Picker>
                </View>
                <TextInput
                  style={styles.editInput}
                  value={editConfidence}
                  onChangeText={setEditConfidence}
                  placeholder="Confidence Score (0-100)"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <TextInput
                  style={[styles.editInput, styles.notesInput]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Add notes..."
                  placeholderTextColor="#999"
                  multiline
                />
              </View>
            ) : (
              <>
                {/* AI Prediction Section - only show if we have actual AI data */}
                {item.aiSpecies && item.aiSpecies.trim() !== '' && (
                  <View style={styles.aiPredictionBox}>
                    <View style={styles.aiPredictionHeader}>
                      <Ionicons
                        name="sparkles"
                        size={16}
                        color="#d4ff00"
                      />
                      <Text style={styles.aiPredictionTitle}>
                        AI Prediction
                      </Text>
                    </View>
                    <View style={styles.aiPredictionContent}>
                      <View style={styles.aiPredictionItem}>
                        <Text style={styles.aiPredictionLabel}>Species</Text>
                        <Text style={styles.aiPredictionValue}>
                          {item.aiSpecies}
                        </Text>
                      </View>
                      <View style={styles.aiPredictionItem}>
                        <Text style={styles.aiPredictionLabel}>
                          Confidence
                        </Text>
                        <Text style={styles.aiPredictionValue}>
                          {item.aiConfidence != null &&
                          item.aiConfidence > 0
                            ? `${item.aiConfidence}%`
                            : 'N/A'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* User Confidence Section - show if volunteer confidence exists */}
                {item.volunteerConfidence && (
                  <View style={styles.userConfidenceBox}>
                    <View style={styles.userConfidenceHeader}>
                      <Ionicons
                        name="person"
                        size={16}
                        color="#4db8e8"
                      />
                      <Text style={styles.userConfidenceTitle}>
                        User Confidence
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.userConfidenceBadge,
                        item.volunteerConfidence === 'high' &&
                          styles.confidenceHigh,
                        item.volunteerConfidence === 'medium' &&
                          styles.confidenceMedium,
                        item.volunteerConfidence === 'low' &&
                          styles.confidenceLow,
                      ]}
                    >
                      <Text style={styles.userConfidenceText}>
                        {item.volunteerConfidence.charAt(0).toUpperCase() +
                          item.volunteerConfidence.slice(1)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Species Display */}
                <View style={styles.speciesDisplayBox}>
                  <Text style={styles.speciesDisplayText}>
                    {item.species ||
                      item.predictedSpecies ||
                      'Unknown Species'}
                  </Text>
                </View>
                <View style={styles.scoreContainer}>
                  <View style={styles.scoreBox}>
                    <Text style={styles.scoreLabel}>score</Text>
                    <Text style={styles.scoreValue}>
                      {item.confidence ?? 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.notesBox}>
                    <Text style={styles.notesText}>
                      {item.notes || 'No notes added'}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Audio Waveform Visualization Placeholder */}
            <View style={styles.waveformContainer}>
              <View style={styles.waveformBars}>
                {[...Array(20)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.waveformBar,
                      {
                        height: Math.random() * 30 + 10,
                        opacity: isPlaying ? 1 : 0.5,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[
                  styles.playButton,
                  isPlaying && styles.playButtonActive,
                ]}
                onPress={() =>
                  handlePlay(
                    item.audioURL,
                    item.recordingId,
                    item.filePath
                  )
                }
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={18}
                  color={isPlaying ? '#2d3e34' : '#fff'}
                />
                <Text
                  style={[
                    styles.playButtonText,
                    isPlaying && styles.playButtonTextActive,
                  ]}
                >
                  {isPlaying ? 'pause' : 'play'}
                </Text>
              </TouchableOpacity>
              {isEditing ? (
                <TouchableOpacity
                  style={[
                    styles.resubmitButton,
                    isSaving && styles.buttonDisabled,
                  ]}
                  onPress={() => handleResubmit(item.recordingId)}
                  disabled={isSaving}
                >
                  <Text style={styles.resubmitButtonText}>
                    {isSaving ? 'saving...' : 'save & resubmit'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.resubmitButton}
                  onPress={() => handleEdit(item)}
                >
                  <Text style={styles.resubmitButtonText}>
                    edit to resubmit
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.uploaderInfo}>
              <Text style={styles.uploaderName}>
                {item.submitterName}
              </Text>
              <Text style={styles.uploadStatus}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator
          size="large"
          color="#b8e986"
          style={{ marginTop: 100 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NavigationMenu
        isVisible={menuVisible}
        onClose={() => setMenuVisible(false)}
      />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.push(homeScreen as any)}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>History</Text>
          <View style={styles.titleUnderline} />
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
        >
          <Ionicons name="menu" size={32} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={24}
          color="#fff"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
          placeholderTextColor="#aaa"
        />
      </View>

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      {/* List */}
      <FlatList
        data={filteredRecordings}
        keyExtractor={(item) => item.recordingId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No recordings yet. Make one from the Record screen!
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3F5A47',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    marginBottom: 20,
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
    fontWeight: '400',
    color: '#fff',
  },
  titleUnderline: {
    width: 100,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d4ff00',
    marginTop: 4,
    alignSelf: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderWidth: 2,
    borderColor: '#d4ff00',
    borderRadius: 25,
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 20,
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  error: {
    padding: 12,
    color: '#ffdddd',
    textAlign: 'center',
  },
  emptyText: {
    padding: 16,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
  },
  itemContainer: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#3d4f44',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  speciesTag: {
    backgroundColor: '#d4ff00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  speciesTagText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2d3e34',
  },
  statusIcon: {
    marginBottom: 8,
  },
  locationText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
  },
  cardImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  expandedCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  expandedDate: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
  },
  editText: {
    fontSize: 16,
    color: '#d4ff00',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    color: '#333',
  },
  speciesDisplayBox: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#d4ff00',
  },
  speciesDisplayText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#d4ff00',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scoreContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  scoreBox: {
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3e34',
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2d3e34',
  },
  notesBox: {
    flex: 1,
    backgroundColor: '#3d4f44',
    borderWidth: 2,
    borderColor: '#d4ff00',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
  },
  notesText: {
    fontSize: 14,
    color: '#fff',
  },
  editContainer: {
    marginBottom: 12,
  },
  editInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  waveformContainer: {
    height: 60,
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  waveformBar: {
    width: 4,
    backgroundColor: '#d4ff00',
    borderRadius: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  playButton: {
    flex: 1,
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playButtonActive: {
    backgroundColor: '#d4ff00',
  },
  playButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  playButtonTextActive: {
    color: '#2d3e34',
  },
  resubmitButton: {
    flex: 1,
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  resubmitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  uploaderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  uploaderName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  uploadStatus: {
    fontSize: 14,
    color: '#aaa',
  },
  // AI Prediction styles
  aiPredictionBox: {
    backgroundColor: 'rgba(212, 255, 0, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  aiPredictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  aiPredictionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d4ff00',
  },
  aiPredictionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aiPredictionItem: {
    flex: 1,
  },
  aiPredictionLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 2,
  },
  aiPredictionValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // User Confidence styles
  userConfidenceBox: {
    backgroundColor: 'rgba(77, 184, 232, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(77, 184, 232, 0.3)',
  },
  userConfidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  userConfidenceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4db8e8',
  },
  userConfidenceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  userConfidenceText: {
    fontSize: 14,
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
