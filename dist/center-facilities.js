export const CENTER_FACILITIES={
 vab:{name:'VAB · ロケット組立棟',description:'縦置きでロケットを組み立てます。設計を保存したら発射台へ。',button:'enterVAB'},
 sph:{name:'SPH · 航空機格納庫',description:'航空機・ローバー・船舶を組み立てます。保存した航空機は滑走路から出発。',button:'enterSPH'},
 pad:{name:'発射台',description:'保存した設計を選んで打ち上げます。飛行中の別の機体も残ります。',button:'centerPad'},
 runway:{name:'滑走路',description:'保存した設計を選んで地上から出発します。組立棟へ戻って調整できます。',button:'centerRunway'},
 tracking:{name:'追跡施設',description:'飛行中の機体と軌道を確認して、操縦・観察を再開します。',button:'centerTracking'}
};
export function centerGuidance({partCount,designCount,vesselCount,libraryError=false}){
 return [
  {title:'造る',text:partCount?`作業中 ${partCount} 部品。VAB/SPHで調整し「保存」で出発用の設計を残します。`:'VAB/SPHへ入り、部品を組み合わせて機体を作りましょう。'},
  {title:'出発する',text:libraryError?'保存設計を確認できません。発射台・滑走路で詳細を確認できます。':designCount?`保存済み ${designCount} 設計。発射台・滑走路で版を選んで出発できます。`:'保存設計はまだありません。組立棟の「保存」、または発射台の「一覧に保存」から始めます。'},
  {title:'追跡・再開',text:vesselCount?`保持中 ${vesselCount} 機。追跡施設で機体を選び、操縦や観察へ戻れます。`:'出発後は追跡施設で機体と軌道を確認できます。センターへ戻っても飛行は残ります。'}
 ];
}
