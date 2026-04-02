const SPREADSHEET_ID   = '1tIOt0SDTcLobXytLAmq71MeWsUi_3UwJghjTBprNVGM';
const CARPETA_RAIZ_ID  = '1PDo2nLguyM6WhtVJOQ1QxknrA8x87phU'; // SISTEMA GESTION EMPLEADOS

// ── Schema de hojas Sheets ────────────────────────────────────
const SCHEMA = {
  empleados: [
    'id','fechaAlta','nombres','apellidos','carnet','email','telefono',
    'fechaNacimiento','direccion','tipoContrato','clasificacion',
    'jornada','departamento','plaza','salarioBase','activo','fechaBaja',
    'certMedicoFecha',
    'fotoEmpleadoId','fotoCarnetId','carpetaExpId',
    'contratoId','obligacionesId',
    'contratoFechaFirma','contratoObs'
  ],
  plazas: [
    'id','departamento','nombre','salarioBase','clasificacion',
    'jornada','tipoContrato','descripcion','funcionesPdfId','funcionesPdfUrl'
  ],
  traslados:         ['id','empleadoId','fecha','motivo','deptAnterior','plazaAnterior','deptNuevo','plazaNueva','clasificacionNueva'],
  bajas:             ['id','empleadoId','fecha','motivo','registradoPor','bajaPDFId'],
  sanciones:         ['id','empleadoId','fecha','tipo','motivo','docPDFId'],
  nominas:           ['id','periodo','mes','ano','mesNombre','estado','totalDevengado','fechaAprobacion'],
  nominaLineas:      ['id','nominaId','empleadoId','diasTrabajados','horasExtras','totalDevengado'],
  incidencias:       ['id','empleadoId','tipo','periodo','fechaInicio','fechaFin','diasAfectados'],
  vacacionesControl: ['id','empleadoId','ano','diasTomados'],
  historialSalarial: ['id','empleadoId','fecha','anterior','nuevo','motivo'],
  asistencia:        ['id','empleadoId','fecha','estado','turno','horaEntrada','horaSalida','nota'],
  auditLog:          ['fecha','rol','tipo','detalle'],
  config:            ['clave','valor'],
  documentos:        ['id','empleadoId','tipo','nombre','fileId','viewUrl','fecha','tamaño']
};

const CONFIG_DEFAULT = [
  ['pinRrhh','1111'],['pinJuridico','2222'],['pinContabilidad','3333'],
  ['pinJefeTurno','4444'],
  ['bonAnios1','5'],['bonNivel1','5'],['bonAnios2','10'],['bonNivel2','10'],
  ['recargoHE','50'],['diasVacaciones','14'],['diasPagados','15']
];

// ═══════════════════════════════════════════════════════════════
// ENTRY POINTS
// ═══════════════════════════════════════════════════════════════

function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    var params = {};
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      params = e.parameter;
    }

    var accion      = params.accion;
    var tablaNombre = params.tabla;

    // ── Sin tabla ────────────────────────────────────────────
    if (accion === 'ping')  return jsonOk({ message: 'La Catedral SGI v2.1 ✅', ts: new Date().toISOString() });
    if (accion === 'setup') return jsonOk(setupHojas());

    // ── Acciones Drive ───────────────────────────────────────
    if (accion === 'crearCarpetaEmpleado')  return crearCarpetaEmpleado(params);
    if (accion === 'crearCarpetaPlaza')     return crearCarpetaPlaza(params);
    if (accion === 'getCarpetaPlazasId')    return getCarpetaPlazasIdAction();
    if (accion === 'subirDrive')            return subirDrive(params);
    if (accion === 'eliminarDrive')         return eliminarDrive(params);
    if (accion === 'leerDrive')             return leerDrive(params);

    // ── Email ────────────────────────────────────────────────
    if (accion === 'enviarEmail')           return enviarEmail(params);

    // ── Acciones Config ──────────────────────────────────────
    if (accion === 'leerConfig')    return leerConfig(tablaNombre);
    if (accion === 'guardarConfig') return guardarConfig(tablaNombre, params);

    // ── CRUD Sheets ──────────────────────────────────────────
    if (!tablaNombre) return jsonError('Parámetro "tabla" requerido');
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(tablaNombre);
    if (!sheet) return jsonError('Hoja no encontrada: ' + tablaNombre + '. Ejecuta accion=setup primero.');

    if (accion === 'leer')           return leer(sheet);
    if (accion === 'insertar')       return insertar(sheet, tablaNombre, params);
    if (accion === 'actualizar')     return actualizar(sheet, tablaNombre, params);
    if (accion === 'eliminar')       return eliminar(sheet, params);
    if (accion === 'leerDocumentos') return leerDocumentosPorEmpleado(sheet, params);

    return jsonError('Acción no reconocida: ' + accion);

  } catch (err) {
    return jsonError('Error interno: ' + err.toString());
  }
}

