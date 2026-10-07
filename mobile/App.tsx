import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

function getWebsiteUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_WEBSITE_URL?.trim();
  try {
    if (configured) {
      const url = new URL(configured);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    }
    // Expo Go supplies the computer's LAN address, not the phone's localhost.
    const hostUri = Constants.expoConfig?.hostUri;
    if (!__DEV__ || !hostUri) return null;
    const url = new URL(`http://${hostUri}`);
    url.port = '3000';
    url.pathname = '/';
    return url.href;
  } catch {
    return null;
  }
}

const websiteUrl = getWebsiteUrl();

export default function App() {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        {!websiteUrl || failed ? (
          <View style={styles.message}>
            <Text style={styles.title}>Cannot reach the website</Text>
            <Text style={styles.body}>
              {websiteUrl
                ? 'Keep the website running on your computer and connect your phone to the same Wi-Fi. Allow local network access for Expo Go.'
                : 'Set EXPO_PUBLIC_WEBSITE_URL in mobile/.env to your website’s full http:// or https:// address, then restart Expo.'}
            </Text>
            {websiteUrl && <Text selectable style={styles.address}>{websiteUrl}</Text>}
            {websiteUrl && (
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                onPress={() => {
                  setFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                <Text style={styles.buttonText}>Try again</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <WebView
            key={attempt}
            style={styles.container}
            source={{ uri: websiteUrl }}
            startInLoadingState
            allowsBackForwardNavigationGestures
            onError={() => setFailed(true)}
            onHttpError={(event) => {
              if (event.nativeEvent.url === websiteUrl) setFailed(true);
            }}
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#171717" />
                <Text style={styles.body}>Opening INnnovators…</Text>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  message: { flex: 1, justifyContent: 'center', padding: 28, gap: 18 },
  title: { fontSize: 24, fontWeight: '600', color: '#171717' },
  body: { fontSize: 16, lineHeight: 24, color: '#52525b' },
  address: { fontSize: 14, color: '#52525b' },
  button: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 24, backgroundColor: '#171717', borderRadius: 24 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#ffffff' },
});
