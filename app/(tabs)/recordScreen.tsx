import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import NavigationMenu from '../../components/NavigationMenu';
import { auth, db } from '../firebaseConfig';
import { recordingsAPI } from '../../services/api';

const MAX_RECORD_SECONDS = 10;
const MAX_MS = MAX_RECORD_SECONDS * 1000;

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

export default function RecordScreen() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [timer, setTimer] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [homeScreen, setHomeScreen] = useState<string>('./volunteerHomeScreen');
  const [menuVisible, setMenuVisible] = useState(false);

  const recRef = useRef<Audio.Recording | null>(null);
  const stoppingRef = useRef(false);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const router = useRouter();

  // Initialize audio session on mount and when screen comes into focus
  useEffect(() => {
    const initAudio = async () => {
      try {
        // Request audio permissions early
        await Audio.requestPermissionsAsync();
        
        // Reset to playback mode first (clears any recording state)
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (err) {
        console.log('Audio init error:', err);
      }
    };
    initAudio();

    // Also reset when component unmounts
    return () => {
      const cleanup = async () => {
        try {
          if (recRef.current) {
            await recRef.current.stopAndUnloadAsync();
            recRef.current = null;
          }
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
          });
        } catch {}
      };
      cleanup();
    };
  }, []);

  // Reset audio session when screen comes into focus (e.g., after playing audio elsewhere)
  useFocusEffect(
    useCallback(() => {
      const resetAudioSession = async () => {
        try {
          // Stop any existing sound
          if (sound) {
            try {
              await sound.stopAsync();
              await sound.unloadAsync();
            } catch {}
            setSound(null);
          }
          
          // Reset to non-recording mode
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch (err) {
          console.log('Focus audio reset error:', err);
        }
      };
      resetAudioSession();
    }, [sound])
  );

  // Determine the correct home screen on mount
  useEffect(() => {
    getHomeScreen().then(setHomeScreen);
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission denied');
        setIsLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (sound) sound.unloadAsync().catch(() => {});
      if (recRef.current) recRef.current.stopAndUnloadAsync().catch(() => {});
    };
  }, [sound]);

  const startRecording = async () => {
    if (isRecording) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission denied');
        return;
      }

      // Unload any existing sound first
      if (sound) {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
        } catch {}
        setSound(null);
      }

      // Stop any existing recording
      if (recRef.current) {
        try {
          await recRef.current.stopAndUnloadAsync();
        } catch {}
        recRef.current = null;
      }

      // IMPORTANT: First disable recording mode to reset the session
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch {}

      // Wait for session to fully reset
      await new Promise(resolve => setTimeout(resolve, 200));

      // Now enable recording mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Another small delay after enabling recording
      await new Promise(resolve => setTimeout(resolve, 100));

      setAudioUri(null);
      setTimer(0);
      progressAnim.setValue(0);
      stoppingRef.current = false;
      if (autoStopRef.current) clearTimeout(autoStopRef.current);

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recRef.current = recording;

      recording.setOnRecordingStatusUpdate((st: any) => {
        const dur = Math.max(0, st?.durationMillis ?? 0);
        setTimer(Math.min(MAX_RECORD_SECONDS, Math.floor(dur / 1000)));
        progressAnim.setValue(Math.min(1, dur / MAX_MS));
      });
      // @ts-ignore runtime prop
      recording.setProgressUpdateInterval(150);

      setIsRecording(true);

      autoStopRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_MS);
    } catch (err) {
      console.error('Error starting recording', err);
      // Try to reset audio mode on error
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch {}
      Alert.alert('Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    const rec = recRef.current;
    if (!rec || stoppingRef.current) return;
    try {
      stoppingRef.current = true;
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current);
        autoStopRef.current = null;
      }
      setIsRecording(false);
      progressAnim.stopAnimation((v) => progressAnim.setValue(v));

      await rec.stopAndUnloadAsync();
      const tmpUri = rec.getURI();
      recRef.current = null;

      // Reset audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      if (!tmpUri) {
        Alert.alert('Recording error', 'No audio URI returned.');
        return;
      }

      try {
        const dir = FileSystem.documentDirectory + 'recordings/';
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const extMatch = tmpUri.match(/\.[a-z0-9]+$/i);
        const ext = extMatch ? extMatch[0] : '.m4a';
        const finalUri = `${dir}rec-${Date.now()}${ext}`;
        await FileSystem.copyAsync({ from: tmpUri, to: finalUri });
        setAudioUri(finalUri);
      } catch {
        setAudioUri(tmpUri);
      }
    } catch (err) {
      console.error('Error stopping recording', err);
      Alert.alert('Error', 'Could not stop recording.');
    } finally {
      stoppingRef.current = false;
    }
  };

  const toggleRecord = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const playAudio = async () => {
    if (!audioUri) return;
    try {
      const info = await FileSystem.getInfoAsync(audioUri);
      if (!info.exists) {
        Alert.alert('Audio missing', 'The recording is no longer available. Please re-record.');
        return;
      }

      if (sound) {
        const status: any = await sound.getStatusAsync();
        if (status?.isLoaded) {
          await sound.replayAsync();
          return;
        } else {
          await sound.unloadAsync().catch(() => {});
          setSound(null);
        }
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );
      setSound(newSound);
    } catch (err) {
      console.error('Error playing sound', err);
    }
  };

  const reRecord = () => {
    Alert.alert('Start New Recording?', 'This will delete the current recording.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: () => {
          setAudioUri(null);
          if (sound) {
            sound.unloadAsync().catch(() => {});
            setSound(null);
          }
          setTimer(0);
          progressAnim.setValue(0);
        },
      },
    ]);
  };

  const upload = () => {
    if (audioUri && location) {
      const currentUri = audioUri;
      router.push({
        pathname: './predictionScreen',
        params: {
          audioUri: currentUri,
          lat: String(location.latitude),
          lon: String(location.longitude),
        },
      });
      setAudioUri(null);
      setIsRecording(false);
      setTimer(0);
      progressAnim.setValue(0);
      if (sound) { sound.unloadAsync().catch(() => {}); setSound(null); }
    }
  };

  if (isLoading || !location) {
    return (
      <View style={styles.background}>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 50 }} />
      </View>
    );
  }

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.background}>
      <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.push(homeScreen as any)} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.iconButton}>
              <Ionicons name="menu" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isRecording ? 'Listening...' : audioUri ? 'Recording Complete' : 'Listening...'}
          </Text>

          {/* Map Container */}
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={{
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={location}>
                <View style={styles.markerCircle} />
              </Marker>
            </MapView>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <Animated.View style={[styles.progressBar, { width: progressBarWidth }]} />
          </View>

          {/* Timer */}
          <Text style={styles.timerText}>{timer}s</Text>

          {/* Record Button */}
          {!audioUri && (
            <TouchableOpacity
              style={styles.recordButton}
              onPress={toggleRecord}
              activeOpacity={0.8}
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
              accessibilityHint={isRecording ? 'Press to stop recording audio' : 'Press to start recording frog calls'}
              accessibilityRole="button"
              testID="record-button"
            >
              <View style={styles.recordButtonOuter}>
                <View style={[styles.recordButtonInner, isRecording && styles.recordingActive]} />
              </View>
            </TouchableOpacity>
          )}

          {/* Actions after recording */}
          {audioUri && !isRecording && (
            <View style={styles.actions} accessibilityRole="menu">
              <TouchableOpacity
                style={styles.actionButton}
                onPress={playAudio}
                accessibilityLabel="Play recording"
                accessibilityHint="Press to listen to your recorded audio"
                accessibilityRole="button"
                testID="play-recording-button"
              >
                <Text style={styles.actionText}>Play/Replay Recording</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={reRecord}
                accessibilityLabel="Re-record"
                accessibilityHint="Press to discard this recording and record again"
                accessibilityRole="button"
                testID="re-record-button"
              >
                <Text style={styles.actionText}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={upload}
                accessibilityLabel="Analyze recording"
                accessibilityHint="Press to submit your recording for species identification"
                accessibilityRole="button"
                testID="analyze-recording-button"
              >
                <Text style={styles.actionText}>Analyze Recording</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#3F5A47',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  container: {
    alignItems: 'center',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '400',
    color: '#ccff00',
    marginBottom: 30,
    letterSpacing: 0.5,
  },
  mapContainer: {
    width: '85%',
    height: 350,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  map: {
    flex: 1,
  },
  markerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4a90e2',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  progressBarContainer: {
    width: '85%',
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 4,
    marginTop: 30,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4a7c59',
    borderRadius: 4,
  },
  timerText: {
    fontSize: 28,
    fontWeight: '400',
    color: '#fff',
    marginTop: 15,
    letterSpacing: 1,
  },
  recordButton: {
    marginTop: 30,
    marginBottom: 20,
  },
  recordButtonOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2d3e34',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#c93939',
  },
  recordingActive: {
    backgroundColor: '#d32f2f',
  },
  actions: {
    marginTop: 20,
    marginBottom: 40,
    width: '85%',
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  analyzeButton: {
    backgroundColor: '#4a7c59',
    borderColor: '#4a7c59',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});