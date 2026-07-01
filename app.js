import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { ref as rtdbRef, get as rtdbGet, set as rtdbSet, update as rtdbUpdate, remove as rtdbRemove, onValue as rtdbOnValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig, getAuth, getDatabase } from "./firebase-config.js?v=13";

const fbApp = initializeApp(firebaseConfig);
let db;
try {
  db = initializeFirestore(fbApp, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
  });
} catch (cacheError) {
  console.warn('[Firestore] Cache persistente non disponibile, uso cache standard:', cacheError?.message || cacheError);
  db = getFirestore(fbApp);
}
const auth = getAuth(fbApp);
const functions = getFunctions(fbApp);
const rtdb = getDatabase(fbApp);

const NAMES = ['Vitalin', 'Alex', 'Diego', 'Silvano', 'Giuseppe', 'Davide', 'Anna', 'Sunkar', 'Lisa', 'Zara', 'Extra'];
let state = { employees: NAMES, kitchenPercent: 20, history: [] };
let unsub = null;
let currentUser = '';
let currentUserUid = '';
let currentUserName = '';
let currentUserRole = '';
let hasLoadedSessionData = false;
let employeesData = [];
let usersData = [];
let editingEmployeeId = '';
let shiftsData = [];
let shiftsUnsub = null;
let weekOffset = 0;
let editingShiftId = '';
let todayShiftPopupShown = false;
let attendanceWeekOffset = 0;
let attendanceWeekEntries = {};
let contractHoursData = {};
let editingAttendanceUid = '';
let editingAttendanceDate = '';
let attendanceEditorDirty = false;
let attendanceV2Unsub = null;
const SESSION_KEY = 'angiesManagerUser';
const EMPLOYEE_ROLES = ['Admin', 'Manager', 'Responsible', 'Waiter', 'Kitchen'];
const RESTAURANT_ROLES = ['Direttore', 'Manager', 'Responsabile', 'Cameriere', 'Runner', 'Bartender'];
const APP_ROLES = ['Admin', 'Manager', 'Responsabile', 'Waiter'];
const WEEK_DAYS_IT = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const SHIFT_TYPES = ['morning', 'evening', 'long', 'split', 'rest'];
const LONG_SHIFT_MIN_HOURS = 7.5;
const SHIFT_PRESET_WEEK_START = '2026-06-29';
const SHIFT_PRESET_EMPLOYEE_ORDER = ['Vitalin', 'Alex', 'Diego', 'Silvano', 'Giuseppe', 'Davide', 'Anna', 'Sunkar', 'Lisa', 'Zara', 'Extra'];
const SHIFT_PRESET_WEEK_SHIFTS = {
  Vitalin: ['9:30-17:00', '09:30-Ch', 'R', '11:00-Ch', '9:30-17:00', '11:30-Ch', '9:30-17:00'],
  Alex: ['9:30-17:00', '17:00-Ch', '17:00-Ch', '18:00-Ch', 'R', '18:00-Ch', '18:00-Ch'],
  Diego: ['17:00-Ch', 'R', '09:30-Ch', '9:30-17:00', '11:00-Ch', '9:30-17:00', '11:30-Ch'],
  Silvano: ['10:00-16:00', '09:30-Ch', '9:30-16:00', '9:30-16:00', 'R', '9:30-16:00', '9:30-16:00'],
  Giuseppe: ['R', '12:00-Ch', '17:00-Ch', '10:00-17:00', '17:00-Ch', '12:00-Ch', '17:00-Ch'],
  Davide: ['18:00-Ch', '17:00-Ch', '11:30-Ch', '17:00-Ch', '11:30-Ch', '17:00-Ch', 'R'],
  Anna: ['11:00-Ch', '10:00-16:00', 'R', '11-15/19-23', '17:00-Ch', '10:00-17:00', '12:00-Ch'],
  Sunkar: ['17:00-Ch', '11-15/19-23', '18:00-Ch', 'R', '10-15/19-23', '17:00-Ch', '11-15/19-23'],
  Lisa: ['17:00-Ch', 'R', '10:30-17:00', '17:00-Ch', '9:30-17:00', 'R', '10:00-17:00'],
  Zara: ['12-15/19-Ch', 'R', '11-15/19-23', '17:00-Ch', '17:00-Ch', '11-15/19-23', '18:00-Ch'],
  Extra: ['', '', '', '', '', '', '']
};
const SHIFT_PRESET_WEEK_TOTALS = {
  '2026-06-29': { M: 5, P: 4, S: 6 },
  '2026-06-30': { M: 5, P: 4, S: 6 },
  '2026-07-01': { M: 5, P: 4, S: 6 },
  '2026-07-02': { M: 5, P: 4, S: 6 },
  '2026-07-03': { M: 6, P: 5, S: 6 },
  '2026-07-04': { M: 6, P: 5, S: 6 },
  '2026-07-05': { M: 6, P: 5, S: 6 }
};
const MINUTES_PER_DAY = 24 * 60;
const PROFILE_LOAD_TIMEOUT_MS = 3000;
const PRIMARY_LOAD_TIMEOUT_MS = 3000;
const SECONDARY_LOAD_TIMEOUT_MS = 2000;
const PROFILE_LOAD_MAX_ATTEMPTS = 2;
const ROLE_STORAGE_VALUES = ['admin', 'manager', 'responsible', 'waiter', 'kitchen'];
const MAX_TIP_AMOUNT = 100000;
const BOOTSTRAP_ADMIN_EMAILS = ['vitalinnadolnii3@gmail.com'];
const BOOTSTRAP_ADMIN_DEFAULT_NAMES = { 'vitalinnadolnii3@gmail.com': 'Vitalin' };
const sectionLoaded = {
  primary: false,
  employees: false,
  users: false,
  attendance: false,
  shifts: false
};
let primaryLoadPromise = null;
let employeeLoadPromise = null;
let userLoadPromise = null;
let usersLoadError = null;
let usersLoading = false;
let attendanceLoadPromise = null;
let shiftLoadPromise = null;
let sessionPrefetchPromise = null;
let attendanceLoadedWeekStart = '';
let chatRenderedMessageIds = new Set();

const $ = id => document.getElementById(id);
const euroFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const euro = n => euroFormatter.format(+n || 0);
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
const normalizeEmail = s => String(s || '').trim().toLowerCase();
function getCurrentUserRole() { return currentUserRole; }
const isAdmin = () => currentUserRole.toLowerCase() === 'admin';
const isManager = () => currentUserRole.toLowerCase() === 'manager';
const isResponsible = () => ['responsible', 'responsabile'].includes(currentUserRole.toLowerCase());
const isWaiter = () => currentUserRole.toLowerCase() === 'waiter';
const canViewGlobalTipsData = () => isAdmin() || isManager() || isResponsible();
const canManageShifts = () => isAdmin() || isManager() || isResponsible();
const canManageAttendance = () => isAdmin() || isManager() || isResponsible();
const canViewAllAttendance = () => canManageAttendance();
const canManageUsers = () => isAdmin();
const canViewAllData = () => isAdmin() || isManager();
const canViewUserData = (targetUid) => isAdmin() || isManager() || targetUid === currentUserUid;

function getErrorDetails(error, fallback = 'Errore sconosciuto') {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').trim() || fallback;
  return code ? `${message} (${code})` : message;
}

function resetSectionLoadedState() {
  sectionLoaded.primary = false;
  sectionLoaded.employees = false;
  sectionLoaded.users = false;
  sectionLoaded.attendance = false;
  sectionLoaded.shifts = false;
  primaryLoadPromise = null;
  employeeLoadPromise = null;
  userLoadPromise = null;
  usersLoadError = null;
  usersLoading = false;
  attendanceLoadPromise = null;
  shiftLoadPromise = null;
  sessionPrefetchPromise = null;
  attendanceLoadedWeekStart = '';
  stopAttendanceV2Listener();
  chatRenderedMessageIds = new Set();
}

function ensureFirebaseServicesReady() {
  if (!fbApp) throw new Error('Firebase App non inizializzata.');
  if (!auth || auth.app !== fbApp) throw new Error('Firebase Auth non inizializzato correttamente.');
  if (!db || db.app !== fbApp) throw new Error('Firestore non inizializzato correttamente.');
  if (!rtdb || rtdb.app !== fbApp) throw new Error('Realtime Database non inizializzato correttamente.');
}

function getFriendlyFirestoreMessage(error, fallback = 'Si è verificato un errore.') {
  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || '').trim();
  if (code === 'failed-precondition' || /requires an index/i.test(message)) {
    return 'I turni non sono disponibili perché manca un indice Firestore. Pubblica regole e indici con Firebase CLI e riprova.';
  }
  if (code === 'permission-denied') {
    return 'Non hai i permessi per visualizzare questi turni.';
  }
  if (code === 'unauthenticated') {
    return 'Sessione scaduta. Effettua di nuovo il login.';
  }
  return fallback;
}

function getFriendlyRtdbMessage(error, fallback = 'Si è verificato un errore su Firebase.') {
  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || '').trim();
  if (code === 'permission-denied') {
    return 'Firebase Realtime Database ha negato l’accesso a entrata/uscita. Verifica i permessi di admin/manager/responsabile e riprova.';
  }
  if (code === 'network-request-failed' || code === 'unavailable') {
    return 'Firebase Realtime Database non è raggiungibile. Controlla la connessione e riprova.';
  }
  return getErrorDetails(error, fallback || message || 'Si è verificato un errore su Firebase.');
}

function getEmployeeStatusLabel(active) {
  return active ? 'Active' : 'Inactive';
}

function isEmailAlreadyRegisteredError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('email-already-in-use') ||
    code.includes('email-already-exists') ||
    code.includes('already-exists') ||
    message.includes('email-already-in-use') ||
    message.includes('email-already-exists') ||
    message.includes('already exists');
}

function isMissingAdminFunctionError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('functions/not-found') ||
    code.includes('not-found') ||
    code.includes('unimplemented') ||
    message.includes('function not found') ||
    message.includes('not found') ||
    message.includes('does not exist');
}

function getDuplicateEmployeeEmailMessage(email) {
  return `L'email ${email} è già registrata. Usa un indirizzo diverso o reimposta la password dell'account esistente.`;
}

function setStatus(id, message = '', type = 'info') {
  const node = $(id);
  if (!node) return;
  node.textContent = message;
  node.className = `status-message status-${type}${message ? '' : ' hidden'}`;
}

function setShiftStatus(message = '', type = 'info') {
  setStatus('shiftStatus', message, type);
  setStatus('myShiftStatus', message, type);
}

function setAttendanceStatus(message = '', type = 'info') {
  setStatus('attendanceStatus', message, type);
}

function setAppStatus(message = '', type = 'info') {
  setStatus('appStatus', message, type);
}

function notify(message = '', type = 'info', statusId = 'appStatus') {
  if (statusId && $(statusId)) {
    setStatus(statusId, message, type);
  } else {
    setAppStatus(message, type);
  }
}

function sanitizeMoneyInput(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function sanitizeHourInput(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/\s+/g, ' ');
}

function scheduleBackgroundTask(task) {
  if (typeof task !== 'function') return;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: 1200 });
    return;
  }
  window.setTimeout(task, 0);
}

function isValidPhoneFormat(phone) {
  if (!phone) return true;
  return /^\+?[0-9\s().-]{7,20}$/.test(phone);
}

function validateISODate(dateStr) {
  const cleaned = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return false;
  const d = new Date(`${cleaned}T00:00:00`);
  return !Number.isNaN(d.getTime()) && cleaned === d.toISOString().slice(0, 10);
}

function normalizeStoredRole(role) {
  const cleaned = String(role || '').trim().toLowerCase();
  if (!cleaned) return 'waiter';
  if (cleaned === 'responsabile') return 'responsible';
  return ROLE_STORAGE_VALUES.includes(cleaned) ? cleaned : 'waiter';
}

function roleToAppRoleLabel(role) {
  const normalized = normalizeStoredRole(role);
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'responsible') return 'Responsible';
  if (normalized === 'kitchen') return 'Kitchen';
  return 'Waiter';
}

function generateTemporaryEmployeePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
  const charsLen = alphabet.length;
  const maxValid = 256 - (256 % charsLen);
  const random = new Uint8Array(1);
  let core = '';
  while (core.length < 14) {
    crypto.getRandomValues(random);
    const value = random[0];
    if (value >= maxValid) continue;
    core += alphabet[value % charsLen];
  }
  return `Tmp#${core}9a`;
}

function validateDayPayload(d) {
  if (!d.uid) throw new Error('Sessione non valida. Effettua di nuovo il login.');
  if (!validateISODate(d.date)) throw new Error('Inserisci una data valida.');
  if (d.cash < 0 || d.card < 0) throw new Error('Cash e Carta non possono essere negativi.');
  if (d.cash > MAX_TIP_AMOUNT || d.card > MAX_TIP_AMOUNT) throw new Error('Valore mance troppo alto.');
  if (!Array.isArray(d.hours) || !d.hours.length) throw new Error('Inserisci almeno un\'ora.');
  if (d.hours.some(h => !Number.isFinite(h) || h < 0 || h > 24)) throw new Error('Le ore devono essere comprese tra 0 e 24.');
  if (d.total <= 0) throw new Error('Inserisci Cash o Carta.');
  if (d.totalHours <= 0) throw new Error('Inserisci almeno un\'ora.');
}

function withTimeout(promise, timeoutMs = 15000, label = 'Operazione') {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(`${label} non completata entro ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    Promise.resolve(promise)
      .then(value => finish(resolve, value))
      .catch(error => finish(reject, error));
  });
}

async function withRetry(fn, maxAttempts = 2, label = 'Operazione') {
  // maxAttempts is the total number of attempts (1 = no retry, 2 = one retry, etc.)
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const isNetworkError = ['unavailable', 'auth/network-request-failed', 'deadline-exceeded'].includes(e.code) ||
        String(e.message || '').toLowerCase().includes('network');
      if (isNetworkError && attempt < maxAttempts) {
        const delay = attempt * 1500;
        console.warn(`[Retry] ${label} tentativo ${attempt}/${maxAttempts} fallito (${e.code || e.message}). Riprovo tra ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
  throw lastError;
}

function normalizeName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

function resolveUsername(name) {
  const cleaned = normalizeName(name);
  if (!cleaned) return '';
  const employeeMatch = state.employees.find(n => n.toLowerCase() === cleaned.toLowerCase());
  if (employeeMatch) return employeeMatch;
  if (/^\d+$/.test(cleaned)) return '';
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(cleaned)) return '';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 '.-]{2,40}$/.test(cleaned)) return '';
  return cleaned;
}

function normalizeRole(role) {
  const cleaned = String(role || '').trim();
  return EMPLOYEE_ROLES.includes(cleaned) ? cleaned : '';
}

function normalizeShiftType(shiftType) {
  const cleaned = String(shiftType || '').trim().toLowerCase();
  return SHIFT_TYPES.includes(cleaned) ? cleaned : '';
}

function normalizeAppRole(role) {
  const cleaned = String(role || '').trim();
  const match = APP_ROLES.find(r => r.toLowerCase() === cleaned.toLowerCase());
  if (match) return match;
  if (cleaned.toLowerCase() === 'responsible') return 'Responsabile';
  return '';
}

function normalizeRestaurantRole(role) {
  const cleaned = String(role || '').trim();
  return RESTAURANT_ROLES.find(r => r.toLowerCase() === cleaned.toLowerCase()) || '';
}

function appRoleToLegacyRole(appRole) {
  const lower = String(appRole || '').toLowerCase();
  if (lower === 'responsabile') return 'Responsible';
  return EMPLOYEE_ROLES.find(r => r.toLowerCase() === lower) || 'Waiter';
}

function deriveNameFromEmail(email) {
  const localPart = normalizeName(String(email || '').split('@')[0]);
  return localPart || String(email || '').trim() || 'Unknown';
}

function isBootstrapAdminEmail(email) {
  return BOOTSTRAP_ADMIN_EMAILS.includes(normalizeEmail(email));
}

async function ensureBootstrapAdminProfile(user, profile = {}) {
  const defaultName = BOOTSTRAP_ADMIN_DEFAULT_NAMES[normalizeEmail(user.email)] || deriveNameFromEmail(user.email);
  const name = normalizeName(profile.name) || defaultName;
  const surname = normalizeName(profile.surname || '');
  const email = normalizeEmail(user.email);
  const phone = String(profile.phone || '').trim();
  const restaurantRole = normalizeRestaurantRole(profile.restaurantRole || '');
  const syncTasks = [
    {
      label: 'RTDB users',
      promise: rtdbSet(rtdbUser(user.uid), {
        email,
        name,
        role: 'admin',
        active: true
      })
    },
    {
      label: 'Firestore /users',
      promise: setDoc(userDoc(user.uid), {
        name,
        surname,
        email,
        phone,
        restaurantRole,
        appRole: 'Admin',
        role: 'admin',
        status: 'Active',
        active: true,
        updatedAt: serverTimestamp()
      }, { merge: true })
    },
    {
      label: 'Firestore /employees',
      promise: setDoc(employeeDoc(user.uid), {
        name,
        surname,
        email,
        phone,
        restaurantRole,
        appRole: 'Admin',
        role: 'Admin',
        status: 'Active',
        enabled: true,
        active: true,
        updatedAt: serverTimestamp()
      }, { merge: true })
    }
  ];
  const syncResults = await Promise.allSettled(syncTasks.map(task => task.promise));
  const syncFailures = syncResults
    .map((result, index) => {
      if (result.status !== 'rejected') return '';
      return `${syncTasks[index].label}: ${getErrorDetails(result.reason)}`;
    })
    .filter(Boolean);
  if (syncFailures.length) {
    console.warn('[Profilo] Sincronizzazione profilo admin incompleta:', syncFailures);
  }
  return { name, surname, email, phone, restaurantRole };
}

