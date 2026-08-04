/**
 * TIDAL LEAD CRM — backend
 * ===========================================================================
 * This turns a free Google Sheet into the database behind your lead form and
 * your CRM page. It costs nothing, needs no server, and the office can open
 * the spreadsheet like any other spreadsheet.
 *
 * SETUP (about 10 minutes, once)
 *   1. Go to sheets.new  →  name it "Tidal Leads".
 *   2. Extensions → Apps Script. Delete whatever is in the editor.
 *   3. Paste this entire file in.
 *   4. Edit the CONFIG block below — at minimum change TOKEN to a random
 *      string of your own, and set NOTIFY_EMAIL to your own email.
 *   5. Save. Then Deploy → New deployment → gear icon → Web app.
 *        Execute as:        Me
 *        Who has access:    Anyone
 *      Click Deploy, allow the permissions it asks for, and COPY THE WEB APP
 *      URL. It looks like https://script.google.com/macros/s/AKfy..../exec
 *   6. Paste that URL and your TOKEN into the SETUP tab of the CRM page and
 *      into the top of lead-form.html. Done.
 *
 *   Optional but worth it: Triggers (clock icon on the left) → Add trigger →
 *   choose `sendMorningDigest`, Time-driven, Day timer, 8am–9am. That mails
 *   the office every weekday morning with the leads that came in after hours.
 *
 * A NOTE ON PERMISSIONS
 *   "Who has access: Anyone" means anyone with the URL can post to it, which
 *   is why the TOKEN exists — requests without it are rejected. Treat the URL
 *   and token like a password. Do not put them in anything you hand to a
 *   homeowner other than the form page itself.
 * ===========================================================================
 */

/* ============================ CONFIG ============================ */

var TOKEN         = 'CHANGE-ME-random-string-9f3k2';  // must match the CRM + form
var SHEET_NAME    = 'Leads';

var NOTIFY_EMAIL  = '';                  // YOUR email — every new lead
var OFFICE_EMAIL  = '';                  // office email — leave '' to skip
var REP_NAME      = 'Sam';

var TZ            = 'America/Los_Angeles';
var OFFICE_DAYS   = [1, 2, 3, 4, 5];     // 1 = Monday … 5 = Friday
var OFFICE_OPEN   = 9;                   // 9am
var OFFICE_CLOSE  = 17;                  // 5pm

/* ================================================================ */

var HEADERS = ['id','createdAt','updatedAt','name','phone','email','address','city',
               'source','stage','temp','roofType','damage','notes','lastTouchAt',
               'touches','apptAt','apptStatus','rep','lat','lng',
               'officeNotifiedAt','deleted'];

/* ---------- plumbing ---------- */

