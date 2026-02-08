// login.tsx
import { Link, useRouter } from 'expo-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db, functions } from '../firebaseConfig';

export default function LoginScreen() {
  const router = useRouter();

  // login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // forgot-password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState('');
  const [ans1, setAns1] = useState('');
  const [ans2, setAns2] = useState('');
  const [ans3, setAns3] = useState('');
  const [fpBusy, setFpBusy] = useState(false);

  const handleLogin = async () => {
    setError('');
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      console.log('Logged in as:', cred.user.email);
      
      // Fetch user data to determine role
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      const userData = userDoc.data() || {};
      
      console.log('User data:', userData); // Debug log
      
      // Route to appropriate home screen based on role
      // Check both role field (string) and boolean fields for compatibility
      const userRole = userData.role?.toLowerCase() || '';
      const isAdmin = userData.isAdmin === true || userRole === 'admin';
      const isExpert = userData.isExpert === true || userRole === 'expert';
      
      if (isAdmin) {
        router.replace('./adminHomeScreen');
      } else if (isExpert) {
        router.replace('./expertHomeScreen');
      } else {
        router.replace('./volunteerHomeScreen');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    // ==== simple required-fields check ====
    if (
      !fpEmail.trim() ||
      !ans1.trim() ||
      !ans2.trim() ||
      !ans3.trim()
    ) {
      Alert.alert('Please fill out all fields.');
      return;
    }
    // ======================================

    setFpBusy(true);
    try {
      const verify = httpsCallable(functions, 'verifyAnswers');
      const res: any = await verify({
        email: fpEmail.trim().toLowerCase(),
        answers: [ans1.trim(), ans2.trim(), ans3.trim()],
      });

      if (res?.data?.allow) {
        try {
          await sendPasswordResetEmail(auth, fpEmail.trim().toLowerCase());
        } catch {}
      }

      Alert.alert(
        'Check your email',
        "If an account exists for that username, you will receive a password reset email."
      );
      setForgotOpen(false);
      setFpEmail(''); setAns1(''); setAns2(''); setAns3('');
    } catch (err) {
      console.log('Forgot flow error:', err);
      Alert.alert(
        'Check your email',
        "If an account exists for that username, you will receive a password reset email."
      );
      setForgotOpen(false);
    } finally {
      setFpBusy(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/images/gradient-background.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <Text style={styles.title}>Login</Text>

      <TextInput
        placeholder="Username"
        placeholderTextColor="#fff"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel="Email address input"
        accessibilityHint="Enter your email address to log in"
        testID="login-email-input"
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#fff"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
        accessibilityLabel="Password input"
        accessibilityHint="Enter your password to log in"
        testID="login-password-input"
      />

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        onPress={handleLogin}
        style={[styles.button, busy && { opacity: 0.7 }]}
        disabled={busy}
        accessibilityLabel="Log in"
        accessibilityHint="Press to log in to your account"
        accessibilityRole="button"
        testID="login-button"
      >
        {busy ? <ActivityIndicator /> : <Text style={styles.buttonText}>Enter</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setForgotOpen(true)}
        accessibilityLabel="Forgot password"
        accessibilityHint="Press to reset your password"
        accessibilityRole="button"
        testID="forgot-password-button"
      >
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>

      <Link
        href="./register"
        style={styles.link}
        accessibilityLabel="Register new account"
        accessibilityHint="Press to create a new account"
      >
        New user? Register here
      </Link>

      {/* Forgot password modal */}
      <Modal visible={forgotOpen} animationType="slide" transparent onRequestClose={() => setForgotOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset password</Text>

            <TextInput
              placeholder="Email"
              placeholderTextColor="#fafafaff"
              value={fpEmail}
              onChangeText={setFpEmail}
              style={styles.modalInput}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              placeholder="What city were you born in?"
              placeholderTextColor="#f1f1f1ff"
              value={ans1}
              onChangeText={setAns1}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="What is your favorite food?"
              placeholderTextColor="#f1f1f1ff"
              value={ans2}
              onChangeText={setAns2}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="What is your mother's maiden name?"
              placeholderTextColor="#f1f1f1ff"
              value={ans3}
              onChangeText={setAns3}
              style={styles.modalInput}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#cdddcfff' }]}
                onPress={handleForgot}
                disabled={fpBusy}
              >
                {fpBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Send email</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#222d22ff' }]}
                onPress={() => setForgotOpen(false)}
                disabled={fpBusy}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 40, fontWeight: '400', color: '#000', marginBottom: 20, marginLeft: 120 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 18,
    borderRadius: 30,
    paddingTop: 22,
    paddingBottom: 22,
    marginBottom: 10,
    fontSize: 18,
    color: '#fff',
  },
  button: {
    backgroundColor: '#2D3E32',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 50,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    alignSelf: 'center',
    minWidth: 160,
  },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '500' },
  link: { color: '#000', textAlign: 'center', marginTop: 8, textDecorationLine: 'underline' },
  error: { color: '#d32f2f', textAlign: 'center', marginBottom: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#252c25ff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#3ab132ff', marginBottom: 12 },
  modalInput: { backgroundColor: '#151515ff', padding: 16, borderRadius: 25, marginBottom: 16, fontSize: 16, color: '#fff' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#3ab132ff',
  },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});