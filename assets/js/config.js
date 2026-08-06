window.UNIPOP_CONFIG = {
  appName: 'UniPop Display Builder',

  // Immer zuerst die aktuellste trainings.json aus dem main-Branch laden.
  // Der feste Commit ist nur Notfall-Fallback.
  jsonUrls: [
    'https://raw.githubusercontent.com/letzbug/franks_magic/main/data/trainings.json',
    'https://cdn.jsdelivr.net/gh/letzbug/franks_magic@main/data/trainings.json'
  ],

  organiserCode: 'UNIPOP',
  defaultScreen: 'commune-01',
  screens: [
    {id:'commune-01', name:'Commune – Écran 1', location:'Commune', enabled:true},
    {id:'nouveau-site-01', name:'Nouveau site – Écran 1', location:'Nouveau site', enabled:true}
  ],
  slideSeconds: 14,
  printCooldownSeconds: 15,
  maxPrintsPerHour: 20,
  qrFallback: 'https://www.unipop.lu/'
};