function sheet_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if(!sh) sh = ss.insertSheet(SHEET_NAME);
  if(sh.getLastRow() === 0){
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function out_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function rows_(){
  var sh = sheet_(), last = sh.getLastRow();
  if(last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var outArr = [];
  for(var i = 0; i < vals.length; i++){
    var o = { _row: i + 2 };
    for(var j = 0; j < HEADERS.length; j++){
      var v = vals[i][j];
      o[HEADERS[j]] = (v instanceof Date) ? v.toISOString() : v;
    }
    if(o.id) outArr.push(o);
  }
  return outArr;
}

function writeRow_(rowIndex, lead){
  var sh = sheet_(), arr = [];
  for(var i = 0; i < HEADERS.length; i++){
    var v = lead[HEADERS[i]];
    arr.push(v === undefined || v === null ? '' : v);
  }
  sh.getRange(rowIndex, 1, 1, HEADERS.length).setValues([arr]);
}

function digits_(s){ return String(s || '').replace(/\D/g, ''); }

function newId_(){
  return 'L' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
}

/* ---------- office hours ---------- */

function officeOpen_(){
  var now = new Date();
  var iso = parseInt(Utilities.formatDate(now, TZ, 'u'), 10);   // 1=Mon … 7=Sun
  var day = iso % 7;                                            // 1=Mon … 6=Sat, 0=Sun
  var hr  = parseInt(Utilities.formatDate(now, TZ, 'H'), 10);
  return OFFICE_DAYS.indexOf(day) !== -1 && hr >= OFFICE_OPEN && hr < OFFICE_CLOSE;
}

function nextOpenText_(){
  if(officeOpen_()) return 'now';
  var now = new Date();
  var iso = parseInt(Utilities.formatDate(now, TZ, 'u'), 10), day = iso % 7;
  var hr  = parseInt(Utilities.formatDate(now, TZ, 'H'), 10);
  if(OFFICE_DAYS.indexOf(day) !== -1 && hr < OFFICE_OPEN) return 'this morning at 9am';
  var names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  for(var i = 1; i <= 7; i++){
    var d = (day + i) % 7;
    if(OFFICE_DAYS.indexOf(d) !== -1){
      return (i === 1 ? 'tomorrow' : names[d]) + ' morning at 9am';
    }
  }
  return 'the next business morning';
}

/* ---------- notifications ---------- */

function leadBlock_(lead){
  return [
    'Name:     ' + lead.name,
    'Phone:    ' + lead.phone,
    'Address:  ' + lead.address,
    lead.email ? 'Email:    ' + lead.email : '',
    lead.source ? 'Source:   ' + lead.source : '',
    lead.damage ? 'Noted:    ' + lead.damage : '',
    lead.notes  ? 'Notes:    ' + lead.notes  : '',
    'Rep:      ' + (lead.rep || REP_NAME),
    'Received: ' + Utilities.formatDate(new Date(), TZ, 'EEE d MMM, h:mm a') + ' PT'
  ].filter(String).join('\n');
}

function notify_(lead){
  var open = officeOpen_();
  var subject = open
    ? 'NEW LEAD — call now — ' + lead.name + ', ' + lead.address
    : 'New lead (after hours) — call ' + nextOpenText_() + ' — ' + lead.name;

  var body = (open
      ? 'A homeowner just requested a free assessment and the office is OPEN.\nCall them now.\n\n'
      : 'A homeowner requested a free assessment outside office hours.\nFirst call ' +
        nextOpenText_() + '.\n\n')
    + leadBlock_(lead)
    + '\n\nCall: ' + lead.phone
    + '\nMap:  https://maps.google.com/?q=' + encodeURIComponent(lead.address)
    + '\n\n— sent automatically by the Tidal lead form';

  var to = [NOTIFY_EMAIL, OFFICE_EMAIL].filter(String).join(',');
  if(!to) return '';
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body });
    return new Date().toISOString();
  } catch(err){
    return 'ERROR: ' + err;
  }
}

/**
 * Weekday-morning digest of anything that came in after hours and has not
 * been called yet. Attach this to a time-driven trigger for 8–9am.
 */
function sendMorningDigest(){
  if(!officeOpen_() && !NOTIFY_EMAIL) return;
  var all = rows_();
  var waiting = all.filter(function(l){
    return String(l.deleted) !== 'yes' && (l.stage === 'new' || !l.stage) && !l.lastTouchAt;
  });
  if(!waiting.length) return;

  var body = 'These homeowners asked for a free assessment and have not been called yet.\n\n'
    + waiting.map(function(l, i){ return (i + 1) + ')\n' + leadBlock_(l); }).join('\n\n')
    + '\n\n— Tidal lead form, daily 9am digest';

  var to = [NOTIFY_EMAIL, OFFICE_EMAIL].filter(String).join(',');
  if(!to) return;
  MailApp.sendEmail({
    to: to,
    subject: waiting.length + ' lead' + (waiting.length > 1 ? 's' : '') + ' waiting for a call',
    body: body
  });
}

/* ---------- API ---------- */

function doGet(e){
  var p = (e && e.parameter) || {};
  if(p.token !== TOKEN) return out_({ ok:false, error:'bad token' });
  var leads = rows_().filter(function(l){ return String(l.deleted) !== 'yes'; });
  return out_({ ok:true, leads:leads, officeOpen:officeOpen_(),
                nextOpen:nextOpenText_(), serverTime:new Date().toISOString() });
}

