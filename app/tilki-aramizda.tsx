import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type Stage = 'setup' | 'pass' | 'question' | 'answers' | 'discussion' | 'votePass' | 'vote' | 'result';
type Pair = { common: string; fox: string };
const PAIRS: Pair[] = [
  { common: 'Tatile giderken yanına ne alırsın?', fox: 'Evden çıkarken yanına ne alırsın?' },
  { common: 'Pikniğe ne götürürsün?', fox: 'Doğum günü partisine ne götürürsün?' },
  { common: 'Arkadaşlarınla hafta sonu nereye gidersin?', fox: 'İlk buluşmada nereye gidersin?' },
  { common: 'Bir süper gücün olsa ne seçerdin?', fox: 'Bir yeteneğin hemen gelişse hangisini seçerdin?' },
  { common: 'Sabah kahvaltısında ne yersin?', fox: 'Gece acıkınca ne yersin?' },
  { common: 'Yağmurlu bir günde ne yaparsın?', fox: 'Evde sıkılınca ne yaparsın?' },
  { common: 'Bir plajda ne görürsün?', fox: 'Bir havuz kenarında ne görürsün?' },
  { common: 'Bir seyahatte ne fotoğraflarsın?', fox: 'Bir kutlamada ne fotoğraflarsın?' },
  { common: 'Bir arkadaşına hangi hediyeyi alırsın?', fox: 'Kendine hangi hediyeyi alırsın?' },
  { common: 'Kamp yaparken neye ihtiyaç duyarsın?', fox: 'Uzun bir yolculukta neye ihtiyaç duyarsın?' },
  { common: 'Yaz akşamı ne içersin?', fox: 'Kış akşamı ne içersin?' },
  { common: 'Çocukken hangi oyunu oynardın?', fox: 'Arkadaşlarınla şimdi hangi oyunu oynarsın?' },
  { common: 'Bir restoranda ne sipariş edersin?', fox: 'Eve hangi yemeği söylersin?' },
  { common: 'Bir partiye giderken ne giyersin?', fox: 'Bir düğüne giderken ne giyersin?' },
  { common: 'Deniz kenarında ne yaparsın?', fox: 'Parkta ne yaparsın?' },
];
const pick = (n: number) => Math.floor(Math.random() * n);

