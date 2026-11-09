export const INDICATOR_STATES = {
  track: {
    tr: [['Kırmızı','Ray devresi meşgul.'],['Sarı','Seyir yolu kilitli.'],['Sönük','Ray devresi boş, seyir yolu yok.']],
    en: [['Red','Track circuit occupied.'],['Yellow','Route locked.'],['Dark','Track circuit clear, no route.']],
    de: [['Rot','Gleis besetzt.'],['Gelb','Fahrstraße verschlossen.'],['Dunkel','Gleis frei, keine Fahrstraße.']],
  },
  point: {
    tr: [['Sabit sarı','Makas bu konumda.'],['Sabit kırmızı','Makas bu konumda ve meşgul.'],['Yanıp sönen sarı','Makas hareket ediyor veya konumunu kaybetti.'],['Yanıp sönen kırmızı','Makas meşgul ve konumuna ulaşmadı.'],['İki kol yanıp sönüyor','Makastan ters çıkıldı.']],
    en: [['Steady yellow','Points detected in this position.'],['Steady red','Points detected in this position and occupied.'],['Flashing yellow','Points moving or position not detected.'],['Flashing red','Points occupied and not detected in position.'],['Both branches flashing','Points have been trailed.']],
    de: [['Gelbes Ruhelicht','Weiche in dieser Endlage.'],['Rotes Ruhelicht','Weiche in dieser Endlage und besetzt.'],['Gelbes Blinklicht','Weiche läuft oder Endlage nicht überwacht.'],['Rotes Blinklicht','Weiche besetzt und Endlage nicht überwacht.'],['Beide Zweige blinkend','Weiche aufgefahren.']],
  },
};
