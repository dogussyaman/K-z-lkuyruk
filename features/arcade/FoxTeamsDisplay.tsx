import { useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import type { ArcadePlayer } from './types';

interface FoxTeamsDisplayProps {
  players: ArcadePlayer[];
  scores: unknown;
  animated: boolean;
  activeTeam?: number;
  currentPlayerId?: string | null;
}

export function FoxTeamsDisplay({ players, scores, animated, activeTeam, currentPlayerId }: FoxTeamsDisplayProps) {
  const [motion] = useState(() => new Animated.Value(animated ? 0 : 1));
  const teamScores = Array.isArray(scores) ? scores : [0, 0];

  useEffect(() => {
    if (!animated) {
      motion.setValue(1);
      return;
    }
    motion.setValue(0);
    const animation = Animated.spring(motion, {
      toValue: 1,
      speed: 1.2,
      bounciness: 8,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [animated, motion]);

  return (
    <View style={styles.teams}>
      {[0, 1].map((team) => {
        const red = team === 0;
        const offset = motion.interpolate({ inputRange: [0, 1], outputRange: [red ? -140 : 140, 0] });
        return (
          <Animated.View
            key={team}
            style={[
              styles.team,
              red ? styles.redTeam : styles.blueTeam,
              { transform: [{ translateX: offset }, { scale: activeTeam === team ? 1.02 : 1 }] },
            ]}
          >
            <View style={styles.teamHeader}>
              <Text style={styles.teamName}>{red ? '🦊 Kızıl Tilkiler' : '🦊 Mavi Tilkiler'}</Text>
              <Text style={styles.score}>{Number(teamScores[team] ?? 0)}</Text>
            </View>
            {players.filter((player) => player.team === team).map((player) => (
              <Text key={player.id} style={styles.player} numberOfLines={1}>
                {player.isHost ? '👑 ' : ''}
                {player.name}
                {player.id === currentPlayerId ? ' · SIRA' : ''}
              </Text>
            ))}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  teams: { flexDirection: 'row', gap: 10, width: '100%' },
  team: { flex: 1, minWidth: 0, borderRadius: 18, borderWidth: 1, padding: 14, gap: 9 },
  redTeam: { backgroundColor: '#361A24', borderColor: '#F06A78' },
  blueTeam: { backgroundColor: '#14283A', borderColor: '#55C8F2' },
  teamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  teamName: { color: '#F4F7FB', fontWeight: '900', fontSize: 13 },
  score: { color: '#FFFFFF', fontWeight: '900', fontSize: 22 },
  player: { color: '#D5E0EA', fontSize: 12, fontWeight: '700' },
});