function employeeCollection() {
  return collection(db, 'restaurants', 'angies', 'employees');
}

function employeeDoc(uid) {
  return doc(db, 'restaurants', 'angies', 'employees', uid);
}

function usersCollection() {
  return collection(db, 'restaurants', 'angies', 'users');
}

function userDoc(uid) {
  return doc(db, 'restaurants', 'angies', 'users', uid);
}

function shiftCollection() {
  return collection(db, 'restaurants', 'angies', 'shifts');
}

function shiftDoc(id) {
  return doc(db, 'restaurants', 'angies', 'shifts', id);
}

// --- Realtime Database helpers for user role management ---

function rtdbUsers() {
  return rtdbRef(rtdb, 'users');
}

function rtdbUser(uid) {
  return rtdbRef(rtdb, `users/${uid}`);
}

async function writeUserToRTDB(uid, data) {
  const active = data.active !== false && data.enabled !== false;
  const role = normalizeStoredRole(data.role || 'waiter');
  const payload = {
    email: String(data.email || ''),
    name: normalizeName(data.name || ''),
    role,
    active
  };
  try {
    await rtdbSet(rtdbUser(uid), payload);
  } catch (e) {
    console.warn('Avviso: scrittura RTDB users non riuscita per uid:', uid, e.message);
  }
}

async function deleteUserFromRTDB(uid) {
  try {
    await rtdbRemove(rtdbUser(uid));
  } catch (e) {
    console.warn('Avviso: cancellazione RTDB users non riuscita per uid:', uid, e.message);
  }
}

