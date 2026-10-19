// Configuración del dashboard. Copia este fichero como config.local.js (ignorado por git)
// y pon ahí tus valores reales. El build usa config.local.js si existe; si no, este.
window.CP_CONFIG = {
  // ID de tu Google Sheet (lo que va entre /d/ y /edit en la URL).
  // Vacío = modo local: el dashboard pide que arrastres el .xlsx exportado.
  sheetId: '',

  title: 'Cuentas Personales',

  // Grupos para la tabla "Saldo por cuenta" y la vista "Por grupo" del patrimonio.
  // Las cuentas que no estén en ningún grupo aparecen en "Otras cuentas".
  // color (opcional): uno de --s1 … --s8 de la paleta.
  accountGroups: [
    { name: 'Ahorro disponible', accounts: ['Ahorro', 'Efectivo', 'Imprevistos'] },
    { name: 'Inversiones', accounts: ['Inversiones', 'Plan Pensiones'] },
    { name: 'Operativo', accounts: ['Nómina', 'Gastos', 'Hogar'] }
  ],

  // Color fijo por categoría de la hoja Inversiones (opcional).
  investmentCategoryColors: { 'Fondos': '--s1', 'Plan Pensiones': '--s5', 'Inmobiliario': '--s2', 'Financiero': '--s3', 'Cripto': '--s7' }
};
