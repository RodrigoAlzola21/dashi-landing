const RESPONSES_SHEET_NAME = 'Respuestas';
const LOGS_SHEET_NAME = 'Logs';
const MAX_MESSAGE_LENGTH = 1000;
const MAX_NAME_LENGTH = 80;
const MAX_WHATSAPP_LENGTH = 40;
const MIN_WHATSAPP_DIGITS = 8;
const MAX_WHATSAPP_DIGITS = 15;
const WHATSAPP_ALLOWED_REGEX = /^\+?[\d\s()-]+$/;
const RATE_LIMIT_SECONDS = 180;
const DUPLICATE_FEEDBACK_WINDOW_SECONDS = 86400;
const CACHE_KEY_RATE_PREFIX = 'rate:';
const CACHE_KEY_DUPLICATE_PREFIX = 'dup:';
const LOG_PAYLOAD_PREVIEW_MAX_LENGTH = 500;

// Opcional: si el script NO esta vinculado al spreadsheet, completa este ID.
const FALLBACK_SPREADSHEET_ID = '';

function doPost(e) {
  var spreadsheet = null;
  var sheet = null;
  var rowAppended = null;
  var payloadInfo = { data: {}, postDataType: '', postDataContents: '' };
  var payloadLogPreview = '';
  var logError = '';

  try {
    spreadsheet = getSpreadsheet_();
    payloadInfo = parsePayload_(e);
    payloadLogPreview = buildSafePayloadPreview_(payloadInfo.data, payloadInfo.postDataContents);

    appendLog_(spreadsheet, {
      error: '',
      postDataType: payloadInfo.postDataType,
      postDataContents: payloadLogPreview,
      note: 'doPost received'
    });

    var data = sanitizePayload_(payloadInfo.data || {});
    var serverTs = new Date().toISOString();

    if (data.website) {
      appendLog_(spreadsheet, {
        error: '',
        postDataType: payloadInfo.postDataType,
        postDataContents: payloadLogPreview,
        note: 'honeypot hit - ignored'
      });

      return jsonResponse_({ ok: true, ignored: true });
    }

    validatePayload_(data);
    assertAntiSpamAllowed_(data);

    sheet = getOrCreateSheet_(spreadsheet, RESPONSES_SHEET_NAME);
    ensureResponseHeaders_(sheet);

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
      postDataContents: payloadLogPreview,
      note: 'appendRow OK row=' + rowAppended
    });

    try {
      markAntiSpamFeedback_(data);
    } catch (antiSpamMarkErr) {
      appendLog_(spreadsheet, {
        error: String(antiSpamMarkErr),
        postDataType: payloadInfo.postDataType,
        postDataContents: payloadLogPreview,
        note: 'anti-spam cache mark failed row=' + rowAppended
      });
    }

    return jsonResponse_({ ok: true });
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
          postDataContents: payloadLogPreview || buildSafePayloadPreview_((payloadInfo && payloadInfo.data) || {}, (payloadInfo && payloadInfo.postDataContents) || ''),
          note: 'doPost error'
        });
      }
    } catch (logErr) {
      // Si falla incluso el logging, continuamos devolviendo JSON de error.
      logError += ' | logError=' + String(logErr);
    }

    return jsonResponse_(toClientErrorResponse_(err));
  }
}