function parseISODate(dateStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toISODate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDatesForDate(dateStr) {
  const monday = getWeekStartDate(dateStr);
  return WEEK_DAYS_IT.map((name, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    return {
      dayName: name,
      date: toISODate(d),
      shortDate: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
    };
  });
}

function getCurrentWeekDates() {
  const base = parseISODate(today());
  base.setDate(base.getDate() + weekOffset * 7);
  return getWeekDatesForDate(toISODate(base));
}

function isPresetWeekActive(weekDates = getCurrentWeekDates()) {
  return weekDates?.[0]?.date === SHIFT_PRESET_WEEK_START;
}

function getPresetWeekEmployees(weekDates = getCurrentWeekDates()) {
  if (!isPresetWeekActive(weekDates)) return [];
  return SHIFT_PRESET_EMPLOYEE_ORDER.map(name => {
    const matchingEmployee = employeesData.find(emp =>
      emp.enabled !== false &&
      normalizeName(emp.name).toLowerCase() === name.toLowerCase()
    );
    return { id: matchingEmployee?.id || name, name };
  });
}

function inferPresetShiftType(shiftText) {
  const text = String(shiftText || '').trim();
  if (!text || text.toUpperCase() === 'R') return 'rest';
  if (text.includes('/')) return 'split';
  const { startToken, endToken } = extractStartEndFromText(text);
  const hasClosing = /(?:-|\/)\s*ch\s*$/i.test(text);
  const startHour = parseHour(startToken);
  if (hasClosing) {
    if (startHour !== null && startHour < 16) return 'long';
    return 'evening';
  }
  const endHour = parseHour(endToken);
  const duration = calculateShiftDuration(startHour, endHour);
  if (duration !== null && duration >= LONG_SHIFT_MIN_HOURS) return 'long';
  if (startHour !== null && startHour >= 16) return 'evening';
  return 'morning';
}

function buildPresetWeekShifts(weekDates = getCurrentWeekDates()) {
  if (!isPresetWeekActive(weekDates)) return [];
  const weekEmployees = getPresetWeekEmployees(weekDates);
  const dayDates = weekDates.map(day => day.date);
  const shifts = [];
  weekEmployees.forEach(employee => {
    const schedule = SHIFT_PRESET_WEEK_SHIFTS[employee.name] || [];
    schedule.forEach((value, index) => {
      const shiftText = String(value || '').trim();
      if (!shiftText) return;
      const isRestDay = shiftText.toUpperCase() === 'R';
      shifts.push({
        uid: employee.id,
        employeeName: employee.name,
        date: dayDates[index],
        weekStart: weekDates[0].date,
        shiftText: isRestDay ? 'R' : shiftText,
        startTime: null,
        endTime: null,
        shiftType: inferPresetShiftType(shiftText),
        role: 'Waiter',
        notes: '',
        isRestDay,
        _isPreset: true
      });
    });
  });
  return shifts;
}

function mergePresetWeekShifts(baseShifts = [], weekDates = getCurrentWeekDates()) {
  const presetShifts = buildPresetWeekShifts(weekDates);
  if (!presetShifts.length) return [...baseShifts];
  const merged = new Map();
  presetShifts.forEach(shift => merged.set(`${shift.uid}__${shift.date}`, shift));
  baseShifts.forEach(shift => {
    merged.set(`${shift.uid}__${shift.date}`, shift);
  });
  return [...merged.values()];
}

function getPresetWeekTotals(weekDates = getCurrentWeekDates()) {
  if (!isPresetWeekActive(weekDates)) return [];
  return weekDates.map(day => {
    const total = SHIFT_PRESET_WEEK_TOTALS[day.date];
    return total ? { ...total } : { M: 0, P: 0, S: 0 };
  });
}

function getWeekStartDate(dateStr) {
  const date = parseISODate(dateStr);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday;
}

function getWeekStartISO(dateStr) {
  return toISODate(getWeekStartDate(dateStr));
}

function parseTimeToMinutes(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return null;
  if (!/^\d{1,2}(?::\d{2})?$/.test(cleaned)) return null;
  const parts = cleaned.split(':');
  const hour = Number(parts[0]);
  const minute = Number(parts[1] || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

function normalizePauseMinutes(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function formatMinutesShort(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function formatWorkedHours(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '-';
  return `${num((Number(minutes) || 0) / 60)} h`;
}

function calculateWorkedMinutes(entryTime, exitTime, pauseMinutes = 0) {
  const entryMinutes = parseTimeToMinutes(entryTime);
  const exitMinutes = parseTimeToMinutes(exitTime);
  if (entryMinutes === null || exitMinutes === null) return null;
  let totalMinutes = exitMinutes - entryMinutes;
  if (totalMinutes < 0) totalMinutes += MINUTES_PER_DAY;
  totalMinutes -= normalizePauseMinutes(pauseMinutes);
  return Math.max(0, totalMinutes);
}

function getShiftDisplayText(shift) {
  if (!shift) return '';
  if (shift.isRestDay) return 'R';
  const text = String(shift.shiftText || '').trim();
  if (text) return text;
  const start = String(shift.startTime || '').trim();
  const end = String(shift.endTime || '').trim();
  if (start && end) return `${start}-${end}`;
  return '';
}

function parseHour(value) {
  const v = String(value || '').trim();
  if (!v || /ch/i.test(v)) return null;
  const parts = v.split(':');
  if (parts.length < 1) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1] || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour + (minute / 60);
}

function extractStartEndFromText(text) {
  const value = String(text || '').trim();
  if (!value) return { startToken: '', endToken: '' };
  const slots = value.split('/');
  const firstSlot = String(slots[0] || '');
  const lastSlot = String(slots[slots.length - 1] || '');
  const startToken = firstSlot.split('-')[0] || '';
  const endSlotParts = lastSlot.split('-');
  const endToken = endSlotParts[endSlotParts.length - 1] || '';
  return { startToken: startToken.trim(), endToken: endToken.trim() };
}

function calculateShiftDuration(startHour, endHour) {
  if (startHour === null || endHour === null) return null;
  let duration = endHour - startHour;
  if (duration < 0) duration += 24;
  return duration;
}

function classifyShift(shift) {
  if (!shift) return { type: 'shift-empty', total: '', shiftType: '' };
  const declaredType = normalizeShiftType(shift.shiftType);
  if (shift.isRestDay || declaredType === 'rest') return { type: 'shift-rest', total: '', shiftType: 'rest' };
  if (declaredType === 'split') return { type: 'shift-long', total: 'P', shiftType: 'split' };
  if (declaredType === 'long') return { type: 'shift-long', total: 'P', shiftType: 'long' };
  if (declaredType === 'evening') return { type: 'shift-evening', total: 'S', shiftType: 'evening' };
  if (declaredType === 'morning') return { type: 'shift-morning', total: 'M', shiftType: 'morning' };
  const text = getShiftDisplayText(shift);
  if (!text || text.trim().toUpperCase() === 'R') return { type: 'shift-rest', total: '', shiftType: 'rest' };
  const lower = text.toLowerCase();
  const hasSplit = text.includes('/');
  if (hasSplit) return { type: 'shift-long', total: 'P', shiftType: 'split' };
  const { startToken, endToken } = extractStartEndFromText(text);
  const startHour = parseHour(shift.startTime || startToken);
  const endHour = parseHour(shift.endTime || endToken);
  const duration = calculateShiftDuration(startHour, endHour);
  const hasClosing = /(?:-|\/)\s*ch\s*$/i.test(text) || /ch/i.test(String(shift.endTime || '')) || lower.endsWith('ch');
  if (hasClosing || (startHour !== null && startHour >= 16)) return { type: 'shift-evening', total: 'S', shiftType: 'evening' };
  if (duration !== null && duration >= LONG_SHIFT_MIN_HOURS) return { type: 'shift-long', total: 'P', shiftType: 'long' };
  if (startHour !== null && startHour < 12) return { type: 'shift-morning', total: 'M', shiftType: 'morning' };
  return { type: 'shift-long', total: 'P', shiftType: 'long' };
}

function getShiftEmployees() {
  // Use SHIFT_PRESET_EMPLOYEE_ORDER as the canonical base employee list for all sections
  const canonicalEmployees = SHIFT_PRESET_EMPLOYEE_ORDER.map(name => {
    const matchingEmployee = employeesData.find(emp =>
      emp.enabled !== false &&
      normalizeName(emp.name).toLowerCase() === name.toLowerCase()
    );
    return { id: matchingEmployee?.id || name, name };
  });
  // Add any Firestore employees not already in the canonical list
  if (Array.isArray(employeesData) && employeesData.length > 0) {
    const presetNameSet = new Set(SHIFT_PRESET_EMPLOYEE_ORDER.map(n => n.toLowerCase()));
    employeesData
      .filter(emp => emp.enabled !== false && !presetNameSet.has(normalizeName(emp.name).toLowerCase()))
      .sort((a, b) => normalizeName(a.name || '').localeCompare(normalizeName(b.name || ''), 'it', { sensitivity: 'base' }))
      .forEach(emp => {
        canonicalEmployees.push({ id: emp.id, name: normalizeName(emp.name) || normalizeEmail(emp.email) || emp.id });
      });
  }
  if (canonicalEmployees.length) return canonicalEmployees;
  // Fallback to current user if nothing else available
  return currentUserUid ? [{ id: currentUserUid, name: currentUserName || deriveNameFromEmail(currentUser) || currentUser }] : [];
}

function sortPeopleByName(list = []) {
  return [...list].sort((a, b) =>
    normalizeName(a.name || a.email || '').localeCompare(normalizeName(b.name || b.email || ''), 'it', { sensitivity: 'base' })
  );
}

function sortEmployeesList(list = []) {
  return sortPeopleByName(list);
}

function sortUsersList(list = []) {
  return sortPeopleByName(list);
}

function syncStateEmployeesFromEmployeesData() {
  // Always use SHIFT_PRESET_EMPLOYEE_ORDER as the canonical base for the unified employee list
  const presetNames = SHIFT_PRESET_EMPLOYEE_ORDER.slice();
  const presetNameSet = new Set(presetNames.map(n => n.toLowerCase()));
  // Append any extra active Firestore employees not already in the preset list
  const extraNames = employeesData
    .filter(emp => emp.enabled !== false && emp.active !== false && !presetNameSet.has(normalizeName(emp.name).toLowerCase()))
    .map(emp => normalizeName(emp.name) || normalizeEmail(emp.email) || emp.id)
    .filter(Boolean);
  state.employees = [...presetNames, ...extraNames];
}

function setEmployeesCache(list = []) {
  employeesData = sortEmployeesList(list);
  syncStateEmployeesFromEmployeesData();
}

function setUsersCache(list = []) {
  usersData = sortUsersList(list);
}

function upsertEmployeeCache(record) {
  if (!record?.id) return;
  setEmployeesCache([...employeesData.filter(emp => emp.id !== record.id), record]);
}

function removeEmployeeCache(uid) {
  setEmployeesCache(employeesData.filter(emp => emp.id !== uid));
}

function upsertUserCache(record) {
  if (!record?.id) return;
  setUsersCache([...usersData.filter(user => user.id !== record.id), record]);
}

function removeUserCache(uid) {
  setUsersCache(usersData.filter(user => user.id !== uid));
}

function buildLocalEmployeeRecord(uid, data = {}, previous = {}) {
  const name = normalizeName(data.name ?? previous.name ?? '');
  const surname = normalizeName(data.surname ?? previous.surname ?? '');
  const email = normalizeEmail(data.email ?? previous.email ?? '');
  const phone = normalizePhone(data.phone ?? previous.phone ?? '');
  const restaurantRole = normalizeRestaurantRole(data.restaurantRole ?? previous.restaurantRole ?? '');
  const appRole = normalizeAppRole(data.appRole ?? previous.appRole ?? previous.role ?? data.role ?? '') || '';
  const role = normalizeStoredRole(data.role ?? appRole ?? previous.role ?? 'waiter');
  const active = (data.active ?? data.enabled ?? previous.active ?? previous.enabled) !== false;
  return {
    ...previous,
    id: uid,
    name,
    surname,
    email,
    phone,
    restaurantRole,
    appRole,
    role,
    status: getEmployeeStatusLabel(active),
    enabled: active,
    active
  };
}

function buildLocalUserRecord(uid, data = {}, previous = {}) {
  const name = normalizeName(data.name ?? previous.name ?? '');
  const surname = normalizeName(data.surname ?? previous.surname ?? '');
  const email = normalizeEmail(data.email ?? previous.email ?? '');
  const phone = normalizePhone(data.phone ?? previous.phone ?? '');
  const restaurantRole = normalizeRestaurantRole(data.restaurantRole ?? previous.restaurantRole ?? '');
  const role = normalizeStoredRole(data.role ?? previous.role ?? data.appRole ?? previous.appRole ?? 'waiter');
  const appRole = normalizeAppRole(data.appRole ?? previous.appRole ?? role) || roleToAppRoleLabel(role);
  const active = (data.active ?? previous.active) !== false;
  return {
    ...previous,
    id: uid,
    name,
    surname,
    email,
    phone,
    restaurantRole,
    appRole,
    role,
    status: getEmployeeStatusLabel(active),
    active
  };
}

function prefetchSessionData() {
  if (!currentUserUid) return Promise.resolve();
  if (sessionPrefetchPromise) return sessionPrefetchPromise;
  const tasks = [];
  if (!sectionLoaded.primary) tasks.push(ensurePrimaryLoaded());
  if ((isAdmin() || canManageShifts() || canManageAttendance() || canViewGlobalTipsData()) && !sectionLoaded.employees) {
    tasks.push(ensureEmployeesLoaded());
  }
  if (isAdmin() && !sectionLoaded.users) {
    tasks.push(ensureUsersLoaded());
  }
  if (!tasks.length) return Promise.resolve();
  sessionPrefetchPromise = Promise.allSettled(tasks).finally(() => {
    sessionPrefetchPromise = null;
  });
  return sessionPrefetchPromise;
}

async function callEmployeeAdminFunction(name, payload) {
  const callable = httpsCallable(functions, name);
  return callable(payload);
}

async function createAuthUserWithSecondarySession(email, password) {
  const temporaryAppName = `employee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const secondaryApp = initializeApp(firebaseConfig, temporaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

function showLogin() {
  $('bootScreen')?.classList.add('hidden');
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('loginEmail').focus();
}

function showApp() {
  $('bootScreen')?.classList.add('hidden');
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
}

function showBootLoading(message = 'Caricamento...') {
  const bootScreen = $('bootScreen');
  if (!bootScreen) return;
  setStatus('bootStatus', message, 'info');
  $('loginScreen').classList.add('hidden');
  $('app').classList.add('hidden');
  bootScreen.classList.remove('hidden');
}

function syncEmployeeTabVisibility() {
  const tabBtn = $('employeeTabBtn');
  if (!tabBtn) return;
  tabBtn.classList.toggle('hidden', !isAdmin());
  if (!isAdmin() && $('employeeManagement').classList.contains('active')) {
    void tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
  }
  // Show/hide the create form - only Admins can create employees
  const createForm = $('employeeCreateForm');
  const createActions = $('employeeCreateActions');
  if (createForm) createForm.classList.toggle('hidden', !isAdmin());
  if (createActions) createActions.classList.toggle('hidden', !isAdmin());
}

function syncShiftTabVisibility() {
  const turniTabBtn = $('turniTabBtn');
  const myShiftsTabBtn = $('myShiftsTabBtn');
  if (turniTabBtn) {
    turniTabBtn.classList.toggle('hidden', !canManageShifts());
  }
  if (myShiftsTabBtn) {
    myShiftsTabBtn.classList.toggle('hidden', canManageShifts());
  }
  const newShiftBtn = $('newShiftBtn');
  if (newShiftBtn) {
    newShiftBtn.classList.toggle('hidden', !canManageShifts());
  }
  if (canManageShifts() && $('myShifts').classList.contains('active')) {
    void tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
  }
}

function syncSettingsTabVisibility() {
  const settingsTabBtn = $('settingsTabBtn');
  if (!settingsTabBtn) return;
  settingsTabBtn.classList.toggle('hidden', !isAdmin());
  if (!isAdmin() && $('settings').classList.contains('active')) {
    void tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
  }
}

function syncHistoryStatsVisibility() {
  const canSee = canViewGlobalTipsData();
  const newdayBtn = $('newdayTabBtn');
  const histBtn = $('historyTabBtn');
  const statsBtn = $('statsTabBtn');
  if (newdayBtn) newdayBtn.classList.toggle('hidden', !canSee);
  if (histBtn) histBtn.classList.toggle('hidden', !canSee);
  if (statsBtn) statsBtn.classList.toggle('hidden', !canSee);
  // Redirect if on a restricted tab
  if (!canSee) {
    const activeId = document.querySelector('.page.active')?.id;
    if (['history', 'stats', 'newday'].includes(activeId)) {
      void tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
    }
  }
}

async function writeLog(action, username = currentUser) {
  if (!username) return;
  try {
    await addDoc(collection(db, 'restaurants', 'angies', 'logs'), {
      timestamp: serverTimestamp(),
      username,
      action
    });
  } catch (e) {
    console.error('Errore log:', e);
  }
}

async function doLogin() {
  try {
    ensureFirebaseServicesReady();
  } catch (e) {
    const detail = getErrorDetails(e, 'Servizi Firebase non disponibili.');
    console.error('[Login] Inizializzazione Firebase non valida:', e);
    setStatus('loginStatus', detail, 'error');
    return;
  }

  const email = normalizeEmail($('loginEmail').value);
  const pwd = $('loginPass').value;
  if (!email) { setStatus('loginStatus', 'Inserisci l\'email.', 'error'); return; }
  if (!pwd) { setStatus('loginStatus', 'Inserisci la password.', 'error'); return; }
  setStatus('loginStatus', 'Accesso in corso…', 'info');
  console.log('[Login] Tentativo di accesso per:', email);
  try {
    await signInWithEmailAndPassword(auth, email, pwd);
    console.log('[Login] Autenticazione Firebase riuscita per:', email);
    // Profile loading happens in onAuthStateChanged
  } catch (e) {
    console.error('[Login] Errore autenticazione Firebase:', e.code, e.message);
    let msg;
    if (['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential'].includes(e.code)) {
      msg = 'Email o password non corretti.';
    } else if (e.code === 'auth/user-disabled') {
      msg = 'Account disabilitato. Contatta un amministratore.';
    } else if (e.code === 'auth/too-many-requests') {
      msg = 'Troppi tentativi falliti. Riprova tra qualche minuto.';
    } else if (e.code === 'auth/network-request-failed') {
      msg = 'Errore di rete. Controlla la connessione e riprova.';
    } else if (e.code === 'auth/invalid-email') {
      msg = 'Formato email non valido.';
    } else {
      msg = 'Errore login: ' + getErrorDetails(e);
    }
    setStatus('loginStatus', msg, 'error');
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('Errore logout:', e);
    notify('Errore logout: ' + (e?.message || 'Logout non riuscito'), 'error');
    return;
  }
  localStorage.removeItem(SESSION_KEY);
  currentUser = '';
  currentUserName = '';
  currentUserUid = '';
  currentUserRole = '';
  todayShiftPopupShown = false;
  weekOffset = 0;
  shiftsData = [];
  usersData = [];
  attendanceWeekOffset = 0;
  attendanceWeekEntries = {};
  contractHoursData = {};
  $('who').textContent = 'Online';
  stopChatListener();
  stopShiftListeners();
  stopAttendanceV2Listener();
  resetSectionLoadedState();
  showLogin();
}

// LOAD DATA FROM FIRESTORE
async function load() {
  try {
    const s = await getDoc(doc(db, 'restaurants', 'angies', 'settings', 'main'));
    if (s.exists()) {
      let d = s.data();
      state.employees = d.employees || NAMES;
      state.kitchenPercent = d.kitchenPercent || 20;
    }
    const daysRef = collection(db, 'restaurants', 'angies', 'days');
    if (!canViewGlobalTipsData() && !currentUserUid) {
      state.history = [];
      return;
    }
    const daysQuery = canViewGlobalTipsData() ? daysRef : query(daysRef, where('uid', '==', currentUserUid));
    const h = await getDocs(daysQuery);
    state.history = [];
    h.forEach(d => {
      state.history.push({ date: d.id, ...d.data() });
    });
    state.history.sort((a, b) => b.date.localeCompare(a.date));
  } catch(e) {
    console.error('Errore caricamento:', e);
  }
}

async function loadEmployees() {
  if (!currentUserUid) {
    employeesData = [];
    renderEmployeesTable();
    return;
  }
  try {
    // Con regole ristrette, la lista completa è disponibile solo ad admin/manager.
    const snap = await getDocs(employeeCollection());
    setEmployeesCache(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    renderEmployeesTable();
  } catch (e) {
    if (e.code === 'permission-denied') {
      // Non-admin users without an employee profile cannot read the collection — not an error.
      console.log('[Dipendenti] Lettura non autorizzata (utente senza profilo dipendente):', e.code);
    } else {
      console.error('Errore caricamento dipendenti:', e);
    }
    employeesData = [];
    renderEmployeesTable();
  }
}

// NOTE: This function should only be called via ensureUsersLoaded() to ensure
// renderUsersTable() is called after loading (handled in ensureUsersLoaded's .finally).
async function loadUsersForAdmin() {
  if (!isAdmin()) {
    usersData = [];
    return;
  }
  try {
    // Prefer Realtime Database as primary RBAC source
    const rtdbSnap = await rtdbGet(rtdbUsers());
    if (rtdbSnap.exists()) {
      const rtdbVal = rtdbSnap.val();
      setUsersCache(Object.entries(rtdbVal).map(([id, data]) => ({ id, ...data })));
      return;
    }
    // Fall back to Firestore /users/ collection
    const snap = await getDocs(usersCollection());
    setUsersCache(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) {
    console.error('Errore caricamento utenti:', e);
    throw e;
  }
}

async function ensurePrimaryLoaded() {
  if (sectionLoaded.primary) return;
  if (primaryLoadPromise) return primaryLoadPromise;
  primaryLoadPromise = withTimeout(load(), PRIMARY_LOAD_TIMEOUT_MS, 'Caricamento dati principali')
    .then(() => {
      sectionLoaded.primary = true;
      hasLoadedSessionData = true;
    })
    .finally(() => {
      primaryLoadPromise = null;
    });
  return primaryLoadPromise;
}

async function ensureEmployeesLoaded() {
  if (sectionLoaded.employees) return;
  if (employeeLoadPromise) return employeeLoadPromise;
  employeeLoadPromise = withTimeout(loadEmployees(), SECONDARY_LOAD_TIMEOUT_MS, 'Caricamento dipendenti')
    .then(() => {
      sectionLoaded.employees = true;
    })
    .finally(() => {
      employeeLoadPromise = null;
    });
  return employeeLoadPromise;
}

async function ensureUsersLoaded() {
  if (!isAdmin()) return;
  if (sectionLoaded.users) return;
  if (userLoadPromise) return userLoadPromise;
  usersLoadError = null;
  usersLoading = true;
  userLoadPromise = withTimeout(loadUsersForAdmin(), SECONDARY_LOAD_TIMEOUT_MS, 'Caricamento utenti')
    .then(() => {
      sectionLoaded.users = true;
    })
    .catch(e => {
      usersLoadError = getErrorDetails(e, 'Errore nel caricamento utenti.');
      console.error('[Users] Errore caricamento utenti (non bloccante):', usersLoadError);
    })
    .finally(() => {
      usersLoading = false;
      userLoadPromise = null;
      renderUsersTable();
    });
  return userLoadPromise;
}

async function ensureAttendanceLoaded() {
  const currentWeekStart = getCurrentAttendanceWeekDates()?.[0]?.date || '';
  if (sectionLoaded.attendance && attendanceLoadedWeekStart === currentWeekStart) return;
  if (attendanceLoadPromise) return attendanceLoadPromise;
  attendanceLoadPromise = Promise.resolve().then(() => {
    return attachAttendanceListeners();
  }).finally(() => {
    attendanceLoadPromise = null;
  });
  return attendanceLoadPromise;
}

function clearEmployeeForm() {
  editingEmployeeId = '';
  $('employeeName').value = '';
  $('employeeSurname').value = '';
  $('employeeEmail').value = '';
  $('employeePhone').value = '';
  $('employeeRestaurantRole').value = '';
  $('employeeAppRole').value = '';
  $('employeeStatus').value = 'true';
  $('employeeSaveBtn').textContent = 'Crea dipendente';
}

function renderEmployeesTable() {
  const table = $('employeeList');
  if (!table) return;
  if (!isAdmin()) {
    table.innerHTML = '<tr><td colspan="7">Accesso consentito solo agli admin.</td></tr>';
    return;
  }
  let html = '<tr><th>Nome</th><th>Email</th><th>Telefono</th><th>Posizione</th><th>Ruolo App</th><th>Stato</th><th>Azioni</th></tr>';

  // Build combined list: Firestore employees + preset employees not yet registered
  const firestoreNameSet = new Set(employeesData.map(emp => normalizeName(emp.name).toLowerCase()));
  const presetOnlyEmployees = SHIFT_PRESET_EMPLOYEE_ORDER
    .filter(name => !firestoreNameSet.has(name.toLowerCase()))
    .map(name => ({ _isPreset: true, name }));
  const allEmployees = [...employeesData, ...presetOnlyEmployees];

  if (!allEmployees.length) {
    html += '<tr><td colspan="7">Nessun dipendente registrato.</td></tr>';
    table.innerHTML = html;
    return;
  }
  allEmployees.forEach(emp => {
    if (emp._isPreset) {
      html += `<tr>
        <td>${esc(emp.name)}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td><span class="status-badge status-disabled">Non registrato</span></td>
        <td class="table-actions"><em>Crea account per gestire</em></td>
      </tr>`;
      return;
    }
    const active = emp.active !== false && emp.enabled !== false;
    const statusClass = active ? 'status-enabled' : 'status-disabled';
    const statusText = active ? 'Attivo' : 'Disattivato';
    const restaurantRole = esc(emp.restaurantRole || '-');
    const appRole = esc(emp.appRole || normalizeAppRole(emp.role) || '-');
    const phone = esc(emp.phone || '-');
    html += `<tr>
      <td>${esc((emp.name || '') + (emp.surname ? ' ' + emp.surname : '') || '-')}</td>
      <td>${esc(emp.email || '-')}</td>
      <td>${phone}</td>
      <td>${restaurantRole}</td>
      <td>${appRole}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td class="table-actions">
        <button data-employee-action="edit" data-employee-id="${esc(emp.id)}">Modifica</button>
        <button data-employee-action="reset-password" data-employee-id="${esc(emp.id)}">Reimposta password</button>
      </td>
    </tr>`;
  });
  table.innerHTML = html;
}

const USER_ROLES_ADMIN = ['admin', 'manager', 'responsible', 'waiter'];
const USER_ROLES_ALL = [...USER_ROLES_ADMIN, 'kitchen'];

function renderUsersTable() {
  const table = $('usersList');
  if (!table) return;
  if (!isAdmin()) {
    table.innerHTML = '<tr><td colspan="5">Accesso consentito solo agli admin.</td></tr>';
    return;
  }
  if (usersLoading) {
    table.innerHTML = '<tr><td colspan="5">Caricamento utenti in corso…</td></tr>';
    return;
  }
  if (usersLoadError && !usersData.length) {
    table.innerHTML = `<tr><td colspan="5">Errore: ${esc(usersLoadError)}</td></tr>`;
    return;
  }
  let html = '<tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Azioni</th></tr>';
  if (!usersData.length) {
    html += '<tr><td colspan="5">Nessun utente registrato.</td></tr>';
    table.innerHTML = html;
    return;
  }
  usersData.forEach(u => {
    const normalizedRole = normalizeStoredRole(u.role);
    const active = u.active !== false;
    const statusClass = active ? 'status-enabled' : 'status-disabled';
    const statusText = active ? 'Attivo' : 'Disattivato';
    const displayName = esc(normalizeName((u.name || '') + (u.surname ? ' ' + u.surname : '')) || u.email || '-');
    const roleOptions = USER_ROLES_ADMIN.map(r =>
      `<option value="${r}"${normalizedRole === r ? ' selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`
    ).join('');
    html += `<tr>
      <td>${displayName}</td>
      <td>${esc(u.email || '-')}</td>
      <td><select class="user-role-select" data-user-id="${esc(u.id)}">${roleOptions}</select></td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td class="table-actions">
        <button data-user-action="toggle" data-user-id="${esc(u.id)}">${active ? 'Disattiva' : 'Attiva'}</button>
      </td>
    </tr>`;
  });
  table.innerHTML = html;
}

function validateEmployeePayload({ name, surname, email, phone, restaurantRole, appRole, password, requirePassword = false, ignoreId = '' }) {
  const normalizedName = normalizeName(name);
  const normalizedSurname = normalizeName(surname || '');
  const normalizedEmail = normalizeEmail(email);
  const normalizedAppRole = normalizeAppRole(appRole);
  const normalizedRestaurantRole = normalizeRestaurantRole(restaurantRole || '');
  const normalizedPhone = normalizePhone(phone || '');
  if (!normalizedName) throw new Error('Nome obbligatorio.');
  if (!normalizedEmail) throw new Error('Email obbligatoria.');
  if (!isValidEmailFormat(normalizedEmail)) throw new Error('Formato email non valido.');
  if (!isValidPhoneFormat(normalizedPhone)) throw new Error('Formato telefono non valido.');
  if (!normalizedAppRole) throw new Error('Ruolo App obbligatorio.');
  const normalizedPassword = String(password || '');
  if (requirePassword && normalizedPassword.length < 8) throw new Error('Password minima di 8 caratteri.');
  if (!requirePassword && normalizedPassword && normalizedPassword.length < 8) throw new Error('Nuova password minima di 8 caratteri.');
  return { normalizedName, normalizedSurname, normalizedEmail, normalizedPhone, normalizedAppRole, normalizedRestaurantRole, normalizedPassword };
}

async function checkEmailUniqueness(email, ignoreId = '') {
  email = normalizeEmail(email);
  const emailExistsInLoadedEmployees = employeesData.some(emp => emp.id !== ignoreId && normalizeEmail(emp.email) === email);
  const emailExistsInLoadedUsers = usersData.some(user => user.id !== ignoreId && normalizeEmail(user.email) === email);
  if (emailExistsInLoadedEmployees || emailExistsInLoadedUsers) return false;
  const pendingReads = [];
  if (!sectionLoaded.employees) {
    pendingReads.push(
      getDocs(query(employeeCollection(), where('email', '==', email))).then(snap =>
        snap.docs.some(d => d.id !== ignoreId)
      )
    );
  }
  if (!sectionLoaded.users) {
    pendingReads.push(
      getDocs(query(usersCollection(), where('email', '==', email))).then(snap =>
        snap.docs.some(d => d.id !== ignoreId)
      )
    );
  }
  if (!pendingReads.length) return true;
  const results = await Promise.all(pendingReads);
  return !results.some(Boolean);
}

async function upsertEmployeeProfile(uid, data, isCreate = false) {
  const appRole = data.appRole ? normalizeAppRole(data.appRole) : normalizeAppRole(data.role || '');
  const normalizedStoredRole = normalizeStoredRole(appRole || data.role || 'waiter');
  const active = data.active !== false && data.enabled !== false;
  const status = getEmployeeStatusLabel(active);
  const payload = {
    name: data.name,
    surname: data.surname || '',
    email: data.email,
    phone: data.phone || '',
    restaurantRole: data.restaurantRole || '',
    appRole: appRole || '',
    role: normalizedStoredRole,
    status,
    enabled: active,
    active,
    updatedAt: serverTimestamp()
  };
  if (isCreate) payload.createdAt = serverTimestamp();
  await setDoc(employeeDoc(uid), payload, { merge: !isCreate });

  // Sync role to /users/ collection for RBAC
  const userPayload = {
    name: data.name,
    surname: data.surname || '',
    email: data.email,
    phone: data.phone || '',
    restaurantRole: data.restaurantRole || '',
    appRole: appRole || '',
    role: normalizedStoredRole,
    status,
    active,
    updatedAt: serverTimestamp()
  };
  if (isCreate) userPayload.createdAt = serverTimestamp();
  try {
    await setDoc(userDoc(uid), userPayload, { merge: !isCreate });
  } catch (e) {
    // Non-fatal: /users/ sync may fail if caller lacks permission
    console.warn('Avviso: sincronizzazione /users/ non riuscita:', e.message);
  }

  // Sync to Realtime Database for RBAC role resolution at login
  await writeUserToRTDB(uid, {
    name: data.name,
    email: data.email,
    role: normalizedStoredRole,
    active
  });
}

async function createEmployee() {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  let data;
  try {
    data = validateEmployeePayload({
      name: $('employeeName').value,
      surname: $('employeeSurname').value,
      email: $('employeeEmail').value,
      phone: $('employeePhone').value,
      restaurantRole: $('employeeRestaurantRole').value,
      appRole: $('employeeAppRole').value,
      password: '',
      requirePassword: false
    });
  } catch (e) {
    notify(e.message, 'error');
    return;
  }

  let uid = '';
  const temporaryPassword = generateTemporaryEmployeePassword();
  const nextActive = $('employeeStatus').value === 'true';
  try {
    const isUnique = await checkEmailUniqueness(data.normalizedEmail);
    if (!isUnique) { notify('Email già associata a un dipendente.', 'error'); return; }
  } catch (e) {
    console.error('Errore verifica email dipendente:', e);
    notify('Errore verifica email: ' + e.message, 'error');
    return;
  }
  try {
    const fnResult = await callEmployeeAdminFunction('createEmployeeAuthUser', {
      email: data.normalizedEmail,
      password: temporaryPassword,
      name: data.normalizedName,
      role: appRoleToLegacyRole(data.normalizedAppRole)
    });
    uid = fnResult.data?.uid ? String(fnResult.data.uid) : '';
  } catch (e) {
    if (isEmailAlreadyRegisteredError(e)) {
      notify(getDuplicateEmployeeEmailMessage(data.normalizedEmail), 'error');
      return;
    }
    if (isMissingAdminFunctionError(e)) {
      console.warn('Callable createEmployeeAuthUser non disponibile, uso fallback client-side.', e);
      uid = '';
    } else {
      console.error('Errore creazione account Auth tramite Cloud Function:', e);
      notify('Errore creazione account: ' + getErrorDetails(e), 'error');
      return;
    }
  }

  if (!uid) {
    try {
      uid = await createAuthUserWithSecondarySession(data.normalizedEmail, temporaryPassword);
    } catch (e) {
      console.error('Errore creazione utente auth:', e);
      if (isEmailAlreadyRegisteredError(e)) {
        notify(getDuplicateEmployeeEmailMessage(data.normalizedEmail), 'error');
        return;
      }
      notify('Errore creazione utente: ' + getErrorDetails(e), 'error');
      return;
    }
  }

  try {
    await upsertEmployeeProfile(uid, {
      name: data.normalizedName,
      surname: data.normalizedSurname,
      email: data.normalizedEmail,
      phone: data.normalizedPhone,
      restaurantRole: data.normalizedRestaurantRole,
      appRole: data.normalizedAppRole,
      active: nextActive
    }, true);
    const nextEmployee = buildLocalEmployeeRecord(uid, {
      name: data.normalizedName,
      surname: data.normalizedSurname,
      email: data.normalizedEmail,
      phone: data.normalizedPhone,
      restaurantRole: data.normalizedRestaurantRole,
      appRole: data.normalizedAppRole,
      active: nextActive
    });
    const currentUserRecord = usersData.find(user => user.id === uid) || {};
    upsertEmployeeCache(nextEmployee);
    upsertUserCache(buildLocalUserRecord(uid, nextEmployee, currentUserRecord));
    void writeLog(`employee_create:${data.normalizedEmail}:${data.normalizedAppRole}`);
    clearEmployeeForm();
    renderEmployeesTable();
    renderUsersTable();
    let activationLink = null;
    try {
      const linkResult = await callEmployeeAdminFunction('generatePasswordResetLink', { email: data.normalizedEmail });
      activationLink = linkResult?.data?.link;
    } catch (linkErr) {
      console.warn('[Creazione dipendente] generatePasswordResetLink non disponibile, uso email standard:', linkErr?.message || linkErr);
    }

    const activationEmailSent = await trySendEmployeeResetEmail(
      data.normalizedEmail,
      'Dipendente creato',
      `employee_create:${uid}:email`
    );
    if (activationLink) {
      const activationMessage = activationEmailSent
        ? `Email di attivazione/reset inviata a ${data.normalizedEmail}. Se necessario puoi condividere anche questo link diretto.`
        : `Non è stato possibile inviare l'email di reset a ${data.normalizedEmail}. Puoi condividere manualmente questo link diretto.`;
      showResetLinkModal(
        activationLink,
        data.normalizedName || data.normalizedEmail,
        activationMessage,
        activationEmailSent ? 'info' : 'error'
      );
      notify(`Dipendente creato. ${activationMessage}`, activationEmailSent ? 'info' : 'error');
    } else if (activationEmailSent) {
      notify(`Dipendente creato. Email di attivazione/reset inviata a ${data.normalizedEmail}.`, 'info');
    } else {
      notify(`Dipendente creato, ma non è stato possibile inviare l'email di reset a ${data.normalizedEmail}.`, 'error');
    }
  } catch (e) {
    console.error('Errore salvataggio profilo dipendente:', e);
    notify('Errore salvataggio profilo: ' + e.message, 'error');
  }
}

async function saveEmployeeModal() {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  const employee = employeesData.find(emp => emp.id === editingEmployeeId);
  if (!employee) { notify('Dipendente non trovato.', 'error'); return; }

  let data;
  try {
    data = validateEmployeePayload({
      name: $('modalEmpName').value,
      surname: $('modalEmpSurname').value,
      email: $('modalEmpEmail').value,
      phone: $('modalEmpPhone').value,
      restaurantRole: $('modalEmpRestaurantRole').value,
      appRole: $('modalEmpAppRole').value,
      password: $('modalEmpPassword').value,
      requirePassword: false,
      ignoreId: editingEmployeeId
    });
  } catch (e) {
    notify(e.message, 'error');
    return;
  }

  const nextActive = $('modalEmpActive').value === 'true';
  const wantsAuthUpdate = data.normalizedEmail !== normalizeEmail(employee.email) || data.normalizedPassword.length >= 8;
  try {
    const isUnique = await checkEmailUniqueness(data.normalizedEmail, employee.id);
    if (!isUnique) { notify('Email già associata a un dipendente.', 'error'); return; }
  } catch (e) {
    console.error('Errore verifica email dipendente:', e);
    notify('Errore verifica email: ' + e.message, 'error');
    return;
  }

  if (wantsAuthUpdate) {
    try {
      await callEmployeeAdminFunction('updateEmployeeAuthUser', {
        uid: employee.id,
        email: data.normalizedEmail,
        password: data.normalizedPassword || undefined
      });
    } catch (e) {
      console.error('Errore aggiornamento auth dipendente:', e);
      notify('Aggiornamento email/password richiede Cloud Function `updateEmployeeAuthUser` configurata.', 'error');
      return;
    }
  }

  try {
    await upsertEmployeeProfile(employee.id, {
      name: data.normalizedName,
      surname: data.normalizedSurname,
      email: data.normalizedEmail,
      phone: data.normalizedPhone,
      restaurantRole: data.normalizedRestaurantRole,
      appRole: data.normalizedAppRole,
      active: nextActive
    });
    const nextEmployee = buildLocalEmployeeRecord(employee.id, {
      ...employee,
      name: data.normalizedName,
      surname: data.normalizedSurname,
      email: data.normalizedEmail,
      phone: data.normalizedPhone,
      restaurantRole: data.normalizedRestaurantRole,
      appRole: data.normalizedAppRole,
      active: nextActive
    }, employee);
    const currentUserRecord = usersData.find(user => user.id === employee.id) || {};
    upsertEmployeeCache(nextEmployee);
    upsertUserCache(buildLocalUserRecord(employee.id, nextEmployee, currentUserRecord));
    void writeLog(`employee_update:${employee.id}`);
    closeEmployeeModal();
    renderEmployeesTable();
    renderUsersTable();
    syncEmployeeTabVisibility();
    if (employee.id === currentUserUid && !nextActive) {
      notify('Il tuo account è stato disabilitato. Verrai disconnesso.', 'error');
      await logout();
    } else {
      notify('Dipendente aggiornato.', 'info');
    }
  } catch (e) {
    console.error('Errore aggiornamento dipendente:', e);
    notify('Errore aggiornamento: ' + e.message, 'error');
  }
}

function openEmployeeModal(id) {
  if (!isAdmin()) return;
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) return;
  editingEmployeeId = employee.id;
  $('modalEmpName').value = employee.name || '';
  $('modalEmpSurname').value = employee.surname || '';
  $('modalEmpEmail').value = employee.email || '';
  $('modalEmpPhone').value = employee.phone || '';
  $('modalEmpPassword').value = '';
  $('modalEmpRestaurantRole').value = normalizeRestaurantRole(employee.restaurantRole || '');
  $('modalEmpAppRole').value = normalizeAppRole(employee.appRole || employee.role || '');
  $('modalEmpActive').value = (employee.active !== false && employee.enabled !== false) ? 'true' : 'false';
  $('employeeModal').classList.remove('hidden');
}

function closeEmployeeModal() {
  editingEmployeeId = '';
  $('employeeModal').classList.add('hidden');
}

async function deleteEmployeeFromModal() {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  const id = editingEmployeeId;
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) return;
  if (!confirm(`Eliminare definitivamente ${employee.name || employee.email}?`)) return;
  try {
    await callEmployeeAdminFunction('deleteEmployeeAuthUser', { uid: employee.id });
  } catch (e) {
    console.error('Errore cancellazione auth dipendente:', e);
    notify('Eliminazione account Auth richiede Cloud Function `deleteEmployeeAuthUser` configurata.', 'error');
    return;
  }
  try {
    await deleteDoc(employeeDoc(employee.id));
    try {
      await deleteDoc(userDoc(employee.id));
    } catch (e) {
      console.warn('Avviso: cancellazione /users/ non riuscita:', e.message);
    }
    await deleteUserFromRTDB(employee.id);
    removeEmployeeCache(employee.id);
    removeUserCache(employee.id);
    void writeLog(`employee_delete:${employee.id}`);
    closeEmployeeModal();
    renderEmployeesTable();
    renderUsersTable();
  } catch (e) {
    console.error('Errore cancellazione profilo dipendente:', e);
    notify('Errore cancellazione profilo: ' + e.message, 'error');
  }
}

