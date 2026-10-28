import { Image, StyleSheet, Text, View } from 'react-native';
import { memo, useMemo, useState } from 'react';
import { SvgXml } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography } from '@/theme';
import {
  avatarOf,
  defaultDiceBearAvatarKey,
  diceBearAvatarSvg,
} from '@/features/game/players';
import { getSpecialAvatar } from '@/features/game/specialAvatars';
import { useTheme } from '@/theme/ThemeProvider';

interface AvatarProps {
  avatarKey?: string | null;
  userId?: string | null;
  size?: number;
  online?: boolean;
  ring?: boolean;
}

export const UserAvatar = memo(function UserAvatar({
  avatarKey,
  userId,
  size = 44,
  online,
  ring,
}: AvatarProps) {
  const { colors: themeColors } = useTheme();
  const special = getSpecialAvatar(avatarKey);

  const av = avatarOf(avatarKey);
  const imageUri = /^(https?:|file:|content:)/.test(avatarKey ?? '') ? avatarKey ?? null : null;
  const fallbackKey =
    imageUri ? defaultDiceBearAvatarKey(userId) : avatarKey || defaultDiceBearAvatarKey(userId);
  const diceBearSvg = useMemo(() => diceBearAvatarSvg(fallbackKey), [fallbackKey]);
  const [loadedImageUri, setLoadedImageUri] = useState<string | null>(null);
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const imageLoaded = imageUri !== null && loadedImageUri === imageUri;
  const imageFailed = imageUri !== null && failedImageUri === imageUri;

  if (special) {
    return (
      <View style={{ position: 'relative' }}>
        <View
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: 'hidden',
              borderWidth: ring ? 2 : 0,
              borderColor: ring ? themeColors.purpleSoft : 'transparent',
              backgroundColor: themeColors.bgSurfaceAlt,
            },
          ]}
        >
          <Image
            source={special.source}
            style={{ width: size, height: size }}
            resizeMode="cover"
          />
        </View>
        {online !== undefined ? (
          <View
            style={[
              styles.dot,
              { backgroundColor: online ? themeColors.success : themeColors.textMuted },
            ]}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ position: 'relative' }}>
      <LinearGradient
        colors={[av.gradient[0], av.gradient[1]]}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: 'hidden',
            borderWidth: ring ? 2 : 0,
            borderColor: ring ? themeColors.purpleSoft : 'transparent',
          },
        ]}
      >
        {diceBearSvg ? (
          <SvgXml xml={diceBearSvg} width={size} height={size} />
        ) : (
          <Text style={{ fontSize: size * 0.5 }}>{av.emoji}</Text>
        )}
        {imageUri && !imageFailed ? (
          <Image
            source={{ uri: imageUri }}
            style={[StyleSheet.absoluteFill, { opacity: imageLoaded ? 1 : 0 }]}
            onLoad={() => setLoadedImageUri(imageUri)}
            onError={() => setFailedImageUri(imageUri)}
          />
        ) : null}
      </LinearGradient>
      {online !== undefined ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: online ? themeColors.success : themeColors.textMuted },
          ]}
        />
      ) : null}
    </View>
  );
});

export const Avatar = UserAvatar;

export function AvatarStack({ keys, max = 4, size = 32 }: { keys: string[]; max?: number; size?: number }) {
  const { colors: themeColors } = useTheme();
  const shown = keys.slice(0, max);
  const extra = Math.max(0, keys.length - max);
  return (
    <View style={styles.stack}>
      {shown.map((k, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.35, zIndex: shown.length - i }}>
          <Avatar avatarKey={k} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.extra, {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: themeColors.bgElevated,
          borderColor: themeColors.borderStrong,
        }]}>
          <Text style={[styles.extraText, { color: themeColors.textSecondary }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.bgDark,
  },
  stack: { flexDirection: 'row', alignItems: 'center' },
  extra: {
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  extraText: { ...typography.caption, color: colors.textSecondary },
});
