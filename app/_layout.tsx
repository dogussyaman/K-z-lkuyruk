import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import {
  useFonts,
} from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { SplashScreen } from 'expo-router';
import { colors } from '@/theme';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GameStoreProvider, useGameStore } from '@/store/gameStore';
import { KizilkuyrukLoading } from '@/components/loading/KizilkuyrukLoading';
import { BotDirector } from '@/components/BotDirector';
import { soundService } from '@/services/soundService';
import { PrototypeProvider } from '@/features/prototype/PrototypeProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'zarto-web-input-reset';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      input, textarea, select, [contenteditable="true"] {
        outline: none !important;
        box-shadow: none !important;
        -webkit-tap-highlight-color: transparent;
      }
    `;
    document.head.appendChild(style);
  }
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    void soundService.preload();
    return () => soundService.destroy();
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-Medium': Poppins_500Medium,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgDarkest, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.purpleSoft} size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <GameStoreProvider>
        <PrototypeProvider>
          <RootNavigator />
        </PrototypeProvider>
      </GameStoreProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { mode } = useTheme();
  const { isInitialized } = useGameStore();
  const [showStartupLoading, setShowStartupLoading] = useState(true);
  const finishStartupLoading = useCallback(() => setShowStartupLoading(false), []);

  if (showStartupLoading) {
    return (
      <KizilkuyrukLoading
        done={isInitialized}
        onFinish={finishStartupLoading}
      />
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
        <Stack.Screen name="create-room" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="mode-create-room" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="join-room" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="category-select"
          options={{
            animation: 'slide_from_bottom',
            presentation: 'modal',
          }}
        />
        <Stack.Screen name="lobby" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="ability-select"
          options={{
            animation: 'slide_from_bottom',
            presentation: 'modal',
          }}
        />
        <Stack.Screen name="question" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="waiting" options={{ animation: 'fade' }} />
        <Stack.Screen name="result" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="scoreboard" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="game-over" options={{ animation: 'fade' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <BotDirector />
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
    </>
  );
}
