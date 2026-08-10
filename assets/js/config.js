window.UNIPOP_CONFIG = {
  appName: 'UniPop Display Builder',

  // Immer zuerst die aktuellste trainings.json aus dem main-Branch laden.
  // Der feste Commit ist nur Notfall-Fallback.
  jsonUrls: [
    'https://raw.githubusercontent.com/letzbug/franks_magic/main/data/trainings.json',
    'https://cdn.jsdelivr.net/gh/letzbug/franks_magic@main/data/trainings.json'
  ],

  organiserCode: 'UNIPOP',
  defaultScreen: 'belval',
  screens: [
    {id:'belval', name:'Belval', location:'Belval', enabled:true},
    {id:'ettelbruck', name:'Ettelbrück', location:'Ettelbrück', enabled:true},
    {id:'commune', name:'Commune', location:'Commune', enabled:true},
    {id:'expo', name:'Expo', location:'Expo', enabled:true}
  ],
  slideSeconds: 14,
  printCooldownSeconds: 15,
  maxPrintsPerHour: 20,
  qrFallback:'https://www.unipop.lu'
};
