// Each item names the other button followed by the result of the combination.
export const HELP_ACTIONS = {
  MGD: {
    tr: [['Makas düğmesi', 'makası çevirin.'], ['Hat maniası düğmesi', 'hat maniasının konumunu değiştirin.']],
    en: [['Points button', 'move the points.'], ['Derailer button', 'move the derailer.']],
    de: [['Weichentaste', 'die Weiche umzustellen.'], ['Gleissperrentaste', 'die Gleissperre umzustellen.']],
  },
  MD: { tr:[['MGD','makası çevirin.'],['MYD','meşgul makası çevirin.']], en:[['MGD','move the points.'],['MYD','move occupied points.']], de:[['MGD','die Weiche umzustellen.'],['MYD','die besetzt gemeldete Weiche umzustellen.']] },
  Derailer: { tr:[['MGD','hat maniasının konumunu değiştirin.'],['MYD','meşguliyet varken hat maniasının konumunu değiştirin.']], en:[['MGD','move the derailer.'],['MYD','move the derailer despite occupancy.']], de:[['MGD','die Gleissperre umzustellen.'],['MYD','die Gleissperre trotz Belegtmeldung umzustellen.']] },
  SD: { tr:[['Yol düğmesi','seyir yolu tanzim edin.'],['STGD','açık sinyali kırmızıya döndürün.'],['SYİYD','sinyal kırmızıyken giriş seyir yolunu iptal edin.'],['SGD','manevraya izin verin.'],['YSGD','yedek sinyali etkinleştirin; tren geçene kadar basılı tutun.']], en:[['Track button','set a route.'],['STGD','return a cleared signal to red.'],['SYİYD','cancel the entry route when the signal is red.'],['SGD','permit shunting.'],['YSGD','show the substitute indication; hold until the train passes.']], de:[['Gleistaste','eine Fahrstraße einzustellen.'],['STGD','das Signal auf Halt zu stellen.'],['SYİYD','bei Halt die Einfahrstraße aufzulösen.'],['SGD','eine Rangierfahrt zuzulassen.'],['YSGD','das Ersatzsignal einzuschalten; gedrückt halten, bis die Zugspitze am Signal vorbeigefahren ist.']] },
  SHUNTING_SIGNAL: { tr:[['SGD','manevraya izin verin.'],['STGD','açık sinyali kırmızıya döndürün.']], en:[['SGD','permit shunting.'],['STGD','return the signal to stop.']], de:[['SGD','eine Rangierfahrt zuzulassen.'],['STGD','das Signal auf Halt zu stellen.']] },
  RT: { tr:[['Başlangıç sinyali düğmesi','bu hedefe seyir yolu tanzim edin.']], en:[['Starting signal button','set a route to this target.']], de:[['Signaltaste','eine Fahrstraße zu diesem Ziel einzustellen.']] },
  STGD: { tr:[['Sinyal düğmesi','sinyali kırmızıya döndürün.']], en:[['Signal button','return the signal to red.']], de:[['Signaltaste','das Signal auf Halt zu stellen.']] },
  SGD: { tr:[['Sinyal düğmesi','uygun sinyalde manevraya izin verin.']], en:[['Signal button','permit shunting at a suitable signal.']], de:[['Signaltaste','an einem geeigneten Signal eine Rangierfahrt zuzulassen.']] },
  YSGD: { tr:[['Sinyal düğmesi','yedek sinyali etkinleştirin; tren geçene kadar basılı tutun.']], en:[['Signal button','show the substitute indication; hold until the train passes.']], de:[['Signaltaste','das Ersatzsignal einzuschalten; gedrückt halten, bis die Zugspitze am Signal vorbeigefahren ist.']] },
  SYIYD: {
    tr:[['Giriş sinyali düğmesi','giriş seyir yolunu iptal edin. Sinyal kırmızı olmalıdır.'],['Hat düğmesi','çıkış seyir yolunu iptal edin. Çıkış sinyali kırmızı olmalıdır.']],
    en:[['Entry signal button','cancel the entry route with its signal at red.'],['Line button','cancel the exit route with its signal at red.']],
    de:[['Einfahrsignaltaste','bei Halt die Einfahrstraße aufzulösen.'],['Streckentaste','bei Halt zeigendem Ausfahrsignal die Ausfahrstraße aufzulösen.']],
  },
  MYD: {
    tr: [['Makas düğmesi', 'meşgul makası çevirin.'], ['Hat maniası düğmesi', 'meşguliyet varken hat maniasının konumunu değiştirin.']],
    en: [['Points button', 'move the points despite occupancy.'], ['Derailer button', 'move the derailer despite occupancy.']],
    de: [['Weichentaste', 'die Weiche trotz Belegtmeldung umzustellen.'], ['Gleissperrentaste', 'die Gleissperre trotz Belegtmeldung umzustellen.']],
  },
  DISD: { tr:[['Yol düğmesi','devamlı işletmeyi açın. Giriş seyir yolu tanzimli ve giriş sinyali açık olmalıdır.']], en:[['Track button','enable through operation. The entry route must be set and its signal cleared.']], de:[['Gleistaste','den Durchgangsbetrieb einzuschalten. Die Einfahrstraße muss eingestellt und das Einfahrsignal freigestellt sein.']] },
  DGBD: { tr:[['Yol düğmesi','devamlı işletmeyi kapatın.']], en:[['Track button','disable through operation.']], de:[['Gleistaste','den Durchgangsbetrieb zurückzunehmen.']] },
};

// Exit signals use the line target button for auxiliary route cancellation.
HELP_ACTIONS.EXIT_SD = Object.fromEntries(Object.entries(HELP_ACTIONS.SD).map(([locale, actions]) =>
  [locale, actions.filter(([button]) => button !== 'SYİYD').map(([button, action], index) =>
    [index === 0 ? { tr: 'Hat düğmesi', en: 'Line button', de: 'Streckentaste' }[locale] : button, action])]));
HELP_ACTIONS.EXIT_RT = {
  tr: [...HELP_ACTIONS.RT.tr, ['SYİYD', 'çıkış sinyali kırmızıyken çıkış seyir yolunu iptal edin.']],
  en: [...HELP_ACTIONS.RT.en, ['SYİYD', 'cancel the exit route when its signal is red.']],
  de: [...HELP_ACTIONS.RT.de, ['SYİYD', 'bei Halt zeigendem Ausfahrsignal die Ausfahrstraße aufzulösen.']],
};

HELP_ACTIONS.LT = HELP_ACTIONS.EXIT_RT;
