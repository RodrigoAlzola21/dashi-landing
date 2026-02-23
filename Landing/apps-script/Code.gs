const RESPONSES_SHEET_NAME = 'Respuestas';
const LOGS_SHEET_NAME = 'Logs';
const MAX_MESSAGE_LENGTH = 1000;
const MAX_NAME_LENGTH = 80;
const MAX_WHATSAPP_LENGTH = 40;

// Opcional: si el script NO esta vinculado al spreadsheet, completa este ID.
const FALLBACK_SPREADSHEET_ID = '';

function doPost(e) {
  var spreadsheet = null;
  var sheet = null;
  var rowAppended = null;
  var payloadInfo = { data: {}, postDataType: '', postDataContents: '' };
  var logError = '';

  try {
    spreadsheet = getSpreadsheet_();
    payloadInfo = parsePayload_(e);

    appendLog_(spreadsheet, {
      error: '',
      postDataType: payloadInfo.postDataType,
      postDataContents: payloadInfo.postDataContents,
      note: 'doPost received'
    });

    sheet = getOrCreateSheet_(spreadsheet, RESPONSES_SHEET_NAME);
    ensureResponseHeaders_(sheet);

    var data = sanitizePayload_(payloadInfo.data || {});
    validatePayload_(data);
    var serverTs = new Date().toISOString();

    if (data.website) {
      appendLog_(spreadsheet, {
        error: '',
        postDataType: payloadInfo.postDataType,
        postDataContents: payloadInfo.postDataContents,
        note: 'honeypot hit - ignored'
      });

      return jsonResponse_({
        ok: true,
        sheetName: sheet.getName(),
        spreadsheetName: spreadsheet.getName(),
        spreadsheetId: spreadsheet.getId(),
        rowAppended: null,
        received: Object.keys(data),
        ignored: true,
        reason: 'honeypot'
      });
    }

    sheet.appendRow([
      data.ts || '',
      data.rating || '',
      data.name || '',
      data.whatsapp || '',
      data.message || '',
      data.pageUrl || '',
      data.userAgent || '',
      data.source || '',
      serverTs
    ]);

    rowAppended = sheet.getLastRow();

    appendLog_(spreadsheet, {
      error: '',
      postDataType: payloadInfo.postDataType,
      postDataContents: payloadInfo.postDataContents,
      note: 'appendRow OK row=' + rowAppended
    });

    return jsonResponse_({
      ok: true,
      sheetName: sheet.getName(),
      spreadsheetName: spreadsheet.getName(),
      spreadsheetId: spreadsheet.getId(),
      rowAppended: rowAppended,
      received: Object.keys(data)
    });
  } catch (err) {
    logError = (err && err.stack) ? String(err.stack) : String(err);

    try {
      if (!spreadsheet) {
        spreadsheet = tryGetSpreadsheet_();
      }
      if (spreadsheet) {
        appendLog_(spreadsheet, {
          error: logError,
          postDataType: payloadInfo.postDataType || '',
          postDataContents: payloadInfo.postDataContents || '',
          note: 'doPost error'
        });
      }
    } catch (logErr) {
      // Si falla incluso el logging, continuamos devolviendo JSON de error.
      logError += ' | logError=' + String(logErr);
    }

    return jsonResponse_({
      ok: false,
      sheetName: sheet ? sheet.getName() : RESPONSES_SHEET_NAME,
      spreadsheetName: spreadsheet ? spreadsheet.getName() : null,
      spreadsheetId: spreadsheet ? spreadsheet.getId() : null,
      rowAppended: rowAppended,
      received: Object.keys((payloadInfo && payloadInfo.data) || {}),
      error: logError
    });
  }
}

function doGet() {
  var ss = tryGetSpreadsheet_();
  return jsonResponse_({
    ok: true,
    status: 'web app alive',
    spreadsheetName: ss ? ss.getName() : null,
    spreadsheetId: ss ? ss.getId() : null
  });
}

function tryGetSpreadsheet_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (FALLBACK_SPREADSHEET_ID) return SpreadsheetApp.openById(FALLBACK_SPREADSHEET_ID);
  return null;
}

