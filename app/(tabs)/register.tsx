// RegisterScreen.tsx
import { Link, router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [securityQ1, setSecurityQ1] = useState('');
  const [securityQ2, setSecurityQ2] = useState('');
  const [securityQ3, setSecurityQ3] = useState('');
  // SECURITY: All new users are created as Volunteers
  // Role upgrades to Expert/Admin must be done by an admin through the admin panel
  const role = 'Volunteer' as const;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError('');

    if (!email || !password || !firstName || !lastName || !securityQ1 || !securityQ2 || !securityQ3) {
      return setError('Please fill out all fields.');
    }
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return setError('Please enter a valid email.');

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      await updateProfile(cred.user, { displayName });

      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName,
        role,
        security: {
          q1: securityQ1.trim(),
          q2: securityQ2.trim(),
          q3: securityQ3.trim(),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert('Success', 'Account created!');
      router.replace('././recordScreen');
    } catch (e: any) {
      console.log('Registration error:', e);
      let msg = 'Could not create account.';
      if (e?.code === 'auth/email-already-in-use') msg = 'Email is already in use.';
      if (e?.code === 'auth/invalid-email') msg = 'Email address is invalid.';
      if (e?.code === 'auth/weak-password') msg = 'Password is too weak.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/images/gradient-background.png')}
      style={styles.background}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Register </Text>

        {/* First + Last Name in a row */}
        <View style={styles.nameRow}>
          <TextInput
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
            style={[styles.input, styles.nameInput]}
            placeholderTextColor="#fff"
          />

          <TextInput
            placeholder="Last Name"
            value={lastName}
            onChangeText={setLastName}
            style={[styles.input, styles.nameInput]}
            placeholderTextColor="#fff"
          />
        </View>

        <TextInput
          placeholder="Email (Username)"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#fff"
        />

        <TextInput
          placeholder="Password (min 6 characters)"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
          placeholderTextColor="#fff"
        />

        <Text style={styles.sectionTitle}>Security Questions:</Text>

        <TextInput
          placeholder="What city were you born in?"
          value={securityQ1}
          onChangeText={setSecurityQ1}
          style={styles.input}
          placeholderTextColor="#fff"
        />

        <TextInput
          placeholder="What is your favorite food?"
          value={securityQ2}
          onChangeText={setSecurityQ2}
          style={styles.input}
          placeholderTextColor="#fff"
        />

        <TextInput
          placeholder="What is your mother's maiden name?"
          value={securityQ3}
          onChangeText={setSecurityQ3}
          style={styles.input}
          placeholderTextColor="#fff"
        />

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          onPress={handleRegister}
          style={[styles.button, loading && { opacity: 0.7 }]}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
        </TouchableOpacity>

        <Link href="../login" asChild>
          <TouchableOpacity accessibilityRole="link">
            <Text style={styles.link}>Already have an account? Login here</Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    padding: 32,
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '400',
    color: '#000',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 0,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#000',
    textAlign: 'left',
    marginBottom: 16,
    paddingTop: 2,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 5, 
    marginBottom: 0,
  },
  nameInput: {
    flex: 1,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#fff',
  },
  button: {
    backgroundColor: '#000',
    padding: 14,
    borderRadius: 40,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  link: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '400',
    marginTop: 0,
    textDecorationLine: 'underline',
  },
  error: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
});