async function resetEmployeePassword(id) {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) { notify('Dipendente non trovato.', 'error'); return; }
  const email = normalizeEmail(employee.email);
  if (!email || !isValidEmailFormat(email)) { notify('Il dipendente non ha un indirizzo email valido.', 'error'); return; }
  if (!confirm(`Reimpostare la password di ${employee.name || email}?`)) return;

  // Try to generate a direct clickable link via Cloud Function first.
  let resetLink = null;
  try {
    const result = await callEmployeeAdminFunction('generatePasswordResetLink', { email });
    resetLink = result?.data?.link;
  } catch (linkErr) {
    console.warn('[Reset password] generatePasswordResetLink non disponibile, uso email standard:', linkErr?.message || linkErr);
  }

  const resetEmailSent = await trySendEmployeeResetEmail(
    email,
    'Reset password',
    `employee_password_reset:${employee.id}:email`
  );
  if (resetLink) {
    const resetMessage = resetEmailSent
      ? `Email di reset inviata a ${email}. Se necessario puoi condividere anche questo link diretto.`
      : `Non è stato possibile inviare l'email di reset a ${email}. Puoi condividere manualmente questo link diretto.`;
    showResetLinkModal(
      resetLink,
      employee.name || email,
      resetMessage,
      resetEmailSent ? 'info' : 'error'
    );
    void writeLog(`employee_password_reset:${employee.id}:link`);
    notify(resetMessage, resetEmailSent ? 'info' : 'error');
  } else if (resetEmailSent) {
    notify(`Email di reset inviata a ${email}.`, 'info');
  } else {
    notify('Impossibile reimpostare la password: email di reset non inviata.', 'error');
  }
}

async function trySendEmployeeResetEmail(email, contextLabel = 'Reset password', logEvent = '') {
  try {
    await sendPasswordResetEmail(auth, email);
    if (logEvent) void writeLog(logEvent);
    return true;
  } catch (e) {
    console.error(`Errore invio email reset password [${contextLabel}]:`, e);
    return false;
  }
}

function showResetLinkModal(link, name, statusMessage = '', statusType = 'info') {
  const anchor = $('resetLinkAnchor');
  if (anchor) {
    anchor.href = link;
    anchor.textContent = `Apri il link di reset per ${esc(name)}`;
  }
  setStatus('resetLinkStatus', statusMessage, statusType);
  $('resetLinkModal')?.classList.remove('hidden');
}

function closeResetLinkModal() {
  const anchor = $('resetLinkAnchor');
  if (anchor) anchor.href = '#';
  setStatus('resetLinkStatus', '', 'info');
  $('resetLinkModal')?.classList.add('hidden');
}

function editEmployee(id) {
  openEmployeeModal(id);
}

async function toggleEmployeeEnabled(id) {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) return;
  const nextActive = employee.active === false || employee.enabled === false;
  try {
    await upsertEmployeeProfile(employee.id, {
      name: employee.name || '',
      surname: employee.surname || '',
      email: normalizeEmail(employee.email),
      phone: employee.phone || '',
      restaurantRole: employee.restaurantRole || '',
      appRole: employee.appRole || normalizeAppRole(employee.role || ''),
      active: nextActive
    });
    const nextEmployee = buildLocalEmployeeRecord(employee.id, { ...employee, active: nextActive }, employee);
    const currentUserRecord = usersData.find(user => user.id === employee.id) || {};
    upsertEmployeeCache(nextEmployee);
    upsertUserCache(buildLocalUserRecord(employee.id, { ...employee, active: nextActive }, currentUserRecord));
    void writeLog(`employee_${nextActive ? 'enable' : 'disable'}:${employee.id}`);
    renderEmployeesTable();
    renderUsersTable();
    if (employee.id === currentUserUid && !nextActive) {
      notify('Il tuo account è stato disabilitato. Verrai disconnesso.', 'error');
      await logout();
    }
  } catch (e) {
    console.error('Errore aggiornamento stato dipendente:', e);
    notify('Errore aggiornamento stato: ' + e.message, 'error');
  }
}

async function removeEmployee(id) {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) return;
  if (!confirm(`Eliminare definitivamente ${employee.name || employee.email}?`)) return;
  try {
    await callEmployeeAdminFunction('deleteEmployeeAuthUser', { uid: employee.id });
  } catch (e) {
    console.error('Errore cancellazione auth dipendente:', e);
    notify('Eliminazione account Auth richiede Cloud Function `deleteEmployeeAuthUser` configurata.', 'error');
    return;
  }
  try {
    await deleteDoc(employeeDoc(employee.id));
    // Also delete /users/ document for the RBAC system
    try {
      await deleteDoc(userDoc(employee.id));
    } catch (e) {
      console.warn('Avviso: cancellazione /users/ non riuscita:', e.message);
    }
    await deleteUserFromRTDB(employee.id);
    removeEmployeeCache(employee.id);
    removeUserCache(employee.id);
    void writeLog(`employee_delete:${employee.id}`);
    if (editingEmployeeId === employee.id) closeEmployeeModal();
    renderEmployeesTable();
    renderUsersTable();
  } catch (e) {
    console.error('Errore cancellazione profilo dipendente:', e);
    notify('Errore cancellazione profilo: ' + e.message, 'error');
  }
}

async function updateUserRole(uid, role) {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  if (!USER_ROLES_ALL.includes(role)) { notify('Ruolo non valido.', 'error'); return; }
  try {
    await setDoc(userDoc(uid), { role, updatedAt: serverTimestamp() }, { merge: true });
    // Sync to /employees/ for Firestore rules compatibility using shared helpers
    const roleStorage = normalizeStoredRole(role);
    const appRoleSync = roleToAppRoleLabel(roleStorage);
    await setDoc(employeeDoc(uid), { role: roleStorage, appRole: appRoleSync, updatedAt: serverTimestamp() }, { merge: true });
    // Sync to Realtime Database
    try {
      await rtdbUpdate(rtdbUser(uid), { role });
    } catch (e) {
      console.warn('Avviso: aggiornamento RTDB ruolo non riuscito per uid:', uid, 'ruolo:', role, e.message);
    }
    const currentUserRecord = usersData.find(user => user.id === uid) || {};
    upsertUserCache(buildLocalUserRecord(uid, { ...currentUserRecord, role }, currentUserRecord));
    const matchingEmployee = employeesData.find(emp => emp.id === uid);
    if (matchingEmployee) {
      upsertEmployeeCache(buildLocalEmployeeRecord(uid, { ...matchingEmployee, role: roleStorage, appRole: appRoleSync }, matchingEmployee));
    }
    void writeLog(`user_role_update:${uid}:${role}`);
    renderUsersTable();
  } catch (e) {
    console.error('Errore aggiornamento ruolo utente:', e);
    notify('Errore aggiornamento ruolo: ' + e.message, 'error');
  }
}

