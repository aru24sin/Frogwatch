// context/DataContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, getDocs, DocumentData } from 'firebase/firestore';
import { auth, db } from '../app/firebaseConfig';

// Types
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
  timestampISO?: string;
  timestamp?: Date;
  confidence?: number;
  volunteerConfidence?: 'high' | 'medium' | 'low';
  notes?: string;
  submitterName?: string;
  aiSpecies?: string;
  aiConfidence?: number;
};

type User = {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  location: string;
  isExpert: boolean;
  isPendingExpert: boolean;
  submissionCount: number;
  avatarColor: string;
};

type DataContextType = {
  // User's own recordings
  myRecordings: Recording[];
  myRecordingsLoading: boolean;
  refreshMyRecordings: () => void;
  
  // All users (for admin)
  allUsers: User[];
  allUsersLoading: boolean;
  refreshAllUsers: () => void;
  
  // All recordings (for admin/expert map view)
  allRecordings: Recording[];
  allRecordingsLoading: boolean;
  refreshAllRecordings: () => void;
  
  // Initial load complete
  initialLoadComplete: boolean;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

const avatarColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

export function DataProvider({ children }: { children: ReactNode }) {
  const [myRecordings, setMyRecordings] = useState<Recording[]>([]);
  const [myRecordingsLoading, setMyRecordingsLoading] = useState(true);
  
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(true);
  
  const [allRecordings, setAllRecordings] = useState<Recording[]>([]);
  const [allRecordingsLoading, setAllRecordingsLoading] = useState(true);
  
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Helper to parse recording data
  const parseRecording = (doc: any, data: DocumentData): Recording => {
    const ts = data.timestamp;
    const timestampISO = ts?.toDate?.()?.toLocaleDateString?.() ?? data.timestamp_iso ?? 'Unknown';
    const lat = Number(data?.location?.lat) || 0;
    const lon = Number(data?.location?.lng) || 0;
    
    return {
      recordingId: data.recordingId ?? doc.id,
      userId: data.userId ?? '',
      predictedSpecies: data.predictedSpecies ?? '',
      species: data.species ?? '',
      audioURL: data.audioURL || data.audioUrl || '',
      filePath: data.filePath || (data.fileName ? `uploaded_audios/${data.userId}/${data.fileName}` : undefined),
      location: { latitude: lat, longitude: lon },
      locationCity: data.locationCity || 'Unknown Location',
      status: data.status ?? 'pending_analysis',
      timestampISO,
      timestamp: ts?.toDate?.() || new Date(),
      confidence: typeof data.confidenceScore === 'number' ? Math.round(data.confidenceScore * 100) : undefined,
      volunteerConfidence: data.volunteerConfidenceLevel || data.volunteerConfidence || undefined,
      notes: data.notes || '',
      submitterName: data.submitter?.displayName || 
        `${data.submitter?.firstName || ''} ${data.submitter?.lastName || ''}`.trim() || 'Unknown',
      aiSpecies: data.aiSpecies || data.predictedSpecies || '',
      aiConfidence: typeof data.aiConfidence === 'number' 
        ? Math.round(data.aiConfidence * 100)
        : typeof data.confidenceScore === 'number'
          ? Math.round(data.confidenceScore * 100)
          : undefined,
    };
  };

  // Load user's own recordings with real-time updates
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupMyRecordingsListener = (userId: string) => {
      setMyRecordingsLoading(true);
      const q = query(collection(db, 'recordings'), where('userId', '==', userId));
      
      unsubscribe = onSnapshot(q, (snap) => {
        const rows: Recording[] = [];
        snap.docs.forEach((doc) => {
          rows.push(parseRecording(doc, doc.data()));
        });
        // Sort by date (newest first)
        rows.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0;
          return b.timestamp.getTime() - a.timestamp.getTime();
        });
        setMyRecordings(rows);
        setMyRecordingsLoading(false);
      }, (error) => {
        if (auth.currentUser) {
          console.error('Error fetching my recordings:', error);
        }
        setMyRecordingsLoading(false);
      });
    };

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
      
      if (user) {
        setCurrentUserId(user.uid);
        setupMyRecordingsListener(user.uid);
      } else {
        setCurrentUserId(null);
        setMyRecordings([]);
        setMyRecordingsLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Load all users (for admin screen) - fetch once, not real-time
  const loadAllUsers = useCallback(async () => {
    try {
      setAllUsersLoading(true);
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData: User[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data() as DocumentData;
        
        // Skip admin users
        const roleStr = (userData.role || '').toString().toLowerCase();
        const userIsAdmin = userData.isAdmin === true || roleStr === 'admin';
        if (userIsAdmin) continue;

        // Get recordings count
        const recordingsQuery = query(
          collection(db, 'recordings'),
          where('userId', '==', userDoc.id)
        );
        const recordingsSnapshot = await getDocs(recordingsQuery);

        const userIsExpert = userData.isExpert === true || roleStr === 'expert';

        usersData.push({
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
        });
      }

      usersData.sort((a, b) => b.submissionCount - a.submissionCount);
      setAllUsers(usersData);
      setAllUsersLoading(false);
    } catch (error) {
      console.error('Error loading users:', error);
      setAllUsersLoading(false);
    }
  }, []);

  // Load all recordings (for map view)
  const loadAllRecordings = useCallback(async () => {
    try {
      setAllRecordingsLoading(true);
      const snapshot = await getDocs(collection(db, 'recordings'));
      const rows: Recording[] = [];
      
      snapshot.docs.forEach((doc) => {
        rows.push(parseRecording(doc, doc.data()));
      });
      
      rows.sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        return b.timestamp.getTime() - a.timestamp.getTime();
      });
      
      setAllRecordings(rows);
      setAllRecordingsLoading(false);
    } catch (error) {
      console.error('Error loading all recordings:', error);
      setAllRecordingsLoading(false);
    }
  }, []);

  // Initial load after auth
  useEffect(() => {
    if (currentUserId && !initialLoadComplete) {
      // Pre-fetch all data in background
      Promise.all([
        loadAllUsers(),
        loadAllRecordings(),
      ]).then(() => {
        setInitialLoadComplete(true);
      });
    }
  }, [currentUserId, initialLoadComplete, loadAllUsers, loadAllRecordings]);

  // Reset on logout
  useEffect(() => {
    if (!currentUserId) {
      setAllUsers([]);
      setAllRecordings([]);
      setInitialLoadComplete(false);
    }
  }, [currentUserId]);

  const value: DataContextType = {
    myRecordings,
    myRecordingsLoading,
    refreshMyRecordings: () => {}, // Real-time listener handles this
    
    allUsers,
    allUsersLoading,
    refreshAllUsers: loadAllUsers,
    
    allRecordings,
    allRecordingsLoading,
    refreshAllRecordings: loadAllRecordings,
    
    initialLoadComplete,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
