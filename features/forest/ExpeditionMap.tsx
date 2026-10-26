import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Polygon, Text as SvgText, Rect } from 'react-native-svg';
const points = [[38,190],[110,190],[170,145],[105,100],[170,55],[250,75],[290,145]];
export function ExpeditionMap({a=0,b=0}:{a?:number;b?:number}) {
 return <View style={styles.board} accessibilityLabel={`Sefer haritası. Yaprak ${a}/6, Ateş ${b}/6 adım.`}>
  <Text style={styles.caption}>FISILTI ORMANI</Text>
  <Svg width="100%" height={235} viewBox="0 0 340 235">
   {[[30,45],[55,105],[220,180],[295,28],[315,215],[200,110]].map(([x,y],i)=><G key={i}><Rect x={x-2} y={y+12} width={4} height={14} fill="#6B5135"/><Polygon points={`${x},${y-12} ${x-13},${y+17} ${x+13},${y+17}`} fill="#315E42"/><Polygon points={`${x},${y-19} ${x-10},${y+6} ${x+10},${y+6}`} fill="#43794F"/></G>)}
   <Path d="M38 190 L110 190 Q185 190 170 145 Q160 115 105 100 Q70 60 170 55 Q250 35 250 75 L290 145" fill="none" stroke="#A78A55" strokeWidth={13} opacity={0.25}/>
   <Path d="M38 190 L110 190 Q185 190 170 145 Q160 115 105 100 Q70 60 170 55 Q250 35 250 75 L290 145" fill="none" stroke="#C2AB78" strokeWidth={2} strokeDasharray="4 7"/>
   {points.map(([x,y],i)=><G key={i}><Circle cx={x} cy={y} r={18} fill={i===6?'#66502A':'#193C2B'} stroke={i===6?'#FFD166':'#688964'} strokeWidth={2}/><SvgText x={x} y={y+5} textAnchor="middle" fill="#F4E5C1" fontSize={13} fontWeight="bold">{i===6?'★':i===0?'⚑':i%2===0?'◆':String(i)}</SvgText><SvgText x={x} y={y+34} textAnchor="middle" fill="#B7CDB7" fontSize={10}>{i===6?'HAZİNE':i===0?'KAMP':i%2===0?'HARİTA':'GEÇİT'}</SvgText></G>)}
   {([['Y',a,'#A6E58B',-12],['A',b,'#FFA970',12]] as const).map(([label,progress,color,offset])=>{const [x,y]=points[Math.max(0,Math.min(6,progress))];return <G key={label}><Circle cx={x+offset} cy={y-22} r={11} fill={color} stroke="#0C2117" strokeWidth={2}/><SvgText x={x+offset} y={y-18} textAnchor="middle" fill="#10251A" fontWeight="bold" fontSize={11}>{label}</SvgText></G>;})}
  </Svg>
  <Text style={styles.legend}>● Yaprak (Y)     ● Ateş (A)     ◆ Harita parçası</Text>
 </View>;
}
const styles=StyleSheet.create({board:{backgroundColor:'#102C22',borderRadius:24,borderWidth:1,borderColor:'#446343',padding:12},caption:{color:'#D9C38F',fontSize:11,fontWeight:'900',letterSpacing:3,textAlign:'center'},legend:{color:'#B7CDB7',fontSize:11,textAlign:'center',paddingBottom:4}});