function doPost(e){
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch(err){ return out_({ ok:false, error:'bad json' }); }
  if(body.token !== TOKEN) return out_({ ok:false, error:'bad token' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch(err){ return out_({ ok:false, error:'busy' }); }

  try {
    var action = body.action || 'create';
    if(action === 'create') return create_(body.lead);
    if(action === 'update') return update_(body.lead);
    if(action === 'bulk')   return bulk_(body.leads || []);
    return out_({ ok:false, error:'unknown action: ' + action });
  } finally {
    lock.releaseLock();
  }
}

function create_(lead){
  if(!lead) return out_({ ok:false, error:'no lead' });
  var now = new Date().toISOString();

  // dedupe on phone — a homeowner submitting twice should not become two leads
  var existing = null, all = rows_();
  var d = digits_(lead.phone);
  if(d.length >= 10){
    for(var i = 0; i < all.length; i++){
      if(digits_(all[i].phone).slice(-10) === d.slice(-10)){ existing = all[i]; break; }
    }
  }

  if(existing){
    existing.updatedAt = now;
    existing.notes = [existing.notes, '[' + now.slice(0,10) + ' resubmitted] ' + (lead.notes || '')]
                     .filter(String).join('\n');
    if(lead.address && !existing.address) existing.address = lead.address;
    if(lead.email && !existing.email)     existing.email   = lead.email;
    writeRow_(existing._row, existing);
    return out_({ ok:true, id:existing.id, duplicate:true, officeOpen:officeOpen_(),
                  nextOpen:nextOpenText_() });
  }

  lead.id            = lead.id || newId_();
  lead.createdAt     = now;
  lead.updatedAt     = now;
  lead.stage         = lead.stage || 'new';
  lead.temp          = lead.temp  || 'warm';
  lead.source        = lead.source || 'qr';
  lead.rep           = lead.rep || REP_NAME;
  lead.touches       = lead.touches || 0;
  lead.apptStatus    = lead.apptStatus || '';
  lead.deleted       = '';
  lead.officeNotifiedAt = notify_(lead);

  var sh = sheet_(), arr = [];
  for(var j = 0; j < HEADERS.length; j++){
    var v = lead[HEADERS[j]];
    arr.push(v === undefined || v === null ? '' : v);
  }
  sh.appendRow(arr);

  return out_({ ok:true, id:lead.id, duplicate:false,
                officeOpen:officeOpen_(), nextOpen:nextOpenText_() });
}

function update_(lead){
  if(!lead || !lead.id) return out_({ ok:false, error:'no id' });
  var all = rows_();
  for(var i = 0; i < all.length; i++){
    if(all[i].id === lead.id){
      var merged = all[i];
      for(var k in lead){ if(HEADERS.indexOf(k) !== -1) merged[k] = lead[k]; }
      merged.updatedAt = new Date().toISOString();
      writeRow_(all[i]._row, merged);
      return out_({ ok:true, id:lead.id });
    }
  }
  return create_(lead);                       // not found → treat as new
}

function bulk_(leads){
  var results = [];
  for(var i = 0; i < leads.length; i++){
    var r = JSON.parse(update_(leads[i]).getContent());
    results.push(r);
  }
  return out_({ ok:true, results:results, count:results.length });
}

/* ---------- run this once from the editor to sanity-check ---------- */
function testSetup(){
  sheet_();
  Logger.log('Sheet ready. Office open right now: ' + officeOpen_());
  Logger.log('Next open: ' + nextOpenText_());
  Logger.log('Existing leads: ' + rows_().length);
  if(!NOTIFY_EMAIL) Logger.log('WARNING: NOTIFY_EMAIL is empty — nobody gets emailed.');
  if(TOKEN.indexOf('CHANGE-ME') === 0) Logger.log('WARNING: change TOKEN before deploying.');
}