export default function TilkiAramizda() {
  const [players, setPlayers] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState<Stage>('setup');
  const [index, setIndex] = useState(0);
  const [fox, setFox] = useState(0);
  const [pairIndex, setPairIndex] = useState(0);
  const [votes, setVotes] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<number[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(60);
  const pair = PAIRS[pairIndex];

  useEffect(() => {
    if (stage !== 'discussion' || seconds <= 0) return;
    const timer = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [stage, seconds]);

  function addPlayer() {
    const name = input.trim().replace(/\s+/g, ' ');
    if (!name) return setError('Bir oyuncu adı yaz.');
    if (name.length > 20) return setError('İsim en fazla 20 karakter olabilir.');
    if (players.some(p => p.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) return setError('Her oyuncu için farklı bir isim kullan.');
    if (players.length >= 10) return setError('En fazla 10 oyuncu eklenebilir.');
    setPlayers([...players, name]); setInput(''); setError('');
  }
  function start() {
    if (players.length < 4) return setError('Başlamak için en az 4 oyuncu ekle.');
    setFox(pick(players.length));
    setPairIndex(previous => (previous + 1 + pick(PAIRS.length - 1)) % PAIRS.length);
    setVotes([]); setCandidates(players.map((_, i) => i)); setChosen(null); setIndex(0); setSeconds(60); setError(''); setStage('pass');
  }
  function submitVote(target: number) {
    const next = [...votes, target];
    if (index < players.length - 1) { setVotes(next); setIndex(index + 1); setStage('votePass'); return; }
    const counts = candidates.map(c => ({ c, count: next.filter(v => v === c).length }));
    const maximum = Math.max(...counts.map(x => x.count));
    const tied = counts.filter(x => x.count === maximum).map(x => x.c);
    if (tied.length > 1) {
      // Everyone votes again, including tied players; self-votes are disallowed.
      // If only the voter is eligible, allow another tied candidate, never self.
      setCandidates(tied); setVotes([]); setIndex(0); setError('Oylar eşit! Kısa bir tartışmadan sonra eşit oy alanlar arasında tekrar oy verin.'); setStage('discussion'); setSeconds(30); return;
    }
    setChosen(tied[0]); setVotes(next); setStage('result');
  }
  const Button = ({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, secondary && styles.secondary]}><Text style={styles.buttonText}>{title}</Text></Pressable>
  );
  return <View style={styles.root}><LinearGradient colors={['#160e20', '#22132e', '#10151e']} style={StyleSheet.absoluteFill} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Geri dön"><Text style={styles.back}>‹  OYUN MODLARI</Text></Pressable>
      <Text style={styles.kicker}>🦊  TEK TELEFON · PARTİ OYUNU</Text><Text style={styles.title}>Tilki Aramızda</Text>
      {stage === 'setup' && <>
        <Text style={styles.lead}>Bir kişi farklı bir soru görecek. Cevapları dinleyin, şüphelinizi bulun!</Text>
        <View style={styles.panel}><Text style={styles.panelTitle}>Oyuncuları ekle</Text><Text style={styles.hint}>4–10 arkadaş · Telefon sırayla el değiştirecek</Text>
          <View style={styles.inputRow}><TextInput value={input} onChangeText={setInput} onSubmitEditing={addPlayer} placeholder="Oyuncu adı" placeholderTextColor="#8C8296" maxLength={20} style={styles.input} returnKeyType="done" /><Pressable onPress={addPlayer} style={styles.add}><Text style={styles.buttonText}>Ekle</Text></Pressable></View>
          {players.map((p, i) => <View style={styles.playerRow} key={`${p}-${i}`}><Text style={styles.player}>✦  {p}</Text><Pressable accessibilityLabel={`${p} oyuncusunu kaldır`} onPress={() => setPlayers(players.filter((_, j) => i !== j))}><Text style={styles.remove}>Kaldır</Text></Pressable></View>)}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View><Button title={`Oyunu başlat  ·  ${players.length}/10`} onPress={start} />
        <Text style={styles.small}>Sorular gizlice okunur, cevaplar sesli verilir. Sonra tartışın ve gizli oyla tilkiyi bulun.</Text>
      </>}
      {stage === 'pass' && <View style={styles.panel}><Text style={styles.step}>1 / 4  ·  GİZLİ SORULAR</Text><Text style={styles.hero}>Telefonu {players[index]} alsın</Text><Text style={styles.hint}>Diğerleri ekrana bakmasın. Hazır olduğunda kartı aç.</Text><Button title="Sorumu gör" onPress={() => setStage('question')} /></View>}
      {stage === 'question' && <View style={styles.panel}><Text style={styles.step}>SADECE {players[index].toLocaleUpperCase('tr-TR')} GÖRSÜN</Text><Text style={styles.question}>{index === fox ? pair.fox : pair.common}</Text><Text style={styles.hint}>Soruyu aklında tut, kimseye gösterme. Cevabını birazdan sesli söyleyeceksin.</Text><Button title={index === players.length - 1 ? 'Kartı kapat ve devam et' : 'Kartı kapat ve telefonu devret'} onPress={() => { if (index === players.length - 1) { setIndex(0); setStage('answers'); } else { setIndex(index + 1); setStage('pass'); } }} /></View>}
      {stage === 'answers' && <View style={styles.panel}><Text style={styles.step}>2 / 4  ·  CEVAP ZAMANI</Text><Text style={styles.hero}>Sıra {players[index]} kişisinde</Text><Text style={styles.hint}>Soruyu söylemeden cevabını sesli paylaş. Herkes dikkatle dinlesin!</Text><Text style={styles.progress}>{index + 1} / {players.length} oyuncu</Text><Button title={index === players.length - 1 ? 'Tartışmaya geç' : 'Sıradaki oyuncu'} onPress={() => { if (index === players.length - 1) { setIndex(0); setStage('discussion'); } else setIndex(index + 1); }} /></View>}
      {stage === 'discussion' && <View style={styles.panel}><Text style={styles.step}>3 / 4  ·  TARTIŞMA</Text><Text style={styles.hero}>Tilki kim olabilir?</Text><Text style={styles.hint}>Cevapları konuşun ve birbirinize sorular sorun. Gizli sorularınızı söylemeyin.</Text>{!!error && <Text style={styles.error}>{error}</Text>}<Text style={styles.timer}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text><Text style={styles.small}>{seconds === 0 ? 'Süre doldu, oylamaya geçebilirsiniz.' : 'Hazırsanız süreyi beklemeden geçebilirsiniz.'}</Text><Button title="Gizli oylamaya geç" onPress={() => { setIndex(0); setError(''); setStage('votePass'); }} /></View>}
      {stage === 'votePass' && <View style={styles.panel}><Text style={styles.step}>4 / 4  ·  GİZLİ OYLAMA</Text><Text style={styles.hero}>Telefonu {players[index]} alsın</Text><Text style={styles.hint}>Diğerleri ekrana bakmasın. Oyunu verdikten sonra telefon sıradaki kişiye geçecek.</Text><Button title="Oy vermeye hazırım" onPress={() => setStage('vote')} /></View>}
      {stage === 'vote' && <View style={styles.panel}><Text style={styles.step}>{players[index].toLocaleUpperCase('tr-TR')} OY KULLANIYOR</Text><Text style={styles.hero}>Sence tilki kim?</Text><Text style={styles.hint}>Bir isim seç. Kendine oy veremezsin.</Text>{candidates.filter(c => c !== index).map(c => <Pressable key={c} onPress={() => submitVote(c)} style={styles.choice} accessibilityRole="button"><Text style={styles.choiceText}>{players[c]}  →</Text></Pressable>)}</View>}
      {stage === 'result' && <View style={styles.panel}><Text style={styles.step}>TUR SONU</Text><Text style={styles.bigFox}>🦊</Text><Text style={styles.hero}>{chosen === fox ? 'Tilki yakalandı!' : 'Tilki aranızdan sıyrıldı!'}</Text><Text style={styles.lead}>Gizli tilki: {players[fox]}</Text><Text style={styles.hint}>En çok oy alan: {chosen === null ? '' : players[chosen]}</Text><View style={styles.reveal}><Text style={styles.step}>HERKESİN SORUSU</Text><Text style={styles.revealText}>{pair.common}</Text><Text style={styles.step}>TİLKİNİN SORUSU</Text><Text style={styles.revealText}>{pair.fox}</Text></View><Button title="Aynı oyuncularla yeniden oyna" onPress={start} /><Button title="Oyuncuları düzenle" secondary onPress={() => { setError(''); setStage('setup'); }} /></View>}
    </ScrollView></View>;
}
const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#160e20'}, content:{paddingHorizontal:20,paddingTop:58,paddingBottom:56,maxWidth:650,width:'100%',alignSelf:'center'}, back:{color:'#C8BBD0',fontSize:12,fontWeight:'800',marginBottom:30}, kicker:{color:'#FF9D67',fontSize:11,fontWeight:'900',letterSpacing:1.3}, title:{color:'#FFF',fontSize:34,fontWeight:'900',marginTop:8,marginBottom:12}, lead:{color:'#E9DDED',fontSize:16,lineHeight:24,marginBottom:18}, panel:{backgroundColor:'rgba(255,255,255,0.06)',borderWidth:1,borderColor:'rgba(255,255,255,0.12)',borderRadius:26,padding:22,marginTop:18,marginBottom:16}, panelTitle:{color:'#FFF',fontSize:21,fontWeight:'900'}, hint:{color:'#C4B8CA',fontSize:14,lineHeight:21,marginTop:10,marginBottom:18}, inputRow:{flexDirection:'row',gap:8,marginBottom:12}, input:{flex:1,backgroundColor:'#120E1B',color:'#FFF',borderRadius:14,paddingHorizontal:14,minHeight:50,fontSize:15}, add:{backgroundColor:'#8D5CD6',borderRadius:14,paddingHorizontal:18,justifyContent:'center'}, button:{backgroundColor:'#F56D3D',borderRadius:16,minHeight:54,alignItems:'center',justifyContent:'center',marginTop:12,paddingHorizontal:12}, secondary:{backgroundColor:'rgba(255,255,255,0.10)'}, buttonText:{color:'#FFF',fontSize:15,fontWeight:'800',textAlign:'center'}, playerRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.07)'}, player:{color:'#FFF',fontSize:15,fontWeight:'700'}, remove:{color:'#D0A6A2',fontSize:12}, error:{color:'#FFB08F',fontSize:13,lineHeight:19,marginTop:10}, small:{color:'#AFA1B7',fontSize:12,lineHeight:19,marginTop:15}, step:{color:'#FFAA74',fontSize:11,fontWeight:'900',letterSpacing:1.2,marginBottom:12}, hero:{color:'#FFF',fontSize:26,fontWeight:'900',lineHeight:33}, question:{color:'#FFF',fontSize:25,fontWeight:'800',lineHeight:34,marginVertical:18}, progress:{color:'#FFAD7B',fontWeight:'800',fontSize:13}, timer:{fontSize:54,color:'#FFF',fontWeight:'900',textAlign:'center',marginTop:8}, choice:{padding:17,backgroundColor:'rgba(255,255,255,0.08)',borderRadius:14,marginTop:8}, choiceText:{color:'#FFF',fontSize:16,fontWeight:'700'}, bigFox:{fontSize:58,marginBottom:12}, reveal:{backgroundColor:'rgba(0,0,0,0.20)',borderRadius:16,padding:16,marginTop:8}, revealText:{color:'#FFF',fontSize:15,lineHeight:22,marginBottom:18}
});