async function toggleUserActive(uid) {
  if (!isAdmin()) { notify('Solo admin', 'error'); return; }
  const user = usersData.find(u => u.id === uid);
  if (!user) return;
  const nextActive = user.active === false;
  try {
    await setDoc(userDoc(uid), { active: nextActive, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(employeeDoc(uid), { active: nextActive, enabled: nextActive, updatedAt: serverTimestamp() }, { merge: true });
    // Sync to Realtime Database
    try {
      await rtdbUpdate(rtdbUser(uid), { active: nextActive });
    } catch (e) {
      console.warn('Avviso: aggiornamento RTDB stato non riuscito per uid:', uid, 'stato:', nextActive, e.message);
    }
    upsertUserCache(buildLocalUserRecord(uid, { ...user, active: nextActive }, user));
    const matchingEmployee = employeesData.find(emp => emp.id === uid);
    if (matchingEmployee) {
      upsertEmployeeCache(buildLocalEmployeeRecord(uid, { ...matchingEmployee, active: nextActive }, matchingEmployee));
    }
    void writeLog(`user_${nextActive ? 'enable' : 'disable'}:${uid}`);
    renderUsersTable();
    renderEmployeesTable();
    if (uid === currentUserUid && !nextActive) {
      notify('Il tuo account è stato disabilitato. Verrai disconnesso.', 'error');
      await logout();
    }
  } catch (e) {
    console.error('Errore aggiornamento stato utente:', e);
    notify('Errore aggiornamento stato: ' + e.message, 'error');
  }
}

async function loadCurrentUserProfile(user) {
  try {
    ensureFirebaseServicesReady();
  } catch (e) {
    console.error('[Profilo] Servizi Firebase non pronti:', e);
    throw new Error('Servizi Firebase non inizializzati: ' + getErrorDetails(e));
  }
  currentUser = user.email || '';
  currentUserUid = user.uid || '';
  currentUserName = deriveNameFromEmail(user.email);
  currentUserRole = '';
  const bootstrapAdmin = isBootstrapAdminEmail(user.email);
  console.log('[Profilo] Caricamento profilo per:', currentUser, '| uid:', currentUserUid, '| bootstrap admin:', bootstrapAdmin);
  if (bootstrapAdmin) {
    currentUserName = BOOTSTRAP_ADMIN_DEFAULT_NAMES[normalizeEmail(user.email)] || currentUserName;
    currentUserRole = 'admin';
    setStatus('loginStatus', 'Accesso admin bootstrap immediato attivato.', 'info');
    ensureBootstrapAdminProfile(user, { name: currentUserName, email: currentUser }).catch(syncErr => {
      console.warn('[Profilo] Sincronizzazione profilo admin in background non riuscita:', syncErr.message);
    });
    return true;
  }

  const applyRtdbProfile = async (rtdbProfile) => {
    const active = rtdbProfile.active !== false;
    if (!active) {
      console.warn('[Profilo] Account disattivato (RTDB) per uid:', currentUserUid);
      setStatus('loginStatus', 'Account disattivato. Contatta un amministratore.', 'error');
      await signOut(auth);
      return false;
    }
    currentUserName = normalizeName(rtdbProfile.name) || currentUserName;
    currentUserRole = String(rtdbProfile.role || '').trim();
    if (!currentUserRole) {
      console.warn('[Profilo] Ruolo mancante nel profilo RTDB per uid:', currentUserUid);
      setStatus('loginStatus', 'Avviso: ruolo non configurato. Contatta un amministratore.', 'info');
      currentUserRole = 'waiter';
    }
    console.log('[Profilo] Login da RTDB riuscito. Ruolo:', currentUserRole);
    return true;
  };

  const applyUsersProfile = async (profile) => {
    const active = profile.active !== false;
    if (!active) {
      setStatus('loginStatus', 'Account disattivato. Contatta un amministratore.', 'error');
      await signOut(auth);
      return false;
    }
    currentUserName = normalizeName(profile.name) || currentUserName;
    currentUserRole = profile.role || 'waiter';
    writeUserToRTDB(user.uid, profile).then(() => {
      console.log('[Profilo] Migrazione a RTDB riuscita.');
    }).catch(e => {
      console.warn('[Profilo] Migrazione RTDB non riuscita (non bloccante):', getErrorDetails(e));
    });
    console.log('[Profilo] Login da Firestore /users/ riuscito. Ruolo:', currentUserRole);
    return true;
  };

  const applyEmployeesProfile = async (profile) => {
    const enabled = profile.enabled !== false && profile.active !== false;
    if (!enabled) {
      setStatus('loginStatus', 'Account disattivato. Contatta un amministratore.', 'error');
      await signOut(auth);
      return false;
    }
    currentUserName = normalizeName(profile.name) || currentUserName;
    currentUserRole = normalizeStoredRole(profile.appRole || profile.role || 'waiter');
    const resolvedRole = normalizeStoredRole(currentUserRole);
    const resolvedAppRole = normalizeAppRole(profile.appRole || profile.role || currentUserRole) || 'Waiter';
    writeUserToRTDB(user.uid, {
      name: currentUserName,
      email: currentUser,
      role: resolvedRole,
      active: enabled
    }).catch(rtErr => {
      console.warn('[Profilo] Creazione users/{uid} su RTDB non riuscita (non bloccante):', getErrorDetails(rtErr));
    });
    setDoc(userDoc(user.uid), {
      name: currentUserName,
      surname: profile.surname || '',
      email: currentUser,
      phone: profile.phone || '',
      restaurantRole: profile.restaurantRole || '',
      appRole: resolvedAppRole,
      role: resolvedRole,
      status: getEmployeeStatusLabel(enabled),
      active: enabled,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(fsErr => {
      console.warn('[Profilo] Creazione profilo Firestore /users non riuscita (non bloccante):', getErrorDetails(fsErr));
    });
    console.log('[Profilo] Login da Firestore /employees/ riuscito. Ruolo:', currentUserRole);
    return true;
  };

  console.log('[Profilo] Avvio lettura parallela con race da RTDB, Firestore /users/, Firestore /employees/…');
  const profileReads = [
    {
      key: 'rtdb',
      label: 'RTDB users/' + currentUserUid,
      promise: withRetry(() => rtdbGet(rtdbUser(user.uid)), PROFILE_LOAD_MAX_ATTEMPTS, 'RTDB users/' + currentUserUid)
    },
    {
      key: 'users',
      label: 'Firestore /users/' + currentUserUid,
      promise: withRetry(() => getDoc(userDoc(user.uid)), PROFILE_LOAD_MAX_ATTEMPTS, 'Firestore /users/' + currentUserUid)
    },
    {
      key: 'employees',
      label: 'Firestore /employees/' + currentUserUid,
      promise: withRetry(() => getDoc(employeeDoc(user.uid)), PROFILE_LOAD_MAX_ATTEMPTS, 'Firestore /employees/' + currentUserUid)
    }
  ];

  const wrappedReads = profileReads.map((read, index) => read.promise
    .then(value => ({ index, status: 'fulfilled', value }))
    .catch(reason => ({ index, status: 'rejected', reason }))
  );
  const pendingIndexes = new Set(wrappedReads.map((_, index) => index));

  while (pendingIndexes.size) {
    const result = await Promise.race(Array.from(pendingIndexes).map(index => wrappedReads[index]));
    pendingIndexes.delete(result.index);
    const read = profileReads[result.index];

    if (result.status === 'rejected') {
      if (read.key === 'rtdb') {
        console.warn('[Profilo] Lettura RTDB non riuscita (non bloccante):', result.reason?.code, result.reason?.message);
        setStatus('loginStatus', 'Avviso RTDB: ' + getErrorDetails(result.reason) + ' — uso profilo alternativo.', 'info');
      } else if (read.key === 'users') {
        console.warn('[Profilo] Lettura Firestore /users/ non riuscita (non bloccante):', result.reason?.code, result.reason?.message);
      } else {
        console.warn('[Profilo] Lettura Firestore /employees/ non riuscita (non bloccante):', result.reason?.code, result.reason?.message);
      }
      continue;
    }

    if (read.key === 'rtdb') {
      if (!result.value.exists()) {
        console.log('[Profilo] Profilo RTDB non trovato — continuo race con Firestore.');
        continue;
      }
      const rtdbProfile = result.value.val();
      console.log('[Profilo] Profilo RTDB trovato:', rtdbProfile);
      return await applyRtdbProfile(rtdbProfile);
    }

    if (read.key === 'users') {
      if (!result.value.exists()) {
        console.log('[Profilo] Profilo Firestore /users/ non trovato — continuo race.');
        continue;
      }
      const profile = result.value.data();
      console.log('[Profilo] Profilo Firestore /users/ trovato:', profile);
      return await applyUsersProfile(profile);
    }

    if (read.key === 'employees') {
      if (!result.value.exists()) {
        console.log('[Profilo] Profilo Firestore /employees/ non trovato — continuo race.');
        continue;
      }
      const employeeProfile = result.value.data();
      console.log('[Profilo] Profilo Firestore /employees/ trovato:', employeeProfile);
      return await applyEmployeesProfile(employeeProfile);
    }
  }

  // 4. Access denied: only pre-registered users can enter
  console.warn('[Profilo] Nessun profilo trovato per uid/email:', user.uid, currentUser);
  setStatus('loginStatus', 'Accesso negato: email non autorizzata. Contatta un amministratore.', 'error');
  await signOut(auth);
  return false;
}

function shiftMapByKey() {
  const map = new Map();
  mergePresetWeekShifts(shiftsData).forEach(shift => {
    const key = `${shift.uid}__${shift.date}`;
    map.set(key, shift);
  });
  return map;
}

function attendanceV2Path(weekStart, date = '', uid = '') {
  if (uid) return `attendance/${weekStart}/${date}/${uid}`;
  if (date) return `attendance/${weekStart}/${date}`;
  return `attendance/${weekStart}`;
}

function getAttendanceEmployees() {
  if (!currentUserUid) return [];
  if (canViewAllAttendance()) return getShiftEmployees();
  const ownEmployee = getShiftEmployees().find(employee => employee.id === currentUserUid);
  if (ownEmployee) return [ownEmployee];
  return [{ id: currentUserUid, name: currentUserName || deriveNameFromEmail(currentUser) || currentUserUid }];
}

function getCurrentAttendanceWeekDates() {
  const base = parseISODate(today());
  base.setDate(base.getDate() + attendanceWeekOffset * 7);
  return getWeekDatesForDate(toISODate(base));
}

function calcEntryWorkedMinutes(entry) {
  if (!entry || entry.isRestDay) return 0;
  let total = 0;
  const e1 = parseTimeToMinutes(String(entry.entryTime1 || ''));
  const x1 = parseTimeToMinutes(String(entry.exitTime1 || ''));
  if (e1 !== null && x1 !== null) {
    let diff = x1 - e1;
    if (diff < 0) diff += MINUTES_PER_DAY;
    total += diff;
  }
  const e2 = parseTimeToMinutes(String(entry.entryTime2 || ''));
  const x2 = parseTimeToMinutes(String(entry.exitTime2 || ''));
  if (e2 !== null && x2 !== null) {
    let diff = x2 - e2;
    if (diff < 0) diff += MINUTES_PER_DAY;
    total += diff;
  }
  return total;
}

function formatAttendanceOrario(entry) {
  if (!entry) return '';
  if (entry.isRestDay) return 'R';
  const e1 = String(entry.entryTime1 || '').trim();
  const x1 = String(entry.exitTime1 || '').trim();
  const e2 = String(entry.entryTime2 || '').trim();
  const x2 = String(entry.exitTime2 || '').trim();
  if (!e1 && !x1 && !e2 && !x2) return '';
  const hasSplit = e2 || x2;
  if (hasSplit) {
    const lines = [];
    if (e1) lines.push(`X1 ${e1}`);
    if (x1) lines.push(`Y1 ${x1}`);
    if (e2) lines.push(`X2 ${e2}`);
    if (x2) lines.push(`Y2 ${x2}`);
    return lines.join('\n');
  }
  const lines = [];
  if (e1) lines.push(`X ${e1}`);
  if (x1) lines.push(`Y ${x1}`);
  return lines.join('\n');
}

function stopAttendanceV2Listener() {
  if (attendanceV2Unsub) {
    attendanceV2Unsub();
    attendanceV2Unsub = null;
  }
  sectionLoaded.attendance = false;
}

function markAttendanceEditorDirty() {
  if (!editingAttendanceUid || !editingAttendanceDate) return;
  attendanceEditorDirty = true;
}

function applyAttendanceWeekEntries(weekStart, weekData) {
  attendanceWeekEntries = {};
  Object.entries(weekData || {}).forEach(([date, dateData]) => {
    if (dateData && typeof dateData === 'object') {
      attendanceWeekEntries[date] = dateData;
    }
  });
  sectionLoaded.attendance = true;
  attendanceLoadedWeekStart = weekStart;
}

async function readAttendanceWeekEntries(weekDates = getCurrentAttendanceWeekDates()) {
  const weekStart = weekDates?.[0]?.date || '';
  if (!weekStart) return { weekStart: '', weekData: {} };
  if (canViewAllAttendance()) {
    const snap = await rtdbGet(rtdbRef(rtdb, attendanceV2Path(weekStart)));
    return { weekStart, weekData: snap.exists() ? (snap.val() || {}) : {} };
  }
  const reads = weekDates.map(day =>
    rtdbGet(rtdbRef(rtdb, attendanceV2Path(weekStart, day.date, currentUserUid)))
      .then(snap => ({ date: day.date, value: snap.exists() ? snap.val() : null }))
  );
  const results = await Promise.all(reads);
  const weekData = {};
  results.forEach(({ date, value }) => {
    weekData[date] = value ? { [currentUserUid]: value } : {};
  });
  return { weekStart, weekData };
}

async function readAttendanceDayEntries(date, { forceRefresh = false } = {}) {
  if (!date) return null;
  const weekStart = getWeekStartISO(date);
  const cached = attendanceWeekEntries?.[date];
  if (!forceRefresh && attendanceLoadedWeekStart === weekStart && cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
    return cached;
  }
  const daySnap = await rtdbGet(rtdbRef(rtdb, attendanceV2Path(weekStart, date)));
  if (daySnap.exists()) {
    const dayData = daySnap.val() || {};
    if (attendanceLoadedWeekStart === weekStart) {
      attendanceWeekEntries[date] = dayData;
    }
    return dayData;
  }
  const oldSnap = await rtdbGet(rtdbRef(rtdb, `attendance/${date}`));
  if (oldSnap.exists()) {
    return oldSnap.val() || {};
  }
  return null;
}

async function refreshAttendanceState(weekDates = getCurrentAttendanceWeekDates(), successMessage = null) {
  const { weekStart, weekData } = await readAttendanceWeekEntries(weekDates);
  applyAttendanceWeekEntries(weekStart, weekData);
  const defaultMessage = canManageAttendance() ? '' : 'Visualizzi solo la tua entrata e uscita.';
  if (successMessage != null) setAttendanceStatus(successMessage, 'info');
  else if (defaultMessage) setAttendanceStatus(defaultMessage, 'info');
  else setAttendanceStatus('');
  renderAttendance();
}

async function persistAttendanceEditorIfDirty() {
  if (!attendanceEditorDirty || !editingAttendanceUid || !editingAttendanceDate) return true;
  return saveAttendanceEntry({ silentSuccess: true });
}

function syncAttendanceRestDayState() {
  const isRest = $('attRestDay') ? $('attRestDay').checked : false;
  const hide = isRest;
  if ($('attEntry1Wrap')) $('attEntry1Wrap').classList.toggle('hidden', hide);
  if ($('attExit1Wrap')) $('attExit1Wrap').classList.toggle('hidden', hide);
  if ($('attEntry2Wrap')) $('attEntry2Wrap').classList.toggle('hidden', hide);
  if ($('attExit2Wrap')) $('attExit2Wrap').classList.toggle('hidden', hide);
}

function openAttendanceEditor(uid, date) {
  if (!canManageAttendance()) return;
  const weekDates = getCurrentAttendanceWeekDates();
  const entry = (attendanceWeekEntries?.[date] || {})[uid] || null;
  editingAttendanceUid = uid;
  editingAttendanceDate = date;
  if ($('attEntry1')) $('attEntry1').value = entry?.entryTime1 || '';
  if ($('attExit1')) $('attExit1').value = entry?.exitTime1 || '';
  if ($('attEntry2')) $('attEntry2').value = entry?.entryTime2 || '';
  if ($('attExit2')) $('attExit2').value = entry?.exitTime2 || '';
  if ($('attNotes')) $('attNotes').value = entry?.notes || '';
  if ($('attRestDay')) $('attRestDay').checked = Boolean(entry?.isRestDay);
  syncAttendanceRestDayState();
  const hasEntry = Boolean(entry && (entry.entryTime1 || entry.exitTime1 || entry.isRestDay));
  if ($('attDeleteEntryBtn')) $('attDeleteEntryBtn').classList.toggle('hidden', !hasEntry);
  const ctx = $('attendanceEditorContext');
  if (ctx) {
    const emp = getAttendanceEmployees().find(e => e.id === uid);
    const dayInfo = weekDates.find(d => d.date === date);
    const empName = emp?.name || uid;
    const dayLabel = dayInfo ? `${dayInfo.dayName} ${dayInfo.shortDate}` : fmt(date);
    ctx.textContent = `📅 ${dayLabel} — ${empName}`;
    ctx.classList.remove('hidden');
  }
  if ($('attendanceEditor')) {
    $('attendanceEditor').classList.remove('hidden');
    $('attendanceEditor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  attendanceEditorDirty = false;
}

function closeAttendanceEditor() {
  editingAttendanceUid = '';
  editingAttendanceDate = '';
  attendanceEditorDirty = false;
  if ($('attEntry1')) $('attEntry1').value = '';
  if ($('attExit1')) $('attExit1').value = '';
  if ($('attEntry2')) $('attEntry2').value = '';
  if ($('attExit2')) $('attExit2').value = '';
  if ($('attNotes')) $('attNotes').value = '';
  if ($('attRestDay')) $('attRestDay').checked = false;
  syncAttendanceRestDayState();
  if ($('attDeleteEntryBtn')) $('attDeleteEntryBtn').classList.add('hidden');
  const ctx = $('attendanceEditorContext');
  if (ctx) { ctx.textContent = ''; ctx.classList.add('hidden'); }
  if ($('attendanceEditor')) $('attendanceEditor').classList.add('hidden');
}

function renderAttendanceTable() {
  const table = $('attendanceTable');
  if (!table) return;
  const employees = getAttendanceEmployees();
  const weekDates = getCurrentAttendanceWeekDates();
  const canEdit = canManageAttendance();
  // Build two-row header
  let html = '<thead>';
  html += '<tr>';
  html += '<th class="shift-employee-header att-name-header" rowspan="2">Dipendente</th>';
  html += '<th class="att-contract-header" rowspan="2">Ore<br>contratt.</th>';
  weekDates.forEach(day => {
    html += `<th colspan="2" class="att-day-header">${esc(day.dayName)}<span class="shift-date">${esc(day.shortDate)}</span></th>`;
  });
  html += '<th class="att-total-header" rowspan="2">Ore<br>fatte</th>';
  html += '<th class="att-diff-header" rowspan="2">Diff.<br>ore</th>';
  html += '</tr>';
  html += '<tr>';
  weekDates.forEach(() => {
    html += '<th class="att-subheader">Orario</th><th class="att-subheader att-ore-header">#Ore</th>';
  });
  html += '</tr>';
  html += '</thead>';
  // Body
  html += '<tbody>';
  if (!employees.length) {
    html += `<tr><td colspan="${4 + weekDates.length * 2}">Nessun dipendente disponibile.</td></tr>`;
    html += '</tbody>';
    table.innerHTML = html;
    return;
  }
  employees.forEach(employee => {
    const contractHours = Number(contractHoursData?.[employee.id] || 0);
    let totalWorkedMinutes = 0;
    html += `<tr data-att-row-uid="${esc(employee.id)}">`;
    html += `<td class="shift-employee-cell">${esc(employee.name)}</td>`;
    if (canEdit) {
      html += `<td class="att-contract-cell"><input class="att-contract-input" type="number" min="0" max="168" step="0.5" value="${contractHours || ''}" placeholder="0" data-att-contract-uid="${esc(employee.id)}"></td>`;
    } else {
      html += `<td class="att-contract-cell">${contractHours || '-'}</td>`;
    }
    weekDates.forEach(day => {
      const entry = (attendanceWeekEntries?.[day.date] || {})[employee.id] || null;
      const orarioText = formatAttendanceOrario(entry);
      const workedMinutes = calcEntryWorkedMinutes(entry);
      totalWorkedMinutes += workedMinutes;
      const orarioHtml = orarioText ? esc(orarioText).replace(/\n/g, '<br>') : '';
      const isRest = entry?.isRestDay;
      const hasTimes = orarioText && !isRest;
      const cellClass = isRest ? 'att-orario-cell att-rest-cell' : (hasTimes ? 'att-orario-cell att-filled-cell' : 'att-orario-cell att-empty-cell');
      if (canEdit) {
        html += `<td class="${cellClass} att-orario-clickable" data-att-uid="${esc(employee.id)}" data-att-date="${esc(day.date)}">${orarioHtml}</td>`;
      } else {
        html += `<td class="${cellClass}">${orarioHtml}</td>`;
      }
      let oreDisplay;
      if (isRest) {
        oreDisplay = 'R';
      } else if (workedMinutes > 0) {
        oreDisplay = esc(formatWorkedHours(workedMinutes));
      } else {
        oreDisplay = '-';
      }
      html += `<td class="att-ore-cell">${oreDisplay}</td>`;
    });
    const oreFatteDisplay = totalWorkedMinutes > 0 ? esc(formatWorkedHours(totalWorkedMinutes)) : '-';
    const totalHoursNum = totalWorkedMinutes / 60;
    const diffHours = contractHours > 0 ? totalHoursNum - contractHours : null;
    const diffDisplay = diffHours !== null ? `${diffHours >= 0 ? '+' : ''}${num(diffHours)} h` : '-';
    const diffClass = diffHours === null ? '' : (diffHours > 0 ? 'att-diff-positive' : diffHours < 0 ? 'att-diff-negative' : 'att-diff-zero');
    html += `<td class="att-total-cell">${oreFatteDisplay}</td>`;
    html += `<td class="att-diff-cell ${diffClass}">${diffDisplay}</td>`;
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
  // Attach event handlers
  if (canEdit) {
    table.querySelectorAll('.att-contract-input').forEach(input => {
      input.addEventListener('blur', () => {
        const uid = input.getAttribute('data-att-contract-uid');
        if (!uid) return;
        void saveContractHours(uid, input.value);
      });
    });
    table.querySelectorAll('.att-orario-clickable').forEach(cell => {
      cell.addEventListener('click', async () => {
        const uid = cell.getAttribute('data-att-uid');
        const date = cell.getAttribute('data-att-date');
        if (!uid || !date) return;
        const saved = await persistAttendanceEditorIfDirty();
        if (!saved) return;
        openAttendanceEditor(uid, date);
      });
    });
  }
}

function renderAttendance() {
  renderAttendanceTable();
}

async function attachAttendanceListeners() {
  stopAttendanceV2Listener();
  if (!currentUserUid) {
    attendanceWeekEntries = {};
    attendanceLoadedWeekStart = '';
    contractHoursData = {};
    setAttendanceStatus('');
    renderAttendance();
    return;
  }
  const weekDates = getCurrentAttendanceWeekDates();
  const weekStart = weekDates[0].date;
  attendanceWeekEntries = {};
  setAttendanceStatus('Caricamento entrate e uscite...', 'info');
  renderAttendance();
  // Load contract hours (non-blocking)
  rtdbGet(rtdbRef(rtdb, 'contractHours')).then(snap => {
    contractHoursData = snap.exists() ? (snap.val() || {}) : {};
    renderAttendanceTable();
  }).catch(e => {
    console.warn('[Attendance] Ore contrattuali non caricate:', e);
  });
  try {
    await refreshAttendanceState(weekDates);
  } catch (e) {
    console.error('[Attendance] Errore caricamento:', e);
    sectionLoaded.attendance = false;
    attendanceLoadedWeekStart = '';
    setAttendanceStatus(getFriendlyRtdbMessage(e, 'Impossibile caricare entrata e uscita.'), 'error');
    return;
  }
  if (!canViewAllAttendance()) return;
  const weekRef = rtdbRef(rtdb, attendanceV2Path(weekStart));
  const unsub = rtdbOnValue(weekRef, snap => {
    applyAttendanceWeekEntries(weekStart, snap.exists() ? (snap.val() || {}) : {});
    setAttendanceStatus('');
    renderAttendance();
  }, err => {
    console.error('[Attendance] Errore listener RTDB:', err);
    sectionLoaded.attendance = false;
    attendanceLoadedWeekStart = '';
    setAttendanceStatus(getFriendlyRtdbMessage(err, 'Impossibile aggiornare entrata e uscita.'), 'error');
  });
  attendanceV2Unsub = unsub;
}

async function loadAttendanceData(forceRefresh = false) {
  return attachAttendanceListeners();
}

async function saveAttendanceEntry(options = {}) {
  const { silentSuccess = false } = options;
  if (!canManageAttendance()) { setAttendanceStatus('Accesso consentito solo ad Admin/Manager/Responsabile.', 'error'); return false; }
  const uid = editingAttendanceUid;
  const date = editingAttendanceDate;
  if (!uid || !date) { setAttendanceStatus('Nessuna cella selezionata.', 'error'); return false; }
  if (!currentUserUid) { setAttendanceStatus('Sessione non valida. Effettua di nuovo il login.', 'error'); return false; }
  const weekStart = getWeekStartISO(date);
  const isRestDay = $('attRestDay') ? $('attRestDay').checked : false;
  const entryTime1 = isRestDay ? '' : String($('attEntry1')?.value || '').trim();
  const exitTime1 = isRestDay ? '' : String($('attExit1')?.value || '').trim();
  const entryTime2 = isRestDay ? '' : String($('attEntry2')?.value || '').trim();
  const exitTime2 = isRestDay ? '' : String($('attExit2')?.value || '').trim();
  const notes = String($('attNotes')?.value || '').trim();
  const employee = getAttendanceEmployees().find(e => e.id === uid);
  const entryForCalc = { entryTime1, exitTime1, entryTime2, exitTime2, isRestDay };
  const workedMinutes = calcEntryWorkedMinutes(entryForCalc);
  const workedHours = Math.round((workedMinutes / 60) * 100) / 100;
  const payload = {
    uid,
    employeeName: employee?.name || '',
    date,
    entryTime1,
    exitTime1,
    entryTime2,
    exitTime2,
    isRestDay,
    workedHours,
    notes,
    updatedAt: new Date().toISOString(),
    updatedBy: currentUserUid
  };
  try {
    await rtdbSet(rtdbRef(rtdb, attendanceV2Path(weekStart, date, uid)), payload);
    if (!attendanceWeekEntries[date]) attendanceWeekEntries[date] = {};
    attendanceWeekEntries[date][uid] = payload;
    void writeLog(`attendance_save:${date}:${uid}`);
    closeAttendanceEditor();
    await attachAttendanceListeners();
    if (document.querySelector('.page.active')?.id === 'newday' && $('date')?.value === date) {
      await populateHoursFromAttendance(date, { forceRefresh: true, silent: true });
    }
    if (!silentSuccess) setAttendanceStatus('Entrata/uscita salvata e ricaricata.', 'info');
    return true;
  } catch (e) {
    console.error('[Attendance] Errore salvataggio:', e);
    setAttendanceStatus(getFriendlyRtdbMessage(e, 'Errore salvataggio entrata/uscita.'), 'error');
    return false;
  }
}

async function deleteAttendanceEntry() {
  if (!canManageAttendance()) return;
  const uid = editingAttendanceUid;
  const date = editingAttendanceDate;
  if (!uid || !date) return;
  if (!confirm('Eliminare questa entrata/uscita?')) return;
  const weekStart = getWeekStartISO(date);
  try {
    await rtdbSet(rtdbRef(rtdb, attendanceV2Path(weekStart, date, uid)), null);
    if (attendanceWeekEntries[date]) delete attendanceWeekEntries[date][uid];
    void writeLog(`attendance_delete:${date}:${uid}`);
    closeAttendanceEditor();
    await attachAttendanceListeners();
    if (document.querySelector('.page.active')?.id === 'newday' && $('date')?.value === date) {
      await populateHoursFromAttendance(date, { forceRefresh: true, silent: true });
    }
    setAttendanceStatus('Entrata/uscita eliminata e ricaricata.', 'info');
  } catch (e) {
    console.error('[Attendance] Errore eliminazione:', e);
    setAttendanceStatus(getFriendlyRtdbMessage(e, 'Errore eliminazione entrata/uscita.'), 'error');
  }
}

async function saveContractHours(uid, hours) {
  if (!canManageAttendance()) return;
  const MAX_WEEKLY_HOURS = 168; // 7 days × 24 hours
  const value = Math.max(0, Math.min(MAX_WEEKLY_HOURS, Number(hours) || 0));
  try {
    await rtdbSet(rtdbRef(rtdb, `contractHours/${uid}`), value);
    contractHoursData[uid] = value;
    renderAttendanceTable();
  } catch (e) {
    console.warn('[Attendance] Impossibile salvare ore contrattuali:', e);
    setAttendanceStatus(getFriendlyRtdbMessage(e, 'Impossibile salvare le ore contrattuali.'), 'error');
  }
}

function maybeShowTodayShiftPopup() {
  if (todayShiftPopupShown || canManageShifts() || !currentUserUid) return;
  const shift = mergePresetWeekShifts(shiftsData).find(s => s.uid === currentUserUid && s.date === today());
  if (!shift) return;
  todayShiftPopupShown = true;
  const text = getShiftDisplayText(shift);
  setShiftStatus(`Il tuo turno di oggi: ${text || 'Nessun turno assegnato'}`, 'info');
}

function renderShiftTable(tableId, allowEdit) {
  const table = $(tableId);
  if (!table) return;
  const weekDates = getCurrentWeekDates();
  const employees = getShiftEmployees();
  const shiftByKey = shiftMapByKey();
  let html = '<tr><th class="shift-employee-header">Dipendente</th>';
  weekDates.forEach(day => {
    html += `<th>${day.dayName}<span class="shift-date">${day.shortDate}</span></th>`;
  });
  html += '</tr>';
  if (!employees.length) {
    html += `<tr><td colspan="${weekDates.length + 1}">Nessun dipendente disponibile.</td></tr>`;
    table.innerHTML = html;
    return;
  }
  const totals = weekDates.map(() => ({ M: 0, P: 0, S: 0 }));
  employees.forEach(employee => {
    html += `<tr><td class="shift-employee-cell">${esc(employee.name)}</td>`;
    weekDates.forEach((day, index) => {
      const shift = shiftByKey.get(`${employee.id}__${day.date}`);
      const shiftText = getShiftDisplayText(shift);
      const cls = shift ? classifyShift(shift) : { type: 'shift-empty', total: '' };
      if (cls.total) totals[index][cls.total] += 1;
      if (allowEdit) console.log('[ShiftTable] Render cella — employeeId:', employee.id, '| date:', day.date);
      html += `<td class="shift-cell ${cls.type || 'shift-empty'}" data-shift-uid="${esc(employee.id)}" data-shift-date="${day.date}" ${allowEdit ? '' : 'data-readonly="true"'}>${esc(shiftText)}</td>`;
    });
    html += '</tr>';
  });
  const presetTotals = getPresetWeekTotals(weekDates);
  if (presetTotals.length === totals.length) {
    presetTotals.forEach((dayTotal, index) => {
      totals[index] = dayTotal;
    });
  }
  html += '<tr class="shift-total-row"><td class="shift-employee-cell">Totali</td>';
  totals.forEach(dayTotal => {
    html += `<td class="shift-total-cell"><div class="shift-total-line">M: ${dayTotal.M}</div><div class="shift-total-line">P: ${dayTotal.P}</div><div class="shift-total-line">S: ${dayTotal.S}</div></td>`;
  });
  html += '</tr>';
  table.innerHTML = html;
  if (allowEdit) {
    table.querySelectorAll('td.shift-cell').forEach(cell => {
      cell.addEventListener('click', e => {
        e.stopPropagation();
        const uid = cell.getAttribute('data-shift-uid') || '';
        const date = cell.getAttribute('data-shift-date') || '';
        console.log('[ShiftTable] Click cella — employeeId:', uid, '| date:', date);
        openShiftEditor(uid, date);
      });
    });
  }
}

function renderShifts() {
  renderShiftTable('shiftsTable', canManageShifts());
  renderShiftTable('myShiftsTable', false);
  renderMyShiftCards();
  maybeShowTodayShiftPopup();
}

function renderMyShiftCards() {
  const list = $('myShiftsMobileList');
  if (!list) return;
  if (!currentUserUid || canManageShifts()) {
    list.innerHTML = '';
    return;
  }
  const weekDates = getCurrentWeekDates();
  const shiftByKey = shiftMapByKey();
  list.innerHTML = weekDates.map(day => {
    const shift = shiftByKey.get(`${currentUserUid}__${day.date}`);
    const shiftInfo = shift ? classifyShift(shift) : { type: 'shift-empty' };
    const shiftText = !shift ? 'Nessun turno assegnato' : (shift.isRestDay ? 'Riposo' : (getShiftDisplayText(shift) || 'Turno assegnato'));
    const role = shift?.role ? `<span class="shift-mobile-meta">Ruolo: ${esc(shift.role)}</span>` : '';
    const notes = shift?.notes ? `<span class="shift-mobile-meta">Note: ${esc(shift.notes)}</span>` : '';
    return `<article class="shift-mobile-card ${shiftInfo.type || 'shift-empty'}">
      <div class="shift-mobile-head">
        <strong>${day.dayName}</strong>
        <span>${day.shortDate}</span>
      </div>
      <div class="shift-mobile-body">
        <span class="shift-mobile-value">${esc(shiftText)}</span>
        ${role}
        ${notes}
      </div>
    </article>`;
  }).join('');
}

function syncShiftEditorRestState() {
  const shiftType = normalizeShiftType($('shiftType').value);
  const restChecked = $('shiftRestDay').checked;
  if (restChecked && shiftType !== 'rest') $('shiftType').value = 'rest';
  if (!restChecked && shiftType === 'rest') $('shiftType').value = 'morning';
  const isRest = restChecked || normalizeShiftType($('shiftType').value) === 'rest';
  $('shiftRestDay').checked = isRest;
  $('shiftStartWrap').classList.toggle('hidden', isRest);
  $('shiftEndWrap').classList.toggle('hidden', isRest);
  if (isRest && !String($('shiftText').value || '').trim()) $('shiftText').value = 'R';
}

function clearShiftEditor() {
  editingShiftId = '';
  $('shiftEmployee').value = '';
  $('shiftDate').value = '';
  $('shiftStartTime').value = '';
  $('shiftEndTime').value = '';
  $('shiftType').value = 'morning';
  $('shiftText').value = '';
  $('shiftRole').value = '';
  $('shiftNotes').value = '';
  $('shiftRestDay').checked = false;
  syncShiftEditorRestState();
  $('shiftDeleteBtn').classList.add('hidden');
  const ctx = $('shiftEditorContext');
  if (ctx) { ctx.textContent = ''; ctx.classList.add('hidden'); }
  $('shiftEditor').classList.add('hidden');
}

function populateShiftEmployeeOptions(selectedUid = '') {
  const select = $('shiftEmployee');
  if (!select) return;
  const employees = getShiftEmployees();
  select.innerHTML = '<option value="">Seleziona dipendente</option>' + employees.map(emp => `<option value="${esc(emp.id)}">${esc(emp.name)}</option>`).join('');
  if (selectedUid) select.value = selectedUid;
}

function openShiftEditor(uid = '', date = '') {
  if (!canManageShifts()) return;
  populateShiftEmployeeOptions(uid);
  const targetDate = date || getCurrentWeekDates()[0].date;
  const existing = shiftMapByKey().get(`${uid}__${targetDate}`) || null;
  editingShiftId = existing && !existing._isPreset ? (existing.id || '') : '';
  $('shiftEmployee').value = uid || existing?.uid || '';
  $('shiftDate').value = targetDate;
  $('shiftStartTime').value = existing?.startTime || '';
  $('shiftEndTime').value = existing?.endTime || '';
  const existingClass = existing ? classifyShift(existing) : null;
  $('shiftType').value = normalizeShiftType(existing?.shiftType) || existingClass?.shiftType || 'morning';
  $('shiftText').value = existing?.shiftText || '';
  $('shiftRole').value = normalizeRole(existing?.role);
  $('shiftNotes').value = existing?.notes || '';
  $('shiftRestDay').checked = Boolean(existing?.isRestDay) || $('shiftType').value === 'rest';
  syncShiftEditorRestState();
  $('shiftDeleteBtn').classList.toggle('hidden', !editingShiftId || !canManageShifts());
  const ctx = $('shiftEditorContext');
  if (ctx) {
    const selectedOption = $('shiftEmployee').options[$('shiftEmployee').selectedIndex];
    const empName = selectedOption && selectedOption.value ? selectedOption.text : '';
    const weekDay = getCurrentWeekDates().find(d => d.date === targetDate);
    const dayLabel = weekDay ? `${weekDay.dayName} ${weekDay.shortDate}` : fmt(targetDate);
    if (empName && dayLabel) {
      ctx.textContent = `📅 ${dayLabel} — ${empName}`;
      ctx.classList.remove('hidden');
    } else {
      ctx.textContent = '';
      ctx.classList.add('hidden');
    }
  }
  $('shiftEditor').classList.remove('hidden');
  $('shiftEditor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveShift() {
  if (!canManageShifts()) { setShiftStatus('Accesso consentito solo ad Admin/Manager/Responsible.', 'error'); return; }
  const uid = $('shiftEmployee').value;
  const date = $('shiftDate').value;
  const selectedEmployee = getShiftEmployees().find(emp => emp.id === uid);
  let shiftType = normalizeShiftType($('shiftType').value) || 'morning';
  const isRestDay = $('shiftRestDay').checked || shiftType === 'rest';
  if (!uid) { setShiftStatus('Seleziona un dipendente.', 'error'); return; }
  if (!date) { setShiftStatus('Seleziona una data.', 'error'); return; }
  const startTime = isRestDay ? null : String($('shiftStartTime').value || '').trim();
  const endTime = isRestDay ? null : String($('shiftEndTime').value || '').trim();
  let shiftText = String($('shiftText').value || '').trim();
  if (isRestDay) {
    shiftType = 'rest';
    shiftText = 'R';
  }
  if (!isRestDay && !shiftText && startTime && endTime) shiftText = `${startTime}-${endTime}`;
  if (!isRestDay && !normalizeShiftType(shiftType)) {
    shiftType = classifyShift({ shiftText, startTime, endTime, isRestDay: false }).shiftType || 'morning';
  }
  const payload = {
    uid,
    employeeName: selectedEmployee?.name || '',
    date,
    weekStart: getWeekStartISO(date),
    shiftText,
    startTime,
    endTime,
    shiftType,
    role: normalizeRole($('shiftRole').value) || 'Waiter',
    notes: String($('shiftNotes').value || '').trim(),
    isRestDay,
    updatedAt: serverTimestamp()
  };
  try {
    if (editingShiftId) {
      await setDoc(shiftDoc(editingShiftId), payload, { merge: true });
      void writeLog(`shift_update:${editingShiftId}`);
    } else {
      await addDoc(shiftCollection(), {
        ...payload,
        createdBy: currentUserUid || '',
        createdAt: serverTimestamp()
      });
      void writeLog(`shift_create:${uid}:${date}`);
    }
    attendanceLoadedWeekStart = '';
    sectionLoaded.attendance = false;
    clearShiftEditor();
    setShiftStatus('Turno salvato.', 'info');
  } catch (e) {
    console.error('Errore salvataggio turno:', e);
    setShiftStatus('Errore salvataggio turno: ' + e.message, 'error');
  }
}

async function deleteShift() {
  if (!canManageShifts()) {
    console.warn('Solo Admin/Manager/Responsible possono eliminare i turni.');
    notify('Questa azione richiede permessi Admin/Manager/Responsible.', 'error');
    return;
  }
  if (!editingShiftId) return;
  if (!confirm('Eliminare questo turno?')) return;
  try {
    await deleteDoc(shiftDoc(editingShiftId));
    void writeLog(`shift_delete:${editingShiftId}`);
    attendanceLoadedWeekStart = '';
    sectionLoaded.attendance = false;
    clearShiftEditor();
  } catch (e) {
    console.error('Errore eliminazione turno:', e);
    notify('Errore eliminazione turno: ' + e.message, 'error');
  }
}

function attachShiftListeners() {
  if (shiftsUnsub) {
    shiftsUnsub();
    shiftsUnsub = null;
  }
  if (!currentUserUid) {
    shiftsData = [];
    setShiftStatus('');
    renderShifts();
    return;
  }
  shiftsData = [];
  setShiftStatus('Caricamento turni...', 'info');
  renderShifts();
  const weekDates = getCurrentWeekDates();
  let q = query(
    shiftCollection(),
    where('date', '>=', weekDates[0].date),
    where('date', '<=', weekDates[6].date),
    orderBy('date', 'asc')
  );
  shiftsUnsub = onSnapshot(q, snap => {
    setShiftStatus('');
    shiftsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    sectionLoaded.shifts = true;
    renderShifts();
  }, err => {
    console.error('Errore caricamento turni:', err);
    shiftsData = [];
    clearShiftEditor();
    setShiftStatus(getFriendlyFirestoreMessage(err, 'Impossibile caricare i turni.'), 'error');
    renderShifts();
  });
}

function stopShiftListeners() {
  if (shiftsUnsub) {
    shiftsUnsub();
    shiftsUnsub = null;
  }
  sectionLoaded.shifts = false;
}

async function ensureShiftsLoaded() {
  if (sectionLoaded.shifts) return;
  if (shiftLoadPromise) return shiftLoadPromise;
  shiftLoadPromise = Promise.resolve().then(() => {
    attachShiftListeners();
  }).finally(() => {
    shiftLoadPromise = null;
  });
  return shiftLoadPromise;
}

// INIT
function init() {
  $('date').value = today();
  $('from').value = today().slice(0, 8) + '01';
  $('to').value = today();
  
  document.querySelectorAll('nav button').forEach(b => {
    b.onclick = () => { void tab(b.dataset.tab, b); };
  });
  
  $('saveBtn').onclick = saveDay;
  $('clearBtn').onclick = () => clear();
  $('shareBtn').onclick = shareWhatsApp;
  $('date').onchange = () => { calc(); populateHoursFromAttendance($('date').value); };
  $('export').onclick = exportCSV;
  $('deleteAll').onclick = deleteAll;
  $('send').onclick = sendMsg;
  $('saveSet').onclick = saveSettings;
  $('employeeSaveBtn').onclick = createEmployee;
  $('modalEmpSaveBtn').onclick = saveEmployeeModal;
  $('modalEmpResetPasswordBtn').onclick = () => resetEmployeePassword(editingEmployeeId);
  $('modalEmpDeleteBtn').onclick = deleteEmployeeFromModal;
  $('modalEmpCloseBtn').onclick = closeEmployeeModal;
  $('employeeModal').onclick = e => { if (e.target === $('employeeModal')) closeEmployeeModal(); };
  $('resetLinkCopyBtn').onclick = async () => {
    const anchor = $('resetLinkAnchor');
    const link = anchor?.href;
    if (!link || !/^https?:\/\//.test(link)) return;
    try {
      await navigator.clipboard.writeText(link);
      setStatus('resetLinkStatus', 'Link copiato negli appunti!', 'info');
    } catch {
      setStatus('resetLinkStatus', 'Impossibile copiare — seleziona il link manualmente.', 'error');
    }
  };
  $('resetLinkCloseBtn').onclick = closeResetLinkModal;
  $('resetLinkModal').onclick = e => { if (e.target === $('resetLinkModal')) closeResetLinkModal(); };
  $('shiftPrevWeekBtn').onclick = () => { weekOffset -= 1; clearShiftEditor(); attachShiftListeners(); };
  $('shiftCurrentWeekBtn').onclick = () => { weekOffset = 0; clearShiftEditor(); attachShiftListeners(); };
  $('shiftNextWeekBtn').onclick = () => { weekOffset += 1; clearShiftEditor(); attachShiftListeners(); };
  $('myShiftPrevWeekBtn').onclick = () => { weekOffset -= 1; attachShiftListeners(); };
  $('myShiftCurrentWeekBtn').onclick = () => { weekOffset = 0; attachShiftListeners(); };
  $('myShiftNextWeekBtn').onclick = () => { weekOffset += 1; attachShiftListeners(); };
  $('newShiftBtn').onclick = () => {
    const employees = getShiftEmployees();
    openShiftEditor(employees[0]?.id || '', getCurrentWeekDates()[0].date);
  };
  $('shiftRestDay').onchange = syncShiftEditorRestState;
  $('shiftType').onchange = syncShiftEditorRestState;
  $('shiftSaveBtn').onclick = saveShift;
  $('shiftDeleteBtn').onclick = deleteShift;
  $('shiftCancelBtn').onclick = clearShiftEditor;
  $('attendancePrevWeekBtn').onclick = async () => {
    const saved = await persistAttendanceEditorIfDirty();
    if (!saved) return;
    attendanceWeekOffset -= 1;
    closeAttendanceEditor();
    await attachAttendanceListeners();
  };
  $('attendanceCurrentWeekBtn').onclick = async () => {
    const saved = await persistAttendanceEditorIfDirty();
    if (!saved) return;
    attendanceWeekOffset = 0;
    closeAttendanceEditor();
    await attachAttendanceListeners();
  };
  $('attendanceNextWeekBtn').onclick = async () => {
    const saved = await persistAttendanceEditorIfDirty();
    if (!saved) return;
    attendanceWeekOffset += 1;
    closeAttendanceEditor();
    await attachAttendanceListeners();
  };
  $('attSaveEntryBtn').onclick = saveAttendanceEntry;
  $('attDeleteEntryBtn').onclick = deleteAttendanceEntry;
  $('attCancelEntryBtn').onclick = closeAttendanceEditor;
  ['attEntry1', 'attExit1', 'attEntry2', 'attExit2', 'attNotes'].forEach(id => {
    $(id).oninput = markAttendanceEditorDirty;
  });
  $('attRestDay').onchange = () => {
    markAttendanceEditorDirty();
    syncAttendanceRestDayState();
  };
  $('shiftsTable').onclick = e => {
    if (!canManageShifts()) return;
    const cell = e.target.closest('td.shift-cell');
    if (!cell) return;
    const uid = cell.getAttribute('data-shift-uid') || '';
    const date = cell.getAttribute('data-shift-date') || '';
    console.log('[ShiftsTable] Click delegato — employeeId:', uid, '| date:', date);
    openShiftEditor(uid, date);
  };
  $('employeeList').onclick = e => {
    const btn = e.target.closest('button[data-employee-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-employee-id') || '';
    const action = btn.getAttribute('data-employee-action');
    if (!id || !action) return;
    if (action === 'edit') editEmployee(id);
    if (action === 'reset-password') resetEmployeePassword(id);
  };
  $('usersList').onchange = e => {
    const select = e.target.closest('.user-role-select');
    if (!select) return;
    const uid = select.getAttribute('data-user-id') || '';
    if (!uid) return;
    updateUserRole(uid, select.value);
  };
  $('usersList').onclick = e => {
    const btn = e.target.closest('button[data-user-action]');
    if (!btn) return;
    const uid = btn.getAttribute('data-user-id') || '';
    const action = btn.getAttribute('data-user-action');
    if (!uid || !action) return;
    if (action === 'toggle') toggleUserActive(uid);
  };
  $('loginBtn').onclick = doLogin;
  $('logoutBtn').onclick = logout;
  $('msg').onkeypress = e => { if (e.key === 'Enter') sendMsg(); };
  $('loginPass').onkeypress = e => { if (e.key === 'Enter') doLogin(); };
  $('loginEmail').onkeypress = e => { if (e.key === 'Enter') doLogin(); };
  $('from').onchange = () => stats();
  $('to').onchange = () => stats();
}

// TAB NAVIGATION
async function tab(id, b) {
  const previousTab = document.querySelector('.page.active')?.id || '';
  if (id === 'employeeManagement' && !isAdmin()) {
    console.warn('Solo admin possono vedere i dipendenti.');
    notify('Non hai i permessi per accedere a questa sezione.', 'error');
    return;
  }
  if (id === 'settings' && !isAdmin()) {
    console.warn('Accesso alle impostazioni riservato agli admin.');
    notify('Non hai i permessi per accedere a questa sezione.', 'error');
    return;
  }
  if ((id === 'history' || id === 'stats' || id === 'newday') && !canViewGlobalTipsData()) {
    notify('Non hai i permessi per accedere a questa sezione.', 'error');
    return;
  }
  if (id === 'myShifts' && canManageShifts()) {
    notify('Questa vista è disponibile per i dipendenti.', 'info');
    return;
  }
  if (previousTab === 'attendance' && id !== 'attendance') {
    const saved = await persistAttendanceEditorIfDirty();
    if (!saved) return;
  }
  if (previousTab === 'chat' && id !== 'chat') stopChatListener();
  if (['turni', 'myShifts'].includes(previousTab) && !['turni', 'myShifts'].includes(id)) stopShiftListeners();
  if (previousTab === 'attendance' && id !== 'attendance') stopAttendanceV2Listener();
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const page = $(id);
  if (page) {
    page.classList.add('active');
    page.style.display = 'block';
  }
  document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
  if (b) b.classList.add('active');
  try {
    const loadTasks = [];
    if (id === 'dashboard' || id === 'newday' || id === 'history' || id === 'stats' || id === 'settings') {
      loadTasks.push(ensurePrimaryLoaded());
    }
    if (id === 'newday' || id === 'employeeManagement' || (id === 'attendance' && canManageAttendance()) || (id === 'turni' && canManageShifts())) {
      loadTasks.push(ensureEmployeesLoaded());
    }
    if (id === 'settings') {
      // Fire user loading in background — tab renders immediately, table updates when ready
      void ensureUsersLoaded();
    }
    if (id === 'attendance') {
      loadTasks.push(ensureAttendanceLoaded());
    }
    if (id === 'turni' || id === 'myShifts') {
      loadTasks.push(ensureShiftsLoaded());
    }
    if (loadTasks.length) {
      await Promise.all(loadTasks);
    }
    if (id === 'chat') {
      chatListen();
    }
  } catch (e) {
    console.error(`[Tab] Errore caricamento sezione ${id}:`, e);
    notify(getErrorDetails(e, 'Errore durante il caricamento della sezione.'), 'error');
  }
  render();
  if (id === 'newday') {
    populateHoursFromAttendance($('date').value);
  }
}

// SPLIT CALCULATION
function split(r) {
  let p = state.kitchenPercent / 100;
  let c = r.cash || 0;
  let ca = r.card || 0;
  let t = r.total ?? (c + ca);
  
  let cucinaCash = c * p;
  let cucinaCard = ca * p;
  
  let salaCash = c * (1 - p);
  let salaCard = ca * (1 - p);
  
  return {
    cash: c,
    card: ca,
    total: t,
    salaCash: salaCash,
    salaCard: salaCard,
    cucinaCash: cucinaCash,
    cucinaCard: cucinaCard
  };
}

// GET FORM DATA
function data() {
  let cash = sanitizeMoneyInput($('cash').value);
  let card = sanitizeMoneyInput($('card').value);
  let h = [...document.querySelectorAll('.hour')].map(x => sanitizeHourInput(x.value));
  let th = h.reduce((a, b) => a + b, 0);
  let p = state.kitchenPercent / 100;
  let salaCash = cash * (1 - p);
  let salaCard = card * (1 - p);
  let cucinaCash = cash * p;
  let cucinaCard = card * p;
  return {
    date: $('date').value,
    uid: currentUserUid,
    cash: cash,
    card: card,
    total: cash + card,
    totalHours: th,
    hours: h,
    salaCash: salaCash,
    salaCard: salaCard,
    cucinaCash: cucinaCash,
    cucinaCard: cucinaCard
  };
}

function updateDashboardLabels() {
  const waiterView = isWaiter();
  $('dTotalLabel').textContent = waiterView ? 'Le mie mance' : 'Totale mance';
  $('dCashLabel').textContent = waiterView ? 'Il mio cash' : 'Totale Cash';
  $('dCardLabel').textContent = waiterView ? 'La mia carta' : 'Totale Carta';
  $('dDaysLabel').textContent = waiterView ? 'I miei giorni registrati' : 'Giorni registrati';
}

// RENDER ALL
function render() {
  const activeId = document.querySelector('.page.active')?.id || 'dashboard';
  updateDashboardLabels();
  if (activeId === 'dashboard') dash();
  if (activeId === 'newday') {
    hours();
    calc();
  }
  if (activeId === 'history') history();
  if (activeId === 'stats') stats();
  if (activeId === 'settings') {
    settings();
    renderUsersTable();
  }
  if (activeId === 'employeeManagement') renderEmployeesTable();
  if (activeId === 'turni' || activeId === 'myShifts') renderShifts();
  if (activeId === 'attendance') renderAttendance();
}

// RENDER HOURS TABLE
function hours() {
  const canEdit = canViewGlobalTipsData();
  // Build canonical employee map for ID lookup (matches attendance storage keys)
  const canonicalEmpMap = new Map(
    getShiftEmployees().map(e => [e.name.toLowerCase(), e.id])
  );
  let html = '<tr><th>Dipendente</th><th>Ore</th><th>Cash (€/ora)</th><th>Carta (€/ora)</th><th>Totale (€/ora)</th></tr>';
  
  state.employees.forEach((n, i) => {
    // Use canonical ID (Firestore UID if available, otherwise employee name) to match attendance keys
    const empId = esc(canonicalEmpMap.get(n.toLowerCase()) || n);
    html += `<tr data-emp-id="${empId}"><td>${esc(n)}</td><td class="hour-cell"><input class="hour" type="number" step="0.5" value="0"${canEdit ? '' : ' readonly'}></td><td class="calc-cash"></td><td class="calc-card"></td><td class="calc-total"></td></tr>`;
  });
  $('hours').innerHTML = html;
  
  document.querySelectorAll('.hour').forEach((x, i) => {
    x.oninput = () => updateHourCalculations();
  });
  
  $('cash').oninput = () => updateHourCalculations();
  $('card').oninput = () => updateHourCalculations();
}

// UPDATE HOUR CALCULATIONS
function updateHourCalculations() {
  let cash = sanitizeMoneyInput($('cash').value);
  let card = sanitizeMoneyInput($('card').value);
  let h = [...document.querySelectorAll('.hour')].map(x => sanitizeHourInput(x.value));
  let totalHours = h.reduce((a, b) => a + b, 0);
  
  let p = state.kitchenPercent / 100;
  let salaCash = cash * (1 - p);
  let salaCard = card * (1 - p);
  
  let pricePerHourCash = totalHours > 0 ? salaCash / totalHours : 0;
  let pricePerHourCard = totalHours > 0 ? salaCard / totalHours : 0;
  
  document.querySelectorAll('.hour').forEach((x, i) => {
    let hours = +x.value || 0;
    let cells = x.parentElement.parentElement.querySelectorAll('[class^="calc-"]');
    
    let empCash = pricePerHourCash * hours;
    let empCard = pricePerHourCard * hours;
    let empTotal = empCash + empCard;
    
    cells[0].textContent = euro(empCash);
    cells[1].textContent = euro(empCard);
    cells[2].textContent = euro(empTotal);
  });
  
  calc();
}

// CALCULATE AND DISPLAY
function calc() {
  let d = data();
  $('nSalaCash').textContent = euro(d.salaCash);
  $('nSalaCard').textContent = euro(d.salaCard);
  $('nCucinaCash').textContent = euro(d.cucinaCash);
  $('nCucinaCard').textContent = euro(d.cucinaCard);
}

// SAVE DAY
async function saveDay() {
  let d = data();
  try {
    validateDayPayload(d);
  } catch (e) {
    notify(e.message, 'error');
    return;
  }
  
  let existing = state.history.find(x => x.date === d.date);
  if (existing) {
    state.history.splice(state.history.indexOf(existing), 1);
  }
  state.history.unshift(d);
  
  try {
    await setDoc(doc(db, 'restaurants', 'angies', 'days', d.date), d);
    notify('Giornata salvata!', 'info');
    clear();
    render();
  } catch(e) {
    console.error('Errore salvataggio:', e);
    notify('Errore salvataggio: ' + e.message, 'error');
  }
}

// AUTO-POPULATE HOURS IN NUOVA GIORNATA FROM ATTENDANCE DATA
async function populateHoursFromAttendance(date, options = {}) {
  const { forceRefresh = false, silent = false } = options;
  if (!date || !currentUserUid || !canViewGlobalTipsData()) return;
  try {
    const rows = document.querySelectorAll('#hours tr[data-emp-id]');
    rows.forEach(row => {
      const input = row.querySelector('.hour');
      if (input) input.value = '0';
    });
    const dayAttendance = await readAttendanceDayEntries(date, { forceRefresh });
    if (!dayAttendance || typeof dayAttendance !== 'object') {
      updateHourCalculations();
      return;
    }
    rows.forEach(row => {
      const uid = row.getAttribute('data-emp-id');
      if (!uid) return;
      const entry = dayAttendance[uid];
      if (!entry) return;
      const input = row.querySelector('.hour');
      if (!input) return;
      // Support both new format (workedHours) and old format (workedMinutes)
      let workedHours = 0;
      if (entry.workedHours != null) {
        workedHours = Number(entry.workedHours);
      } else if (entry.workedMinutes != null) {
        workedHours = Math.round((Number(entry.workedMinutes) / 60) * 100) / 100;
      }
      if (workedHours > 0) {
        input.value = workedHours;
      }
    });
    updateHourCalculations();
  } catch (e) {
    console.error('[NuovaGiornata] Errore caricamento ore da attendance:', e);
    if (!silent) notify(getFriendlyRtdbMessage(e, 'Impossibile leggere le ore da entrata e uscita.'), 'error');
  }
}


function shareWhatsApp() {
  let d = data();
  try {
    validateDayPayload(d);
  } catch (e) {
    notify(e.message, 'error');
    return;
  }
  
  let message = `📊 *Riepilogo Giornata: ${fmt(d.date)}*\n\n`;
  message += `💰 *Totale Mance:* ${euro(d.total)}\n`;
  message += `💵 *Cash:* ${euro(d.cash)}\n`;
  message += `💳 *Carta:* ${euro(d.card)}\n`;
  message += `⏱️ *Ore Totali:* ${d.totalHours}\n\n`;
  
  message += `*Sala:*\n`;
  message += `  💵 Cash: ${euro(d.salaCash)}\n`;
  message += `  💳 Carta: ${euro(d.salaCard)}\n`;
  message += `  📈 Totale: ${euro(d.salaCash + d.salaCard)}\n\n`;
  
  message += `*Cucina:*\n`;
  message += `  💵 Cash: ${euro(d.cucinaCash)}\n`;
  message += `  💳 Carta: ${euro(d.cucinaCard)}\n`;
  message += `  📈 Totale: ${euro(d.cucinaCash + d.cucinaCard)}\n\n`;
  
  let pricePerHourCash = d.salaCash / d.totalHours;
  let pricePerHourCard = d.salaCard / d.totalHours;
  let employeesWorked = state.employees
    .map((name, i) => ({ name, hours: d.hours[i] || 0 }))
    .filter(e => e.hours > 0);
  
  if (employeesWorked.length) {
    message += `👥 *Dettaglio per Dipendente:*\n`;
    employeesWorked.forEach(e => {
      let empCash = pricePerHourCash * e.hours;
      let empCard = pricePerHourCard * e.hours;
      let empTotal = empCash + empCard;
      message += `  ${e.name}: 💵 ${euro(empCash)} | 💳 ${euro(empCard)} | 📊 ${euro(empTotal)}\n`;
    });
  }
  
  let whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
}

// CLEAR FORM
function clear(reset = true) {
  if (reset) $('date').value = today();
  $('cash').value = 0;
  $('card').value = 0;
  document.querySelectorAll('.hour').forEach(x => x.value = '');
  calc();
}

// SUM
function sum(rows, k) {
  return rows.reduce((s, r) => s + (split(r)[k] || 0), 0);
}

// DASHBOARD
function dash() {
  updateDashboardLabels();
  let r = state.history;
  $('dTotal').textContent = euro(sum(r, 'total'));
  $('dCash').textContent = euro(sum(r, 'cash'));
  $('dCard').textContent = euro(sum(r, 'card'));
  $('dDays').textContent = r.length;
}

// HISTORY
function history() {
  let html = '<tr><th>Data</th>';
  state.employees.forEach(n => html += `<th>${esc(n)} (€/ora)</th>`);
  html += '<th>Sala Cash</th><th>Sala Carta</th><th>Sala Tot.</th><th>Cucina Cash</th><th>Cucina Carta</th><th>Cucina Tot.</th><th>Totale</th><th>Azioni</th></tr>';
  
  state.history.forEach((r, i) => {
    html += `<tr><td>${fmt(r.date)}</td>`;
    
    let totalHours = r.hours ? r.hours.reduce((a, b) => a + b, 0) : 0;
    let salaData = split(r);
    let pricePerHourCash = totalHours > 0 ? salaData.salaCash / totalHours : 0;
    let pricePerHourCard = totalHours > 0 ? salaData.salaCard / totalHours : 0;
    
    (r.hours || []).forEach((h, j) => {
      let empTotal = (pricePerHourCash + pricePerHourCard) * h;
      html += `<td>${euro(empTotal)}</td>`;
    });
    
    html += `<td>${euro(salaData.salaCash)}</td><td>${euro(salaData.salaCard)}</td><td>${euro(salaData.salaCash + salaData.salaCard)}</td><td>${euro(salaData.cucinaCash)}</td><td>${euro(salaData.cucinaCard)}</td><td>${euro(salaData.cucinaCash + salaData.cucinaCard)}</td><td>${euro(r.total)}</td><td><button onclick="delDay(${i})">Cancella</button></td></tr>`;
  });
  $('hist').innerHTML = html;
}

// DELETE DAY
window.delDay = async i => {
  if (!confirm('Cancellare questa giornata?')) return;
  let d = state.history[i].date;
  state.history.splice(i, 1);
  try {
    await deleteDoc(doc(db, 'restaurants', 'angies', 'days', d));
    render();
  } catch(e) {
    console.error('Errore cancellazione:', e);
    notify('Errore cancellazione: ' + e.message, 'error');
  }
};

// DELETE ALL
async function deleteAll() {
  if (!confirm('Cancellare tutto lo storico?')) return;
  for (let r of state.history) {
    await deleteDoc(doc(db, 'restaurants', 'angies', 'days', r.date));
  }
  state.history = [];
  render();
}

// STATS - IMPROVED CON LISTA COMPLETA DIPENDENTI
function stats() {
  let f = $('from').value || '0000-01-01';
  let t = $('to').value || '9999-12-31';
  let rows = state.history.filter(r => r.date >= f && r.date <= t);
  
  // Totali generali
  $('sTotal').textContent = euro(sum(rows, 'total'));
  $('sCash').textContent = euro(sum(rows, 'cash'));
  $('sCard').textContent = euro(sum(rows, 'card'));
  
  // Calcola per dipendente - INIZIALIZZA TUTTI I DIPENDENTI
  let empStats = {};
  state.employees.forEach(name => {
    empStats[name] = { cash: 0, card: 0 };
  });
  
  rows.forEach(day => {
    if (!day.hours || day.hours.length === 0) return;
    
    let totalHours = day.hours.reduce((a, b) => a + b, 0);
    let salaData = split(day);
    let pricePerHourCash = totalHours > 0 ? salaData.salaCash / totalHours : 0;
    let pricePerHourCard = totalHours > 0 ? salaData.salaCard / totalHours : 0;
    
    day.hours.forEach((h, idx) => {
      if (idx < state.employees.length) {
        let empName = state.employees[idx];
        empStats[empName].cash += pricePerHourCash * h;
        empStats[empName].card += pricePerHourCard * h;
      }
    });
  });
  
  // Render tabella dipendenti - MOSTRA TUTTI ANCHE SE ZERO
  let empHtml = '<tr><th>Dipendente</th><th>💵 Cash</th><th>💳 Carta</th><th>📊 Totale</th></tr>';
  state.employees.forEach(name => {
    let stats = empStats[name] || { cash: 0, card: 0 };
    let total = stats.cash + stats.card;
    empHtml += `<tr><td class="emp-name">${esc(name)}</td><td class="emp-cash">${euro(stats.cash)}</td><td class="emp-card">${euro(stats.card)}</td><td class="emp-total">${euro(total)}</td></tr>`;
  });
  $('empStats').innerHTML = empHtml;
}

// SETTINGS
function settings() {
  $('kitchen').value = state.kitchenPercent;
  $('emps').innerHTML = '<tr><th>N.</th><th>Nome</th></tr>' + 
    state.employees.map((n, i) => `<tr><td>${i + 1}</td><td><input class="emp" value="${esc(n)}"></td></tr>`).join('');
}

// SAVE SETTINGS
async function saveSettings() {
  state.kitchenPercent = +$('kitchen').value || 20;
  state.employees = [...document.querySelectorAll('.emp')].map(x => x.value.trim()).filter(Boolean);
  try {
    await setDoc(doc(db, 'restaurants', 'angies', 'settings', 'main'), state);
    notify('Impostazioni salvate!', 'info');
    render();
  } catch(e) {
    console.error('Errore: ', e);
    notify('Errore: ' + e.message, 'error');
  }
}

// CHAT LISTEN
function chatListen() {
  if (unsub) unsub();
  chatRenderedMessageIds = new Set();
  let q = query(collection(db, 'restaurants', 'angies', 'chat'), orderBy('createdAt', 'asc'));
  unsub = onSnapshot(q, snap => {
    let box = $('chatBox');
    if (!box) return;
    const changedExistingMessages = snap.docChanges().some(change => change.type !== 'added');
    if (changedExistingMessages) {
      box.textContent = '';
      chatRenderedMessageIds = new Set();
      snap.forEach(d => {
        if (chatRenderedMessageIds.has(d.id)) return;
        let msg = d.data();
        const msgNode = document.createElement('div');
        msgNode.className = 'msg';
        const strong = document.createElement('strong');
        strong.textContent = String(msg.name || '');
        msgNode.appendChild(strong);
        msgNode.append(': ' + String(msg.text || ''));
        box.appendChild(msgNode);
        chatRenderedMessageIds.add(d.id);
      });
      box.scrollTop = box.scrollHeight;
      return;
    }
    snap.docChanges().forEach(change => {
      if (change.type !== 'added' || chatRenderedMessageIds.has(change.doc.id)) return;
      let msg = change.doc.data();
      const msgNode = document.createElement('div');
      msgNode.className = 'msg';
      const strong = document.createElement('strong');
      strong.textContent = String(msg.name || '');
      msgNode.appendChild(strong);
      msgNode.append(': ' + String(msg.text || ''));
      box.appendChild(msgNode);
      chatRenderedMessageIds.add(change.doc.id);
    });
    box.scrollTop = box.scrollHeight;
  }, err => {
    console.error('Errore chat listener:', err);
  });
}

function stopChatListener() {
  if (unsub) {
    unsub();
    unsub = null;
  }
  chatRenderedMessageIds = new Set();
}

// SEND MESSAGE
async function sendMsg() {
  let text = $('msg').value.trim();
  if (!text) return;
  if (!currentUser) { notify('Effettua il login', 'error'); return; }
  try {
    await addDoc(collection(db, 'restaurants', 'angies', 'chat'), {
      text: text,
      name: currentUser,
      createdAt: serverTimestamp()
    });
    $('msg').value = '';
  } catch(e) {
    console.error('Errore invio messaggio:', e);
    notify('Errore: ' + e.message, 'error');
  }
}

// EXPORT CSV
function exportCSV() {
  let h = ['Data'];
  state.employees.forEach(n => h.push(`${n} (€/ora)`));
  h.push('Sala Cash', 'Sala Carta', 'Sala Totale', 'Cucina Cash', 'Cucina Carta', 'Cucina Totale', 'Totale');
  
  let rows = [h];
  state.history.forEach(r => {
    let salaData = split(r);
    let row = [fmt(r.date)];
    
    let totalHours = r.hours ? r.hours.reduce((a, b) => a + b, 0) : 0;
    let pricePerHourCash = totalHours > 0 ? salaData.salaCash / totalHours : 0;
    let pricePerHourCard = totalHours > 0 ? salaData.salaCard / totalHours : 0;
    
    (r.hours || []).forEach(h => {
      row.push(num((pricePerHourCash + pricePerHourCard) * h));
    });
    
    row.push(
      num(salaData.salaCash),
      num(salaData.salaCard),
      num(salaData.salaCash + salaData.salaCard),
      num(salaData.cucinaCash),
      num(salaData.cucinaCard),
      num(salaData.cucinaCash + salaData.cucinaCard),
      num(r.total)
    );
    rows.push(row);
  });
  
  let csv = rows.map(r => r.join(',')).join('\n');
  let a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'angie-' + today() + '.csv';
  a.click();
}

// FORMAT NUMBER
function num(n) {
  return (+(n || 0)).toFixed(2).replace('.', ',');
}

// FORMAT DATE
function fmt(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT');
}

// START APP
window.addEventListener('load', async () => {
  init();
  clearEmployeeForm();
  showBootLoading('Caricamento...');
  onAuthStateChanged(auth, async user => {
    try {
      ensureFirebaseServicesReady();
      if (user) {
        let loadedProfile;
        try {
          loadedProfile = await withTimeout(loadCurrentUserProfile(user), PROFILE_LOAD_TIMEOUT_MS, 'Caricamento profilo');
        } catch (profileErr) {
          if (isBootstrapAdminEmail(user.email)) {
            console.warn('[Auth] Timeout/errore caricamento profilo per admin bootstrap — profilo locale attivato:', profileErr.message);
            currentUser = user.email || '';
            currentUserUid = user.uid || '';
            currentUserName = deriveNameFromEmail(user.email);
            currentUserRole = 'admin';
            setStatus('loginStatus', 'Database non raggiungibile — profilo admin locale attivato.', 'info');
            loadedProfile = true;
            ensureBootstrapAdminProfile(user, { name: currentUserName, email: currentUser }).catch(syncErr => {
              console.warn('[Auth] Sincronizzazione profilo admin in background non riuscita:', syncErr.message);
            });
          } else {
            throw profileErr;
          }
        }
        if (!loadedProfile) {
          resetSectionLoadedState();
          hasLoadedSessionData = false;
          localStorage.removeItem(SESSION_KEY);
          currentUser = '';
          currentUserName = '';
          currentUserUid = '';
          currentUserRole = '';
          employeesData = [];
          shiftsData = [];
          attendanceWeekOffset = 0;
          attendanceWeekEntries = {};
          contractHoursData = {};
          stopShiftListeners();
          stopChatListener();
          stopAttendanceV2Listener();
          $('who').textContent = 'Online';
          clearEmployeeForm();
          clearShiftEditor();
          syncEmployeeTabVisibility();
          syncShiftTabVisibility();
          syncSettingsTabVisibility();
          syncHistoryStatsVisibility();
          render();
          showLogin();
          return;
        }
        localStorage.setItem(SESSION_KEY, currentUser);
        $('who').textContent = `${currentUser} (${currentUserRole})`;
        $('loginPass').value = '';
        todayShiftPopupShown = false;
        syncEmployeeTabVisibility();
        syncShiftTabVisibility();
        syncSettingsTabVisibility();
        syncHistoryStatsVisibility();
        showApp();
        render();
        void tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
        scheduleBackgroundTask(() => {
          void prefetchSessionData();
        });
        void writeLog('login');
        setStatus('loginStatus', '', 'info');
      } else {
        resetSectionLoadedState();
        hasLoadedSessionData = false;
        localStorage.removeItem(SESSION_KEY);
        currentUser = '';
        currentUserName = '';
        currentUserUid = '';
        currentUserRole = '';
        todayShiftPopupShown = false;
        weekOffset = 0;
        employeesData = [];
        shiftsData = [];
        attendanceWeekOffset = 0;
        attendanceWeekEntries = {};
        contractHoursData = {};
        $('who').textContent = 'Online';
        stopChatListener();
        stopShiftListeners();
        stopAttendanceV2Listener();
        clearEmployeeForm();
        clearShiftEditor();
        syncEmployeeTabVisibility();
        syncShiftTabVisibility();
        syncSettingsTabVisibility();
        syncHistoryStatsVisibility();
        render();
        showLogin();
      }
    } catch (e) {
      console.error('[Auth] Errore durante completamento login:', e);
      const detail = getErrorDetails(e, 'Errore imprevisto durante il login.');
      setStatus('loginStatus', `Login fallito: ${detail}`, 'error');
      showLogin();
      resetSectionLoadedState();
      hasLoadedSessionData = false;
      localStorage.removeItem(SESSION_KEY);
    }
  });
});