// ═══════════════════════════════════════════════════════════════
// CRUD SHEETS
// ═══════════════════════════════════════════════════════════════

function leer(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return jsonOk({ data: [] });
  var rows    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = rows[0].map(String);
  var data    = [];
  for (var i = 1; i < rows.length; i++) {
    var obj = {}; var hasContent = false;
    for (var j = 0; j < headers.length; j++) {
      var val = rows[i][j];
      if (val instanceof Date) val = Utilities.formatDate(val, 'UTC', 'yyyy-MM-dd');
      obj[headers[j]] = (val !== null && val !== undefined) ? val : '';
      if (val !== '' && val !== null && val !== undefined) hasContent = true;
    }
    if (hasContent) data.push(obj);
  }
  return jsonOk({ data: data });
}

function insertar(sheet, tablaNombre, params) {
  if (!params.valores) return jsonError('"valores" requerido');
  var headers = safeGetHeaders(sheet);
  if (headers.length === 0) return jsonError('Hoja sin encabezados: ' + tablaNombre);
  var row = headers.map(function(h) {
    var v = params.valores[h];
    return (v !== undefined && v !== null) ? String(v) : '';
  });
  sheet.appendRow(row);
  return jsonOk({ message: 'Insertado en ' + tablaNombre });
}

function actualizar(sheet, tablaNombre, params) {
  if (!params.id)      return jsonError('"id" requerido');
  if (!params.valores) return jsonError('"valores" requerido');
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return jsonError('Hoja vacía');
  var rows    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = rows[0].map(String);
  var idCol   = headers.indexOf('id');
  if (idCol === -1) return jsonError('Columna "id" no encontrada en ' + tablaNombre);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(params.id)) {
      var newRow = headers.map(function(h, j) {
        var v = params.valores[h];
        if (v !== undefined && v !== null && v !== '') return String(v);
        var old = rows[i][j];
        if (old instanceof Date) return Utilities.formatDate(old, 'UTC', 'yyyy-MM-dd');
        return (old !== undefined && old !== null) ? old : '';
      });
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return jsonOk({ message: 'Actualizado: ' + params.id });
    }
  }
  return jsonError('No encontrado id: ' + params.id);
}

function eliminar(sheet, params) {
  if (!params.id) return jsonError('"id" requerido');
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return jsonError('Hoja vacía');
  var rows  = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var hdrs  = rows[0].map(String);
  var idCol = hdrs.indexOf('id');
  if (idCol === -1) return jsonError('Columna "id" no encontrada');
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(params.id)) {
      sheet.deleteRow(i + 1);
      return jsonOk({ message: 'Eliminado: ' + params.id });
    }
  }
  return jsonError('No encontrado id: ' + params.id);
}

function leerDocumentosPorEmpleado(sheet, params) {
  if (!params.empleadoId) return jsonError('"empleadoId" requerido');
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return jsonOk({ data: [] });
  var rows    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = rows[0].map(String);
  var empCol  = headers.indexOf('empleadoId');
  if (empCol === -1) return jsonError('Columna empleadoId no encontrada');
  var data = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][empCol]) === String(params.empleadoId)) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = rows[i][j];
      data.push(obj);
    }
  }
  return jsonOk({ data: data });
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

function leerConfig(tablaNombre) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(tablaNombre || 'config');
  if (!sheet) return jsonOk({ data: {} });
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return jsonOk({ data: {} });
  var rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var cfg  = {};
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) cfg[String(rows[i][0])] = String(rows[i][1]);
  }
  return jsonOk({ data: cfg });
}

