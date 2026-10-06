// Paste into Extensions > Apps Script of the target Google Sheet, then Deploy > Web app
// (Execute as: Me, Who has access: Anyone). Set the secret in Project Settings > Script properties (SECRET).
//
// Expected columns: A Week | B Task | C Project | D Time (date) | E Time (h) | F Finish
// Tasks are appended under a week header row in column A ("Oct 05 - Oct 10", Monday - Saturday);
// the header row is added automatically when a new week starts.

var NUM_COLS = 6;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
    if (secret && body.secret !== secret) return respond({ ok: false, error: "unauthorized" });

    if (body.action === "tabs") {
      var tabs = SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) {
        return { id: s.getSheetId(), name: s.getName() };
      });
      return respond({ ok: true, tabs: tabs });
    }

    var tasks = body.tasks;
    if (!tasks || !tasks.length) return respond({ ok: false, error: "no tasks" });

    var parts = String(body.date).split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
    if (isNaN(date.getTime())) return respond({ ok: false, error: "invalid date" });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = findSheetById(body.tabId);
      if (!sheet) return respond({ ok: false, error: "tab_not_found" });

      var tz = Session.getScriptTimeZone();
      var weekLabel = weekLabelFor(date, tz);

      // Last used row (any of columns A-C) and the most recent week header in column A.
      var last = sheet.getLastRow();
      var lastUsed = 0, currentWeek = "";
      if (last > 0) {
        var vals = sheet.getRange(1, 1, last, 3).getValues();
        for (var i = vals.length - 1; i >= 0; i--) {
          var used = String(vals[i][0]).trim() || String(vals[i][1]).trim() || String(vals[i][2]).trim();
          if (used && !lastUsed) lastUsed = i + 1;
          if (String(vals[i][0]).trim()) { currentWeek = String(vals[i][0]).trim(); break; }
        }
      }

      var rows = [];
      var needHeader = currentWeek !== weekLabel;
      if (needHeader) rows.push([weekLabel, "", "", "", "", ""]);
      tasks.forEach(function (t) {
        rows.push(["", t.task, t.project || "", String(body.date), t.hours || "", ""]);
      });

      var start = lastUsed + 1;
      var range = sheet.getRange(start, 1, rows.length, NUM_COLS);
      range.setValues(rows);
      sheet.getRange(start, 4, rows.length, 1).setNumberFormat("d/M/yyyy");
      if (needHeader) sheet.getRange(start, 1).setFontWeight("bold");
    } finally {
      lock.releaseLock();
    }
    return respond({ ok: true, count: tasks.length });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

// Monday - Saturday label; a Sunday counts toward the week that just ended.
function weekLabelFor(date, tz) {
  var dow = date.getDay(); // 0 = Sunday
  var back = dow === 0 ? 6 : dow - 1;
  var monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - back, 12);
  var saturday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 5, 12);
  return Utilities.formatDate(monday, tz, "MMM dd") + " - " + Utilities.formatDate(saturday, tz, "MMM dd");
}

// Tabs are addressed by sheet id so renaming a tab doesn't break the link.
function findSheetById(id) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === Number(id)) return sheets[i];
  }
  return null;
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
