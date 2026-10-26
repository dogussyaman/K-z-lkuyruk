export type Supplies = { progress: number; fragments: number; food: number; rope: number; torch: number; morale: number };
export function lockedReason(action: string, s?: Supplies): string | null {
  if (!s) return 'Takım bilgisi bekleniyor';
  if (action === 'use_rope' && s.rope < 1) return 'Önce ip topla';
  if (action === 'use_torch' && s.torch < 1) return 'Önce meşale topla';
  if (action === 'camp' && s.food < 1) return 'Önce erzak topla';
  if (action === 'claim_treasure' && (s.progress < 6 || s.fragments < 3)) return '6 adım ve 3 parça gerekiyor';
  return null;
}
export function nextMission(s?: Supplies) {
  if (!s) return { title: 'Ekibin hazırlanıyor', detail: 'Takımlar belirlendiğinde sefer başlayacak.', action: 'explore' };
  if (s.progress >= 6 && s.fragments >= 3) return { title: 'Sandığı aç!', detail: 'Haritan tamamlandı. Hazineyi aç hamlesini onaylayarak kazan.', action: 'claim_treasure' };
  if (s.progress % 2 === 1 && s.rope === 0 && s.torch === 0) return { title: 'Geçit için ekipman topla', detail: 'Keşif burada ilerlemez. Erzak topla ile ip bul, sonraki sıranda geçidi aş.', action: 'forage' };
  return { title: `${Math.min(3, Math.floor(s.progress / 2) + 1)}. harita parçasına ulaş`, detail: `Bir sonraki parça ${Math.min(6, (Math.floor(s.progress / 2) + 1) * 2)}. adımda. İp köprüsü 2 adım, keşif ve meşale 1 adım ilerletir.`, action: s.rope > 0 ? 'use_rope' : s.torch > 0 ? 'use_torch' : 'explore' };
}