function guardarConfig(tablaNombre, params) {
  if (!params.valores) return jsonError('"valores" requerido');
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(tablaNombre || 'config');
  if (!sheet) return jsonError('Hoja config no encontrada');
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var clavesFila = {};
  if (lastRow >= 2 && lastCol >= 1) {
    var rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0]) clavesFila[String(rows[i][0])] = i + 1;
    }
  }
  var vals = params.valores;
  for (var k in vals) {
    if (clavesFila[k]) {
      sheet.getRange(clavesFila[k], 2).setValue(String(vals[k]));
    } else {
      sheet.appendRow([k, String(vals[k])]);
    }
  }
  return jsonOk({ message: 'Config guardada' });
}

// ═══════════════════════════════════════════════════════════════
// DRIVE — GESTIÓN DE ARCHIVOS
// ═══════════════════════════════════════════════════════════════

function getCarpetaExpedientes() {
  var raiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
  var iter = raiz.getFoldersByName('expedientes');
  if (iter.hasNext()) return iter.next();
  return raiz.createFolder('expedientes');
}

function getCarpetaPlazas() {
  var raiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
  var iter = raiz.getFoldersByName('plazas');
  if (iter.hasNext()) return iter.next();
  return raiz.createFolder('plazas');
}

/**
 * getCarpetaPlazasIdAction
 * Devuelve el ID de la carpeta plazas/ (crea si no existe).
 * El frontend lo cachea en STATE.config.plazasCarpetaId.
 */
function getCarpetaPlazasIdAction() {
  try {
    var carpeta = getCarpetaPlazas();
    return jsonOk({ carpetaId: carpeta.getId(), carpetaUrl: carpeta.getUrl() });
  } catch(e) {
    return jsonError('Error obteniendo carpeta plazas: ' + e.toString());
  }
}

/**
 * crearCarpetaEmpleado
 * params: { empleadoId, nombreCarpeta }
 */
function crearCarpetaEmpleado(params) {
  if (!params.empleadoId)    return jsonError('"empleadoId" requerido');
  if (!params.nombreCarpeta) return jsonError('"nombreCarpeta" requerido');
  try {
    var carpetaExp = getCarpetaExpedientes();
    var iter = carpetaExp.getFoldersByName(params.nombreCarpeta);
    var carpeta = iter.hasNext() ? iter.next() : carpetaExp.createFolder(params.nombreCarpeta);
    return jsonOk({ carpetaId: carpeta.getId(), carpetaUrl: carpeta.getUrl() });
  } catch(e) {
    return jsonError('Error creando carpeta empleado: ' + e.toString());
  }
}

/**
 * crearCarpetaPlaza
 * params: { nombre } — nombre descriptivo de la plaza (ej: "SALA_Camarero")
 * Crea subcarpeta dentro de plazas/
 */
function crearCarpetaPlaza(params) {
  if (!params.nombre) return jsonError('"nombre" requerido');
  try {
    var carpetaPlazas = getCarpetaPlazas();
    var iter = carpetaPlazas.getFoldersByName(params.nombre);
    var carpeta = iter.hasNext() ? iter.next() : carpetaPlazas.createFolder(params.nombre);
    return jsonOk({ carpetaId: carpeta.getId(), carpetaUrl: carpeta.getUrl() });
  } catch(e) {
    return jsonError('Error creando carpeta plaza: ' + e.toString());
  }
}

/**
 * subirDrive
 * params: { base64, mimeType, nombre, carpetaId }
 */
function subirDrive(params) {
  if (!params.base64)    return jsonError('"base64" requerido');
  if (!params.nombre)    return jsonError('"nombre" requerido');
  if (!params.carpetaId) return jsonError('"carpetaId" requerido');
  try {
    var b64 = params.base64;
    if (b64.indexOf(',') !== -1) b64 = b64.split(',')[1];
    var bytes    = Utilities.base64Decode(b64);
    var blob     = Utilities.newBlob(bytes, params.mimeType || 'application/octet-stream', params.nombre);
    var carpeta  = DriveApp.getFolderById(params.carpetaId);
    var archivo  = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId       = archivo.getId();
    var viewUrl      = 'https://drive.google.com/file/d/' + fileId + '/view';
    var thumbnailUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';
    return jsonOk({ fileId: fileId, viewUrl: viewUrl, thumbnailUrl: thumbnailUrl, nombre: params.nombre, tamaño: archivo.getSize() });
  } catch(e) {
    return jsonError('Error subiendo archivo: ' + e.toString());
  }
}

/**
 * eliminarDrive
 * params: { fileId }
 */