function doGet() {
  return jsonResponse_({
    ok: true,
    status: 'web app alive'
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

function createAppError_(code, message, extra) {
  var err = new Error(message || code || 'AppError');
  err.name = 'AppError';
  err.code = code || 'APP_ERROR';
  if (extra) {
    Object.keys(extra).forEach(function (key) {
      err[key] = extra[key];
    });
  }
  return err;
}

function createValidationError_(code, message) {
  var err = createAppError_(code, message);
  err.name = 'ValidationError';
  return err;
}

function toClientErrorResponse_(err) {
  var code = (err && err.code) ? String(err.code) : 'INTERNAL_ERROR';
  var message = 'No se pudo enviar. Probá de nuevo.';
  var response = {
    ok: false,
    code: code,
    message: message
  };

  if (code === 'MESSAGE_REQUIRED') {
    response.message = 'El mensaje es obligatorio para enviar el feedback privado.';
  } else if (code === 'MESSAGE_TOO_LONG') {
    response.message = 'El mensaje es demasiado largo.';
  } else if (code === 'NAME_TOO_LONG') {
    response.message = 'El nombre es demasiado largo.';
  } else if (code === 'WHATSAPP_REQUIRED') {
    response.message = 'El WhatsApp es obligatorio para enviar el feedback privado.';
  } else if (code === 'WHATSAPP_TOO_LONG') {
    response.message = 'El WhatsApp es demasiado largo.';
  } else if (code === 'WHATSAPP_INVALID_CHARS' || code === 'WHATSAPP_INVALID_DIGITS_LENGTH') {
    response.message = 'Ingresá un WhatsApp válido (solo números, con + opcional, entre 8 y 15 dígitos).';
  } else if (code === 'RATING_OUT_OF_RANGE') {
    response.message = 'La calificación enviada no es válida.';
  } else if (code === 'RATE_LIMITED') {
    response.message = 'Esperá un momento antes de enviar otro feedback desde este WhatsApp.';
  } else if (code === 'DUPLICATE_FEEDBACK') {
    response.message = 'Ya recibimos un feedback muy similar desde este WhatsApp recientemente.';
  } else if (code === 'INVALID_JSON') {
    response.message = 'No se pudo procesar el envío. Probá de nuevo.';
  }

  if (err && err.retryAfterSec) {
    response.retryAfterSec = Number(err.retryAfterSec);
  }

  return response;
}

function buildSafePayloadPreview_(data, rawContents) {
  var payload = data || {};
  var whatsapp = normalizeSpace_(payload.whatsapp);
  var message = normalizeSpace_(payload.message);
  var summary = {
    rawLen: String(rawContents || '').length,
    keys: Object.keys(payload),
    rating: payload.rating || '',
    nameLen: String(payload.name || '').length,
    whatsappMasked: maskWhatsappForLog_(whatsapp),
    whatsappDigits: whatsapp ? String(whatsapp).replace(/\D/g, '').length : 0,
    messageLen: message.length,
    messageHash12: message ? hashTextHex_(message.toLowerCase()).slice(0, 12) : '',
    source: trimTo_(String(payload.source || ''), 80),
    hasWebsite: !!normalizeSpace_(payload.website),
    parseError: payload._parseError ? 'yes' : ''
  };

  return trimTo_(JSON.stringify(summary), LOG_PAYLOAD_PREVIEW_MAX_LENGTH);
}

function maskWhatsappForLog_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  return '***' + digits.slice(-4);
}

function getAntiSpamKeys_(data) {
  var digits = normalizeWhatsappDigits_(data.whatsapp);
  var normalizedMessage = normalizeForDuplicate_(data.message);

  return {
    rate: CACHE_KEY_RATE_PREFIX + digits,
    duplicate: CACHE_KEY_DUPLICATE_PREFIX + digits + ':' + hashTextHex_(normalizedMessage)
  };
}

function assertAntiSpamAllowed_(data) {
  var cache = CacheService.getScriptCache();
  var keys = getAntiSpamKeys_(data);

  if (cache.get(keys.rate)) {
    throw createAppError_('RATE_LIMITED', 'Too many requests for whatsapp', {
      retryAfterSec: RATE_LIMIT_SECONDS
    });
  }

  if (cache.get(keys.duplicate)) {
    throw createAppError_('DUPLICATE_FEEDBACK', 'Duplicate feedback detected');
  }
}

function markAntiSpamFeedback_(data) {
  var cache = CacheService.getScriptCache();
  var keys = getAntiSpamKeys_(data);

  cache.put(keys.rate, '1', RATE_LIMIT_SECONDS);
  cache.put(keys.duplicate, '1', DUPLICATE_FEEDBACK_WINDOW_SECONDS);
}

function normalizeWhatsappDigits_(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeForDuplicate_(value) {
  return normalizeSpace_(value).toLowerCase();
}

function hashTextHex_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );

  var hex = '';
  for (var i = 0; i < digest.length; i += 1) {
    var byteValue = digest[i];
    if (byteValue < 0) byteValue += 256;
    var piece = byteValue.toString(16);
    if (piece.length < 2) piece = '0' + piece;
    hex += piece;
  }
  return hex;
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

  return out;
}

function validatePayload_(data) {
  if (!data.message) {
    throw createValidationError_('MESSAGE_REQUIRED', 'message is required');
  }

  if (data.message.length > MAX_MESSAGE_LENGTH) {
    throw createValidationError_('MESSAGE_TOO_LONG', 'message too long');
  }

  if (data.name && data.name.length > MAX_NAME_LENGTH) {
    throw createValidationError_('NAME_TOO_LONG', 'name too long');
  }

  if (!data.whatsapp) {
    throw createValidationError_('WHATSAPP_REQUIRED', 'whatsapp is required');
  }

  if (data.whatsapp && data.whatsapp.length > MAX_WHATSAPP_LENGTH) {
    throw createValidationError_('WHATSAPP_TOO_LONG', 'whatsapp too long');
  }

  if (data.whatsapp) {
    if (!WHATSAPP_ALLOWED_REGEX.test(data.whatsapp)) {
      throw createValidationError_('WHATSAPP_INVALID_CHARS', 'whatsapp invalid characters');
    }

    var whatsappDigits = String(data.whatsapp).replace(/\D/g, '');
    if (whatsappDigits.length < MIN_WHATSAPP_DIGITS || whatsappDigits.length > MAX_WHATSAPP_DIGITS) {
      throw createValidationError_('WHATSAPP_INVALID_DIGITS_LENGTH', 'whatsapp invalid digits length');
    }
  }

  if (data.rating !== '' && (data.rating < 1 || data.rating > 5)) {
    throw createValidationError_('RATING_OUT_OF_RANGE', 'rating out of range');
  }
}

function normalizeSpace_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimTo_(value, maxLen) {
  value = String(value || '');
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

