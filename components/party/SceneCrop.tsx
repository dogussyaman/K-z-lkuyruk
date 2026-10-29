import { SvgXml } from 'react-native-svg';
import { View, StyleSheet, Text } from 'react-native';

const base =
  '<rect width="480" height="320" fill="#16233b"/><path d="M0 210H480V320H0Z" fill="#334356"/>';
const art = [
  '<path d="M0 285L480 250M0 310L480 275" stroke="#adb6c5" stroke-width="8"/><path d="M45 80H220V205H45Z" fill="#795049"/><path d="M60 105H150V150H60Z" fill="#edc873"/><circle cx="320" cy="65" r="38" fill="#eee4cc"/><path d="M320 40V65L340 79" fill="none" stroke="#253044" stroke-width="6"/><path d="M240 160H440V190H240ZM260 190V230M420 190V230" fill="#c76f46" stroke="#c76f46" stroke-width="8"/><text x="65" y="190" fill="white" font-size="23">BİLET</text>',
  '<path d="M15 20H210V200H15ZM230 20H465V200H230Z" fill="#347689" stroke="#8fc4d1" stroke-width="8"/><path d="M80 90L150 105L195 82L166 120L105 125L70 142L85 113L48 101Z" fill="#fff0ce"/><rect x="260" y="50" width="175" height="85" rx="10" fill="#122538"/><text x="280" y="100" fill="#efcb74" font-size="30">✈ →</text><path d="M25 245H190V270H25M45 270V305M175 270V305" stroke="#8595a6" stroke-width="8"/><path d="M300 220H350V285H300Z" fill="#e0a05c"/><path d="M310 220V205H340V220" fill="none" stroke="#e0a05c" stroke-width="6"/>',
  '<rect y="160" width="480" height="160" fill="#216f87"/><path d="M0 220Q60 200 120 220T240 220T360 220T480 220M0 275Q60 255 120 275T240 275T360 275T480 275" fill="none" stroke="#69bfc4" stroke-width="5"/><path d="M30 145H235L195 205H70Z" fill="#dba474"/><path d="M120 145V25L210 130H130" fill="#f5e7bf" stroke="#f5e7bf" stroke-width="4"/><path d="M295 0H380V320H295Z" fill="#87695c"/><circle cx="335" cy="70" r="22" fill="none" stroke="#d2b190" stroke-width="8"/><circle cx="335" cy="240" r="22" fill="none" stroke="#d2b190" stroke-width="8"/>',
  '<circle cx="130" cy="120" r="95" fill="none" stroke="#eea4a8" stroke-width="8"/><path d="M130 25V215M35 120H225M63 53L197 187M63 187L197 53M130 120L70 300M130 120L200 300" stroke="#e0b57d" stroke-width="5"/><circle cx="130" cy="25" r="17" fill="#f2d16e"/><circle cx="35" cy="120" r="17" fill="#7fd7cc"/><circle cx="225" cy="120" r="17" fill="#b299ee"/><path d="M270 165L360 50L450 165Z" fill="#dc667e"/><path d="M280 165H440V290H280Z" fill="#714879"/><path d="M325 215H395V290H325Z" fill="#f2c27c"/><circle cx="290" cy="175" r="6" fill="#fff3a3"/><circle cx="350" cy="175" r="6" fill="#fff3a3"/><circle cx="420" cy="175" r="6" fill="#fff3a3"/>',
  '<path d="M20 30H220V285H20ZM260 30H460V285H260Z" fill="#715344"/><path d="M25 110H215M25 200H215M265 110H455M265 200H455" stroke="#bd946f" stroke-width="9"/><path d="M45 45V100M70 50V100M97 43V100M145 55V100M180 43V100M285 130V190M315 135V190M350 130V190M400 135V190" stroke="#69a6a7" stroke-width="18"/><path d="M300 45L350 45L370 93H280Z" fill="#f6d982"/><path d="M325 93V110" stroke="#f6d982" stroke-width="8"/><path d="M65 235L115 250L170 230V280L115 295L65 280Z" fill="#eee1bd"/>',
  '<path d="M30 200L90 15L150 200ZM290 170L350 10L410 170Z" fill="#376b58"/><path d="M90 170V280M350 150V260" stroke="#9a7554" stroke-width="12"/><path d="M140 290L245 120L345 290Z" fill="#e8b86b"/><path d="M245 140L300 290H195Z" fill="#b36a4c"/><path d="M385 275L420 190L455 275Z" fill="#ee7c4f"/><path d="M390 280L450 300M390 300L450 280" stroke="#d2b78e" stroke-width="9"/><circle cx="205" cy="40" r="24" fill="#eee5ab"/>',
];
export function SceneCrop({
  scene,
  crop = 0,
  full = false,
}: {
  scene: number;
  crop?: number;
  full?: boolean;
}) {
  const box = full
    ? '0 0 480 320'
    : `${(crop % 2) * 240} ${Math.floor((crop % 4) / 2) * 160} 240 160`;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${base}${art[scene] ?? art[0]}</svg>`;
  return (
    <View style={styles.frame}>
      <SvgXml xml={xml} width="100%" height={220} />
      {!full && <Text style={styles.label}>SANA AİT KARE · {crop + 1}/4</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ffffff33',
    backgroundColor: '#16233b',
  },
  label: {
    color: '#d8e3ed',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    padding: 12,
    textAlign: 'center',
  },
});