function getSpreadsheet_() {
  var ss = tryGetSpreadsheet_();
  if (!ss) {
    throw new Error('No active spreadsheet found. Bind the Apps Script to the target spreadsheet or set FALLBACK_SPREADSHEET_ID.');
  }
  return ss;
}

function parsePayload_(e) {
  var postData = (e && e.postData) ? e.postData : {};
  var postDataType = postData.type || '';
  var postDataContents = postData.contents || '';
  var data = {};

  if (postDataContents) {
    try {
      data = JSON.parse(postDataContents);
    } catch (jsonErr) {
      data = parseFormLike_(postDataContents);
      data._parseError = String(jsonErr);
    }
  } else if (e && e.parameter) {
    data = e.parameter;
  }

  return {
    data: data,
    postDataType: postDataType,
    postDataContents: postDataContents
  };
}

function parseFormLike_(raw) {
  var out = {};
  if (!raw) return out;

  raw.split('&').forEach(function (pair) {
    if (!pair) return;
    var parts = pair.split('=');
    var key = decodeURIComponent(String(parts[0] || '').replace(/\+/g, ' '));
    var value = decodeURIComponent(String(parts.slice(1).join('=') || '').replace(/\+/g, ' '));
    if (key) out[key] = value;
  });

  return out;
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function ensureResponseHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow([
    'ts',
    'rating',
    'name',
    'whatsapp',
    'message',
    'pageUrl',
    'userAgent',
    'source',
    'serverReceivedTs'
  ]);
}

function ensureLogHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow([
    'fecha',
    'postDataType',
    'postDataContentsTrunc',
    'error',
    'spreadsheetId',
    'spreadsheetName',
    'activeSpreadsheetId',
    'activeSpreadsheetName',
    'note'
  ]);
}

function appendLog_(spreadsheet, info) {
  var logsSheet = getOrCreateSheet_(spreadsheet, LOGS_SHEET_NAME);
  ensureLogHeaders_(logsSheet);
  var active = SpreadsheetApp.getActiveSpreadsheet();

  var contents = String(info.postDataContents || '');
  var contentsTrunc = contents.length > 500 ? contents.slice(0, 500) + '...' : contents;

  logsSheet.appendRow([
    new Date().toISOString(),
    info.postDataType || '',
    contentsTrunc,
    info.error || '',
    spreadsheet.getId(),
    spreadsheet.getName(),
    active ? active.getId() : '',
    active ? active.getName() : '',
    info.note || ''
  ]);
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizePayload_(data) {
  var out = Object.assign({}, data || {});

  out.name = normalizeSpace_(out.name);
  out.whatsapp = normalizeSpace_(out.whatsapp);
  out.message = normalizeSpace_(out.message);
  out.pageUrl = trimTo_(String(out.pageUrl || ''), 500);
  out.userAgent = trimTo_(String(out.userAgent || ''), 500);
  out.ts = trimTo_(String(out.ts || ''), 80);
  out.source = trimTo_(String(out.source || ''), 80);
  out.website = normalizeSpace_(out.website);

  if (out.rating !== '' && out.rating !== null && typeof out.rating !== 'undefined') {
    var ratingNumber = Number(out.rating);
    out.rating = isNaN(ratingNumber) ? '' : ratingNumber;
  } else {
    out.rating = '';
  }

  out.name = trimTo_(out.name, MAX_NAME_LENGTH);
  out.whatsapp = trimTo_(out.whatsapp, MAX_WHATSAPP_LENGTH);
  out.message = trimTo_(out.message, MAX_MESSAGE_LENGTH);

  return out;
}

function validatePayload_(data) {
  if (!data.message) {
    throw new Error('ValidationError: message is required');
  }

  if (data.message.length > MAX_MESSAGE_LENGTH) {
    throw new Error('ValidationError: message too long');
  }

  if (data.name && data.name.length > MAX_NAME_LENGTH) {
    throw new Error('ValidationError: name too long');
  }

  if (data.whatsapp && data.whatsapp.length > MAX_WHATSAPP_LENGTH) {
    throw new Error('ValidationError: whatsapp too long');
  }

  if (data.rating !== '' && (data.rating < 1 || data.rating > 5)) {
    throw new Error('ValidationError: rating out of range');
  }
}

function normalizeSpace_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimTo_(value, maxLen) {
  value = String(value || '');
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