function eliminarDrive(params) {
  if (!params.fileId) return jsonError('"fileId" requerido');
  try {
    DriveApp.getFileById(params.fileId).setTrashed(true);
    return jsonOk({ message: 'Archivo movido a papelera: ' + params.fileId });
  } catch(e) {
    return jsonError('Error eliminando: ' + e.toString());
  }
}

/**
 * leerDrive
 * params: { fileId }
 */
function leerDrive(params) {
  if (!params.fileId) return jsonError('"fileId" requerido');
  try {
    var file = DriveApp.getFileById(params.fileId);
    var blob = file.getBlob();
    return jsonOk({ base64: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType(), nombre: file.getName(), tamaño: file.getSize() });
  } catch(e) {
    return jsonError('Error leyendo archivo: ' + e.toString());
  }
}

// ═══════════════════════════════════════════════════════════════
// EMAIL
// ═══════════════════════════════════════════════════════════════

/**
 * enviarEmail
 * params: {
 *   para:          string  — email destinatario
 *   asunto:        string  — asunto del correo
 *   cuerpo:        string  — texto plano del mensaje
 *   fileId:        string  — ID del archivo en Drive a adjuntar (opcional)
 *   nombreArchivo: string  — nombre del adjunto (opcional)
 * }
 * Usa MailApp (gratuito: 100 emails/día cuenta personal, 1500/día Workspace)
 */
function enviarEmail(params) {
  if (!params.para)   return jsonError('"para" requerido');
  if (!params.asunto) return jsonError('"asunto" requerido');
  try {
    var options = {
      name: 'La Catedral — RRHH',
      htmlBody: params.cuerpoHtml || ('<p>' + (params.cuerpo || '') + '</p>')
    };
    if (params.fileId) {
      var file = DriveApp.getFileById(params.fileId);
      var blob = file.getBlob();
      blob.setName(params.nombreArchivo || file.getName());
      options.attachments = [blob];
    }
    MailApp.sendEmail(params.para, params.asunto, params.cuerpo || '', options);
    return jsonOk({ message: 'Email enviado a ' + params.para });
  } catch(e) {
    return jsonError('Error enviando email: ' + e.toString());
  }
}

// ═══════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════

function setupHojas() {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  var creadas = [];
  var ok      = [];

  for (var nombre in SCHEMA) {
    var cols  = SCHEMA[nombre];
    var sheet = ss.getSheetByName(nombre);
    if (!sheet) {
      sheet = ss.insertSheet(nombre);
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
      estilizarEncabezado(sheet, cols.length);
      sheet.setFrozenRows(1);
      if (nombre === 'config') {
        for (var i = 0; i < CONFIG_DEFAULT.length; i++) sheet.appendRow(CONFIG_DEFAULT[i]);
      }
      creadas.push(nombre);
    } else {
      var lastCol = sheet.getLastColumn();
      var existingHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
      var missing = cols.filter(function(h) { return existingHeaders.indexOf(h) === -1; });
      if (missing.length > 0) {
        var startCol = lastCol > 0 ? lastCol + 1 : 1;
        sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
        ok.push(nombre + ' (+cols: ' + missing.join(', ') + ')');
      } else {
        ok.push(nombre + ' ✅');
      }
    }
  }

  // Crear carpetas base en Drive
  try { getCarpetaExpedientes(); ok.push('📁 expedientes/ ✅'); } catch(e) { ok.push('⚠️ expedientes/: ' + e); }
  try { getCarpetaPlazas();      ok.push('📁 plazas/ ✅');      } catch(e) { ok.push('⚠️ plazas/: ' + e); }

  ['Hoja 1','Hoja1','Sheet1','Sheet 1'].forEach(function(n) {
    var h = ss.getSheetByName(n);
    if (h && ss.getSheets().length > 1) { try { ss.deleteSheet(h); } catch(e) {} }
  });

  return { message: 'Setup v2.1 completado ✅', creadas: creadas, verificadas: ok };
}

function estilizarEncabezado(sheet, numCols) {
  var r = sheet.getRange(1, 1, 1, numCols);
  r.setBackground('#6B1A1A');
  r.setFontColor('#F5EDD5');
  r.setFontWeight('bold');
  r.setFontSize(11);
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function safeGetHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function jsonOk(obj) {
  obj.status = 'success';
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonError(msg) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: msg })).setMimeType(ContentService.MimeType.JSON);
}

function runSetup() {
  var r = setupHojas();
  Logger.log(JSON.stringify(r, null, 2));
}
