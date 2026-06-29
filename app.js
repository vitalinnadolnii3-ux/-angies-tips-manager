import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { ref as rtdbRef, get as rtdbGet, set as rtdbSet, update as rtdbUpdate, remove as rtdbRemove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig, getAuth, getDatabase } from "./firebase-config.js?v=13";

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const functions = getFunctions(fbApp);
const rtdb = getDatabase(fbApp);

const NAMES = ["Diego","Sunkar","Silvano","Giuseppe","Vitalin","Davide","Zara","Lisa","Anna","Niko","Raffa","Alex","Mariia Sevastianova"];
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
let attendanceDate = '';
let attendanceDayEntries = {};
let attendanceWeekEntries = {};
let attendanceShiftData = [];
const SESSION_KEY = 'angiesManagerUser';
const EMPLOYEE_ROLES = ['Admin', 'Manager', 'Responsible', 'Waiter', 'Kitchen'];
const RESTAURANT_ROLES = ['Direttore', 'Manager', 'Responsabile', 'Cameriere', 'Runner', 'Bartender'];
const APP_ROLES = ['Admin', 'Manager', 'Responsabile', 'Waiter'];
const WEEK_DAYS_IT = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const SHIFT_TYPES = ['morning', 'evening', 'long', 'split', 'rest'];
const LONG_SHIFT_MIN_HOURS = 7.5;
const MINUTES_PER_DAY = 24 * 60;
const PROFILE_LOAD_TIMEOUT_MS = 30000;
const PRIMARY_LOAD_TIMEOUT_MS = 30000;
const SECONDARY_LOAD_TIMEOUT_MS = 25000;
const PROFILE_LOAD_MAX_ATTEMPTS = 2;
const ROLE_STORAGE_VALUES = ['admin', 'manager', 'responsible', 'waiter', 'kitchen'];
const MAX_TIP_AMOUNT = 100000;
const BOOTSTRAP_ADMIN_EMAILS = ['vitalinnadolnii3@gmail.com'];
const BOOTSTRAP_ADMIN_DEFAULT_NAMES = { 'vitalinnadolnii3@gmail.com': 'Vitalin' };

const $ = id => document.getElementById(id);
const euro = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(+n || 0);
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
const canManageAttendance = () => isAdmin() || isManager();
const canViewAllAttendance = () => canManageAttendance();
const canManageUsers = () => isAdmin();
const canViewAllData = () => isAdmin() || isManager();
const canViewUserData = (targetUid) => isAdmin() || isManager() || targetUid === currentUserUid;

function getErrorDetails(error, fallback = 'Errore sconosciuto') {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').trim() || fallback;
  return code ? `${message} (${code})` : message;
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
  if (Array.isArray(employeesData) && employeesData.length > 0) {
    return employeesData
      .filter(emp => emp.enabled !== false)
      .map(emp => ({ id: emp.id, name: normalizeName(emp.name) || normalizeEmail(emp.email) || emp.id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  }
  const map = new Map();
  shiftsData.forEach(shift => {
    if (!shift?.uid) return;
    const label = normalizeName(shift.employeeName) || normalizeName(shift.uid);
    map.set(shift.uid, { id: shift.uid, name: label || shift.uid });
  });
  const employees = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  if (employees.length) return employees;
  return currentUserUid ? [{ id: currentUserUid, name: currentUserName || deriveNameFromEmail(currentUser) || currentUser }] : [];
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
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('loginEmail').focus();
}

function showApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
}

function syncEmployeeTabVisibility() {
  const tabBtn = $('employeeTabBtn');
  if (!tabBtn) return;
  tabBtn.classList.toggle('hidden', !isAdmin());
  if (!isAdmin() && $('employeeManagement').classList.contains('active')) {
    tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
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
    turniTabBtn.classList.remove('hidden');
  }
  if (myShiftsTabBtn) {
    myShiftsTabBtn.classList.toggle('hidden', canManageShifts());
  }
  const newShiftBtn = $('newShiftBtn');
  if (newShiftBtn) {
    newShiftBtn.classList.toggle('hidden', !canManageShifts());
  }
  if (canManageShifts() && $('myShifts').classList.contains('active')) {
    tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
  }
}

function syncSettingsTabVisibility() {
  const settingsTabBtn = $('settingsTabBtn');
  if (!settingsTabBtn) return;
  settingsTabBtn.classList.toggle('hidden', !isAdmin());
  if (!isAdmin() && $('settings').classList.contains('active')) {
    tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
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
  attendanceDate = today();
  attendanceDayEntries = {};
  attendanceWeekEntries = {};
  attendanceShiftData = [];
  $('who').textContent = 'Online';
  if (unsub) {
    unsub();
    unsub = null;
  }
  if (shiftsUnsub) {
    shiftsUnsub();
    shiftsUnsub = null;
  }
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
    employeesData = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name), 'it', { sensitivity: 'base' }));
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

async function loadUsersForAdmin() {
  if (!isAdmin()) {
    usersData = [];
    renderUsersTable();
    return;
  }
  try {
    // Prefer Realtime Database as primary RBAC source
    const rtdbSnap = await rtdbGet(rtdbUsers());
    if (rtdbSnap.exists()) {
      const rtdbVal = rtdbSnap.val();
      usersData = Object.entries(rtdbVal)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => normalizeName(a.name || a.email || '').localeCompare(normalizeName(b.name || b.email || ''), 'it', { sensitivity: 'base' }));
      renderUsersTable();
      return;
    }
    // Fall back to Firestore /users/ collection
    const snap = await getDocs(usersCollection());
    usersData = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => normalizeName(a.name || a.email || '').localeCompare(normalizeName(b.name || b.email || ''), 'it', { sensitivity: 'base' }));
    renderUsersTable();
  } catch (e) {
    console.error('Errore caricamento utenti:', e);
  }
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
  if (!employeesData.length) {
    html += '<tr><td colspan="7">Nessun dipendente registrato.</td></tr>';
    table.innerHTML = html;
    return;
  }
  employeesData.forEach(emp => {
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

  const [employeeSnap, userSnap] = await Promise.all([
    getDocs(query(employeeCollection(), where('email', '==', email))),
    getDocs(query(usersCollection(), where('email', '==', email)))
  ]);
  const emailExistsInEmployees = employeeSnap.docs.some(d => d.id !== ignoreId);
  const emailExistsInUsers = userSnap.docs.some(d => d.id !== ignoreId);
  return !emailExistsInEmployees && !emailExistsInUsers;
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
    await writeLog(`employee_create:${data.normalizedEmail}:${data.normalizedAppRole}`);
    clearEmployeeForm();
    await loadEmployees();
    try {
      await sendPasswordResetEmail(auth, data.normalizedEmail);
      notify(`Dipendente creato. Email di attivazione/reset inviata a ${data.normalizedEmail}.`, 'info');
    } catch (resetErr) {
      console.warn('Dipendente creato ma invio email reset non riuscito:', resetErr);
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
    await writeLog(`employee_update:${employee.id}`);
    closeEmployeeModal();
    await loadEmployees();
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
    await writeLog(`employee_delete:${employee.id}`);
    closeEmployeeModal();
    await loadEmployees();
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

  try {
    await sendPasswordResetEmail(auth, email);
    await writeLog(`employee_password_reset:${employee.id}:email`);
    notify(`Email di reset inviata a ${email}.`, 'info');
  } catch (e) {
    console.error('Errore invio email reset password:', e);
    notify('Impossibile reimpostare la password: ' + getErrorDetails(e), 'error');
  }
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
    await writeLog(`employee_${nextActive ? 'enable' : 'disable'}:${employee.id}`);
    await loadEmployees();
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
    await writeLog(`employee_delete:${employee.id}`);
    if (editingEmployeeId === employee.id) closeEmployeeModal();
    await loadEmployees();
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
    await writeLog(`user_role_update:${uid}:${role}`);
    await loadUsersForAdmin();
  } catch (e) {
    console.error('Errore aggiornamento ruolo utente:', e);
    notify('Errore aggiornamento ruolo: ' + e.message, 'error');
    await loadUsersForAdmin();
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
    await writeLog(`user_${nextActive ? 'enable' : 'disable'}:${uid}`);
    await loadUsersForAdmin();
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

  // Fire all 3 reads in parallel for faster profile loading
  console.log('[Profilo] Avvio lettura parallela da RTDB, Firestore /users/, Firestore /employees/…');
  const [rtdbResult, usersResult, employeesResult] = await Promise.allSettled([
    withRetry(() => rtdbGet(rtdbUser(user.uid)), PROFILE_LOAD_MAX_ATTEMPTS, 'RTDB users/' + currentUserUid),
    withRetry(() => getDoc(userDoc(user.uid)), PROFILE_LOAD_MAX_ATTEMPTS, 'Firestore /users/' + currentUserUid),
    withRetry(() => getDoc(employeeDoc(user.uid)), PROFILE_LOAD_MAX_ATTEMPTS, 'Firestore /employees/' + currentUserUid)
  ]);

  // 1. Try Realtime Database users/{uid} (primary RBAC source)
  let rtdbProfile = null;
  if (rtdbResult.status === 'fulfilled') {
    const rtdbSnap = rtdbResult.value;
    if (rtdbSnap.exists()) {
      rtdbProfile = rtdbSnap.val();
      console.log('[Profilo] Profilo RTDB trovato:', rtdbProfile);
    } else {
      console.log('[Profilo] Profilo RTDB non trovato — provo Firestore.');
    }
  } else {
    console.warn('[Profilo] Lettura RTDB non riuscita (non bloccante):', rtdbResult.reason?.code, rtdbResult.reason?.message);
    setStatus('loginStatus', 'Avviso RTDB: ' + getErrorDetails(rtdbResult.reason) + ' — uso profilo alternativo.', 'info');
  }

  if (rtdbProfile !== null) {
    const bootstrapProfile = {
      name: normalizeName(rtdbProfile.name) || currentUserName,
      email: currentUser
    };
    if (bootstrapAdmin) {
      const syncedProfile = await ensureBootstrapAdminProfile(user, bootstrapProfile);
      currentUserName = syncedProfile.name;
      currentUserRole = 'admin';
      console.log('[Profilo] Accesso admin bootstrap riuscito da RTDB.');
      return true;
    }
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
  }

  // 2. Try Firestore /users/ collection
  if (usersResult.status === 'fulfilled') {
    const userSnap = usersResult.value;
    if (userSnap.exists()) {
      const profile = userSnap.data();
      console.log('[Profilo] Profilo Firestore /users/ trovato:', profile);
      if (bootstrapAdmin) {
        const syncedProfile = await ensureBootstrapAdminProfile(user, profile);
        currentUserName = syncedProfile.name;
        currentUserRole = 'admin';
        console.log('[Profilo] Accesso admin bootstrap riuscito da Firestore /users/.');
        return true;
      }
      const active = profile.active !== false;
      if (!active) {
        setStatus('loginStatus', 'Account disattivato. Contatta un amministratore.', 'error');
        await signOut(auth);
        return false;
      }
      currentUserName = normalizeName(profile.name) || currentUserName;
      currentUserRole = profile.role || 'waiter';
      // Try to migrate to RTDB for future logins
      try {
        await writeUserToRTDB(user.uid, profile);
        console.log('[Profilo] Migrazione a RTDB riuscita.');
      } catch (e) {
        console.warn('[Profilo] Migrazione RTDB non riuscita (non bloccante):', e.message);
      }
      console.log('[Profilo] Login da Firestore /users/ riuscito. Ruolo:', currentUserRole);
      return true;
    }
    console.log('[Profilo] Profilo Firestore /users/ non trovato — provo /employees/.');
  } else {
    console.warn('[Profilo] Lettura Firestore /users/ non riuscita (non bloccante):', usersResult.reason?.code, usersResult.reason?.message);
  }

  // 3. Try Firestore /employees/ collection
  if (employeesResult.status === 'fulfilled') {
    const profileSnap = employeesResult.value;
    if (profileSnap.exists()) {
      const profile = profileSnap.data();
      console.log('[Profilo] Profilo Firestore /employees/ trovato:', profile);
      if (bootstrapAdmin) {
        const syncedProfile = await ensureBootstrapAdminProfile(user, profile);
        currentUserName = syncedProfile.name;
        currentUserRole = 'admin';
        console.log('[Profilo] Accesso admin bootstrap riuscito da Firestore /employees/.');
        return true;
      }
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
      try {
        await writeUserToRTDB(user.uid, {
          name: currentUserName,
          email: currentUser,
          role: resolvedRole,
          active: enabled
        });
      } catch (rtErr) {
        console.warn('[Profilo] Creazione users/{uid} su RTDB non riuscita (non bloccante):', getErrorDetails(rtErr));
      }
      try {
        await setDoc(userDoc(user.uid), {
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
        }, { merge: true });
      } catch (fsErr) {
        console.warn('[Profilo] Creazione profilo Firestore /users non riuscita (non bloccante):', getErrorDetails(fsErr));
      }
      console.log('[Profilo] Login da Firestore /employees/ riuscito. Ruolo:', currentUserRole);
      return true;
    }
    console.log('[Profilo] Profilo Firestore /employees/ non trovato — creo profilo automatico.');
  } else {
    console.warn('[Profilo] Lettura Firestore /employees/ non riuscita (non bloccante):', employeesResult.reason?.code, employeesResult.reason?.message);
  }

  // 4. Access denied: only pre-registered users can enter
  console.warn('[Profilo] Nessun profilo trovato per uid/email:', user.uid, currentUser);
  setStatus('loginStatus', 'Accesso negato: email non autorizzata. Contatta un amministratore.', 'error');
  await signOut(auth);
  return false;
}

function shiftMapByKey() {
  const map = new Map();
  shiftsData.forEach(shift => {
    const key = `${shift.uid}__${shift.date}`;
    map.set(key, shift);
  });
  return map;
}

function attendancePath(dateStr, uid = '') {
  return uid ? `attendance/${dateStr}/${uid}` : `attendance/${dateStr}`;
}

function getAttendanceEmployees() {
  if (!currentUserUid) return [];
  if (canViewAllAttendance()) return getShiftEmployees();
  const ownEmployee = getShiftEmployees().find(employee => employee.id === currentUserUid);
  if (ownEmployee) return [ownEmployee];
  return [{ id: currentUserUid, name: currentUserName || deriveNameFromEmail(currentUser) || currentUserUid }];
}

function getAttendanceEntryFor(dateStr, uid) {
  return attendanceWeekEntries?.[dateStr]?.[uid] || null;
}

function setAttendanceEntryFor(dateStr, uid, entry) {
  if (!dateStr || !uid) return;
  if (!attendanceWeekEntries[dateStr] || typeof attendanceWeekEntries[dateStr] !== 'object') {
    attendanceWeekEntries[dateStr] = {};
  }
  if (entry) {
    attendanceWeekEntries[dateStr][uid] = entry;
  } else {
    delete attendanceWeekEntries[dateStr][uid];
  }
  attendanceDayEntries = attendanceWeekEntries[attendanceDate] || {};
}

function getAttendanceShiftFor(uid, dateStr) {
  return attendanceShiftData.find(shift => shift.uid === uid && shift.date === dateStr) || null;
}

function getAttendanceShiftWindow(shift) {
  if (!shift || shift.isRestDay) {
    return {
      shiftText: shift?.isRestDay ? 'Riposo' : 'Nessun turno programmato',
      startMinutes: null,
      endMinutes: null
    };
  }
  const shiftText = getShiftDisplayText(shift) || 'Turno programmato';
  const { startToken, endToken } = extractStartEndFromText(shiftText);
  const startMinutes = parseTimeToMinutes(shift.startTime || startToken);
  let endMinutes = parseTimeToMinutes(shift.endTime || endToken);
  if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) endMinutes += MINUTES_PER_DAY;
  return { shiftText, startMinutes, endMinutes };
}

function getAttendanceComparison(uid, dateStr, entryTime, exitTime) {
  const shift = getAttendanceShiftFor(uid, dateStr);
  if (!shift) {
    return {
      scheduledText: 'Nessun turno programmato',
      text: 'Nessun turno programmato',
      status: 'neutral',
      delayMinutes: 0,
      earlyLeaveMinutes: 0
    };
  }
  if (shift.isRestDay) {
    return {
      scheduledText: 'Riposo',
      text: 'Riposo programmato',
      status: 'neutral',
      delayMinutes: 0,
      earlyLeaveMinutes: 0
    };
  }
  const schedule = getAttendanceShiftWindow(shift);
  const entryMinutes = parseTimeToMinutes(entryTime);
  const exitMinutesRaw = parseTimeToMinutes(exitTime);
  let delayMinutes = 0;
  let earlyLeaveMinutes = 0;
  const notes = [];
  if (entryMinutes !== null && schedule.startMinutes !== null && entryMinutes > schedule.startMinutes) {
    delayMinutes = entryMinutes - schedule.startMinutes;
    notes.push(`Ritardo ${formatMinutesShort(delayMinutes)}`);
  }
  if (exitMinutesRaw !== null && schedule.endMinutes !== null) {
    let exitMinutes = exitMinutesRaw;
    if (schedule.endMinutes >= MINUTES_PER_DAY && schedule.startMinutes !== null && exitMinutes < schedule.startMinutes) {
      exitMinutes += MINUTES_PER_DAY;
    }
    if (exitMinutes < schedule.endMinutes) {
      earlyLeaveMinutes = schedule.endMinutes - exitMinutes;
      notes.push(`Uscita anticipata ${formatMinutesShort(earlyLeaveMinutes)}`);
    }
  }
  if (!notes.length) {
    const hasActualData = entryMinutes !== null || exitMinutesRaw !== null;
    return {
      scheduledText: schedule.shiftText,
      text: hasActualData ? 'In linea con il turno' : 'Nessun dato inserito',
      status: hasActualData ? 'ok' : 'neutral',
      delayMinutes,
      earlyLeaveMinutes
    };
  }
  return {
    scheduledText: schedule.shiftText,
    text: notes.join(' • '),
    status: 'alert',
    delayMinutes,
    earlyLeaveMinutes
  };
}

function setAttendanceDateValue(dateStr) {
  attendanceDate = dateStr || today();
  if ($('attendanceDate')) $('attendanceDate').value = attendanceDate;
  const weekDates = getWeekDatesForDate(attendanceDate);
  if ($('attendanceWeekLabel')) $('attendanceWeekLabel').textContent = `${fmt(weekDates[0].date)} - ${fmt(weekDates[6].date)}`;
  if ($('attendanceActions')) $('attendanceActions').classList.toggle('hidden', !canManageAttendance());
}

function isAttendanceEntryEmpty(values) {
  const entryTime = String(values?.entryTime || '').trim();
  const exitTime = String(values?.exitTime || '').trim();
  const pauseMinutes = normalizePauseMinutes(values?.pauseMinutes);
  const notes = String(values?.notes || '').trim();
  return !entryTime && !exitTime && pauseMinutes === 0 && !notes;
}

function readAttendanceRowValues(row) {
  if (!row) return { entryTime: '', exitTime: '', pauseMinutes: 0, notes: '' };
  return {
    entryTime: row.querySelector('[data-att-field="entryTime"]')?.value || '',
    exitTime: row.querySelector('[data-att-field="exitTime"]')?.value || '',
    pauseMinutes: row.querySelector('[data-att-field="pauseMinutes"]')?.value || 0,
    notes: row.querySelector('[data-att-field="notes"]')?.value || ''
  };
}

function updateAttendanceRow(row) {
  if (!row) return;
  const uid = row.getAttribute('data-attendance-uid') || '';
  const values = readAttendanceRowValues(row);
  const pauseMinutes = normalizePauseMinutes(values.pauseMinutes);
  const workedMinutes = calculateWorkedMinutes(values.entryTime, values.exitTime, pauseMinutes);
  const comparison = getAttendanceComparison(uid, attendanceDate, values.entryTime, values.exitTime);
  const employee = getAttendanceEmployees().find(item => item.id === uid);
  if (isAttendanceEntryEmpty({ ...values, pauseMinutes })) {
    setAttendanceEntryFor(attendanceDate, uid, null);
  } else {
    setAttendanceEntryFor(attendanceDate, uid, {
      ...(getAttendanceEntryFor(attendanceDate, uid) || {}),
      uid,
      employeeName: employee?.name || '',
      date: attendanceDate,
      entryTime: String(values.entryTime || '').trim(),
      exitTime: String(values.exitTime || '').trim(),
      pauseMinutes,
      notes: String(values.notes || '').trim(),
      workedMinutes,
      scheduledShiftText: comparison.scheduledText,
      delayMinutes: comparison.delayMinutes,
      earlyLeaveMinutes: comparison.earlyLeaveMinutes
    });
  }
  const workedCell = row.querySelector('.attendance-worked-cell');
  const scheduledCell = row.querySelector('.attendance-scheduled-cell');
  const comparisonCell = row.querySelector('.attendance-comparison-cell');
  if (workedCell) workedCell.textContent = formatWorkedHours(workedMinutes);
  if (scheduledCell) scheduledCell.textContent = comparison.scheduledText;
  if (comparisonCell) {
    comparisonCell.textContent = comparison.text;
    comparisonCell.classList.toggle('attendance-comparison-alert', comparison.status === 'alert');
  }
  row.classList.toggle('attendance-row-alert', comparison.status === 'alert');
}

function renderAttendanceTable() {
  const table = $('attendanceTable');
  if (!table) return;
  const employees = getAttendanceEmployees();
  const canEdit = canManageAttendance();
  let html = '<tr><th scope="col">Dipendente</th><th scope="col">Turno programmato</th><th scope="col">Entrata</th><th scope="col">Uscita</th><th scope="col">Pausa (min)</th><th scope="col">Note</th><th scope="col">Ore reali</th><th scope="col">Confronto</th></tr>';
  if (!employees.length) {
    table.innerHTML = `${html}<tr><td colspan="8">Nessun dipendente disponibile.</td></tr>`;
    return;
  }
  employees.forEach(employee => {
    const entry = getAttendanceEntryFor(attendanceDate, employee.id) || {};
    const entryTime = String(entry.entryTime || '').trim();
    const exitTime = String(entry.exitTime || '').trim();
    const pauseMinutes = entry.pauseMinutes ?? '';
    const notes = String(entry.notes || '').trim();
    const workedMinutes = calculateWorkedMinutes(entryTime, exitTime, pauseMinutes);
    const comparison = getAttendanceComparison(employee.id, attendanceDate, entryTime, exitTime);
    const rowClass = comparison.status === 'alert' ? 'attendance-row attendance-row-alert' : 'attendance-row';
    html += `<tr class="${rowClass}" data-attendance-uid="${esc(employee.id)}">
      <td class="attendance-employee-cell">${esc(employee.name)}</td>
      <td class="attendance-scheduled-cell">${esc(comparison.scheduledText)}</td>
      <td>${canEdit ? `<input data-att-field="entryTime" type="time" value="${esc(entryTime)}">` : esc(entryTime || '-')}</td>
      <td>${canEdit ? `<input data-att-field="exitTime" type="time" value="${esc(exitTime)}">` : esc(exitTime || '-')}</td>
      <td>${canEdit ? `<input data-att-field="pauseMinutes" type="number" min="0" step="1" value="${esc(pauseMinutes)}">` : esc(pauseMinutes === '' ? '-' : pauseMinutes)}</td>
      <td>${canEdit ? `<input data-att-field="notes" type="text" value="${esc(notes)}" placeholder="Note">` : esc(notes || '-')}</td>
      <td class="attendance-worked-cell">${esc(formatWorkedHours(workedMinutes))}</td>
      <td class="attendance-comparison-cell${comparison.status === 'alert' ? ' attendance-comparison-alert' : ''}">${esc(comparison.text)}</td>
    </tr>`;
  });
  table.innerHTML = html;
}

function renderAttendanceWeeklyTable() {
  const table = $('attendanceWeeklyTable');
  if (!table) return;
  const employees = getAttendanceEmployees();
  const weekDates = getWeekDatesForDate(attendanceDate || today());
  let html = '<tr><th scope="col">Dipendente</th><th scope="col">Giorni registrati</th><th scope="col">Ore totali</th><th scope="col">Ritardi</th><th scope="col">Uscite anticipate</th></tr>';
  if (!employees.length) {
    table.innerHTML = `${html}<tr><td colspan="5">Nessun dipendente disponibile.</td></tr>`;
    return;
  }
  employees.forEach(employee => {
    let recordedDays = 0;
    let totalWorkedMinutes = 0;
    let delayCount = 0;
    let delayMinutes = 0;
    let earlyCount = 0;
    let earlyMinutes = 0;
    weekDates.forEach(day => {
      const entry = getAttendanceEntryFor(day.date, employee.id);
      if (!entry || isAttendanceEntryEmpty(entry)) return;
      recordedDays += 1;
      const workedMinutes = calculateWorkedMinutes(entry.entryTime, entry.exitTime, entry.pauseMinutes);
      if (workedMinutes !== null) totalWorkedMinutes += workedMinutes;
      const comparison = getAttendanceComparison(employee.id, day.date, entry.entryTime, entry.exitTime);
      if (comparison.delayMinutes > 0) {
        delayCount += 1;
        delayMinutes += comparison.delayMinutes;
      }
      if (comparison.earlyLeaveMinutes > 0) {
        earlyCount += 1;
        earlyMinutes += comparison.earlyLeaveMinutes;
      }
    });
    html += `<tr>
      <td class="attendance-employee-cell">${esc(employee.name)}</td>
      <td>${recordedDays}</td>
      <td>${esc(formatWorkedHours(totalWorkedMinutes))}</td>
      <td>${delayCount ? `${delayCount} (${esc(formatMinutesShort(delayMinutes))})` : '-'}</td>
      <td>${earlyCount ? `${earlyCount} (${esc(formatMinutesShort(earlyMinutes))})` : '-'}</td>
    </tr>`;
  });
  table.innerHTML = html;
}

function renderAttendance() {
  setAttendanceDateValue(attendanceDate || today());
  renderAttendanceTable();
  renderAttendanceWeeklyTable();
}

async function loadAttendanceData() {
  if (!currentUserUid) {
    attendanceDayEntries = {};
    attendanceWeekEntries = {};
    attendanceShiftData = [];
    setAttendanceStatus('');
    renderAttendance();
    return;
  }
  const selectedDate = attendanceDate || today();
  setAttendanceDateValue(selectedDate);
  setAttendanceStatus('Caricamento entrate e uscite...', 'info');
  const weekDates = getWeekDatesForDate(selectedDate);
  try {
    const attendanceReads = weekDates.map(day => {
      const path = canViewAllAttendance() ? attendancePath(day.date) : attendancePath(day.date, currentUserUid);
      return rtdbGet(rtdbRef(rtdb, path)).then(snapshot => ({ date: day.date, value: snapshot.val() }));
    });
    const shiftsQuery = query(
      shiftCollection(),
      where('date', '>=', weekDates[0].date),
      where('date', '<=', weekDates[6].date),
      orderBy('date', 'asc')
    );
    const [attendanceValues, shiftSnapshot] = await Promise.all([
      Promise.all(attendanceReads),
      getDocs(shiftsQuery)
    ]);
    attendanceWeekEntries = {};
    attendanceValues.forEach(({ date, value }) => {
      if (canViewAllAttendance()) {
        attendanceWeekEntries[date] = value && typeof value === 'object' ? value : {};
      } else {
        attendanceWeekEntries[date] = value ? { [currentUserUid]: value } : {};
      }
    });
    attendanceDayEntries = attendanceWeekEntries[selectedDate] || {};
    attendanceShiftData = shiftSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setAttendanceStatus(canManageAttendance() ? '' : 'Visualizzi solo la tua entrata e uscita.', 'info');
    renderAttendance();
  } catch (e) {
    console.error('Errore caricamento entrate e uscite:', e);
    attendanceDayEntries = {};
    attendanceWeekEntries = {};
    attendanceShiftData = [];
    setAttendanceStatus('Impossibile caricare entrata e uscita.', 'error');
    renderAttendance();
  }
}

async function saveAttendance() {
  if (!canManageAttendance()) { setAttendanceStatus('Solo admin e manager possono modificare entrata e uscita.', 'error'); return; }
  if (!attendanceDate) { setAttendanceStatus('Seleziona una data.', 'error'); return; }
  const rows = [...document.querySelectorAll('#attendanceTable tr[data-attendance-uid]')];
  if (!rows.length) return;
  try {
    await Promise.all(rows.map(async row => {
      const uid = row.getAttribute('data-attendance-uid') || '';
      const values = readAttendanceRowValues(row);
      const pauseMinutes = normalizePauseMinutes(values.pauseMinutes);
      if (isAttendanceEntryEmpty({ ...values, pauseMinutes })) {
        await rtdbSet(rtdbRef(rtdb, attendancePath(attendanceDate, uid)), null);
        return;
      }
      const workedMinutes = calculateWorkedMinutes(values.entryTime, values.exitTime, pauseMinutes);
      const comparison = getAttendanceComparison(uid, attendanceDate, values.entryTime, values.exitTime);
      const employee = getAttendanceEmployees().find(item => item.id === uid);
      await rtdbSet(rtdbRef(rtdb, attendancePath(attendanceDate, uid)), {
        uid,
        employeeName: employee?.name || '',
        date: attendanceDate,
        entryTime: String(values.entryTime || '').trim(),
        exitTime: String(values.exitTime || '').trim(),
        pauseMinutes,
        notes: String(values.notes || '').trim(),
        workedMinutes,
        scheduledShiftText: comparison.scheduledText,
        delayMinutes: comparison.delayMinutes,
        earlyLeaveMinutes: comparison.earlyLeaveMinutes,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUserUid || ''
      });
    }));
    await writeLog(`attendance_save:${attendanceDate}`);
    await loadAttendanceData();
    setAttendanceStatus('Entrate e uscite salvate.', 'info');
  } catch (e) {
    console.error('Errore salvataggio entrate e uscite:', e);
    setAttendanceStatus('Errore salvataggio entrate e uscite: ' + e.message, 'error');
  }
}

function maybeShowTodayShiftPopup() {
  if (todayShiftPopupShown || canManageShifts() || !currentUserUid) return;
  const shift = shiftsData.find(s => s.uid === currentUserUid && s.date === today());
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
      html += `<td class="shift-cell ${cls.type || 'shift-empty'}" data-shift-uid="${esc(employee.id)}" data-shift-date="${day.date}" ${allowEdit ? '' : 'data-readonly="true"'}>${esc(shiftText)}</td>`;
    });
    html += '</tr>';
  });
  html += '<tr class="shift-total-row"><td class="shift-employee-cell">Totali</td>';
  totals.forEach(dayTotal => {
    html += `<td class="shift-total-cell"><div class="shift-total-line">M: ${dayTotal.M}</div><div class="shift-total-line">P: ${dayTotal.P}</div><div class="shift-total-line">S: ${dayTotal.S}</div></td>`;
  });
  html += '</tr>';
  table.innerHTML = html;
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
  const existing = shiftsData.find(s => s.uid === uid && s.date === targetDate);
  editingShiftId = existing?.id || '';
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
  $('shiftEditor').classList.remove('hidden');
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
      await writeLog(`shift_update:${editingShiftId}`);
    } else {
      await addDoc(shiftCollection(), {
        ...payload,
        createdBy: currentUserUid || '',
        createdAt: serverTimestamp()
      });
      await writeLog(`shift_create:${uid}:${date}`);
    }
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
    await writeLog(`shift_delete:${editingShiftId}`);
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
    renderShifts();
  }, err => {
    console.error('Errore caricamento turni:', err);
    shiftsData = [];
    clearShiftEditor();
    setShiftStatus(getFriendlyFirestoreMessage(err, 'Impossibile caricare i turni.'), 'error');
    renderShifts();
  });
}

// INIT
function init() {
  $('date').value = today();
  $('from').value = today().slice(0, 8) + '01';
  $('to').value = today();
  setAttendanceDateValue(today());
  
  document.querySelectorAll('nav button').forEach(b => {
    b.onclick = () => tab(b.dataset.tab, b);
  });
  
  $('saveBtn').onclick = saveDay;
  $('clearBtn').onclick = () => clear();
  $('shareBtn').onclick = shareWhatsApp;
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
  $('attendancePrevDayBtn').onclick = () => {
    const date = parseISODate(attendanceDate || today());
    date.setDate(date.getDate() - 1);
    setAttendanceDateValue(toISODate(date));
    loadAttendanceData();
  };
  $('attendanceTodayBtn').onclick = () => {
    setAttendanceDateValue(today());
    loadAttendanceData();
  };
  $('attendanceNextDayBtn').onclick = () => {
    const date = parseISODate(attendanceDate || today());
    date.setDate(date.getDate() + 1);
    setAttendanceDateValue(toISODate(date));
    loadAttendanceData();
  };
  $('attendanceDate').onchange = () => {
    setAttendanceDateValue($('attendanceDate').value || today());
    loadAttendanceData();
  };
  $('attendanceSaveBtn').onclick = saveAttendance;
  $('attendanceTable').oninput = e => {
    const row = e.target.closest('tr[data-attendance-uid]');
    if (!row || !canManageAttendance()) return;
    updateAttendanceRow(row);
    renderAttendanceWeeklyTable();
    setAttendanceStatus('Modifiche non salvate.', 'info');
  };
  $('shiftsTable').onclick = e => {
    if (!canManageShifts()) return;
    const cell = e.target.closest('.shift-cell');
    if (!cell) return;
    openShiftEditor(cell.getAttribute('data-shift-uid') || '', cell.getAttribute('data-shift-date') || '');
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
function tab(id, b) {
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
  if (id === 'settings') loadUsersForAdmin();
  if (id === 'myShifts' && canManageShifts()) {
    notify('Questa vista è disponibile per i dipendenti.', 'info');
    return;
  }
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
  render();
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
  hours();
  calc();
  dash();
  history();
  stats();
  settings();
  renderEmployeesTable();
  renderUsersTable();
  renderShifts();
  renderAttendance();
}

// RENDER HOURS TABLE
function hours() {
  let html = '<tr><th>Dipendente</th><th>Ore</th><th>Cash (€/ora)</th><th>Carta (€/ora)</th><th>Totale (€/ora)</th></tr>';
  
  state.employees.forEach((n, i) => {
    html += `<tr><td>${esc(n)}</td><td class="hour-cell"><input class="hour" type="number" step="0.5" value="0"></td><td class="calc-cash"></td><td class="calc-card"></td><td class="calc-total"></td></tr>`;
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

// SHARE ON WHATSAPP
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
  let q = query(collection(db, 'restaurants', 'angies', 'chat'), orderBy('createdAt', 'asc'));
  unsub = onSnapshot(q, snap => {
    let box = $('chatBox');
    box.textContent = '';
    snap.forEach(d => {
      let msg = d.data();
      const msgNode = document.createElement('div');
      msgNode.className = 'msg';
      const strong = document.createElement('strong');
      strong.textContent = String(msg.name || '');
      msgNode.appendChild(strong);
      msgNode.append(': ' + String(msg.text || ''));
      box.appendChild(msgNode);
    });
    box.scrollTop = box.scrollHeight;
  }, err => {
    console.error('Errore chat listener:', err);
  });
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
  render();
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
          hasLoadedSessionData = false;
          localStorage.removeItem(SESSION_KEY);
          currentUser = '';
          currentUserName = '';
          currentUserUid = '';
          currentUserRole = '';
          employeesData = [];
          shiftsData = [];
          attendanceDate = today();
          attendanceDayEntries = {};
          attendanceWeekEntries = {};
          attendanceShiftData = [];
          if (shiftsUnsub) {
            shiftsUnsub();
            shiftsUnsub = null;
          }
          $('who').textContent = 'Online';
          clearEmployeeForm();
          clearShiftEditor();
          syncEmployeeTabVisibility();
          syncShiftTabVisibility();
          syncSettingsTabVisibility();
          renderShifts();
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
        populateShiftEmployeeOptions();
        attachShiftListeners();
        render();
        showApp();
        tab('dashboard', document.querySelector('nav button[data-tab="dashboard"]'));
        chatListen();
        writeLog('login');

        const startupTasks = [];
        if (!hasLoadedSessionData) {
          startupTasks.push(
            {
              label: 'Caricamento dati principali',
              promise: withTimeout(load(), PRIMARY_LOAD_TIMEOUT_MS, 'Caricamento dati principali')
                .then(() => { hasLoadedSessionData = true; })
            }
          );
        }
        startupTasks.push({
          label: 'Caricamento dipendenti',
          promise: withTimeout(loadEmployees(), SECONDARY_LOAD_TIMEOUT_MS, 'Caricamento dipendenti')
        });
        startupTasks.push({
          label: 'Caricamento entrata e uscita',
          promise: withTimeout(loadAttendanceData(), SECONDARY_LOAD_TIMEOUT_MS, 'Caricamento entrata e uscita')
        });
        const startupResults = await Promise.allSettled(startupTasks.map(task => task.promise));
        const startupErrors = startupResults
          .map((result, index) => {
            if (result.status !== 'rejected') return '';
            return `${startupTasks[index].label}: ${result.reason?.message || 'Errore non dettagliato'}`;
          })
          .filter(Boolean);
        if (startupErrors.length) {
          console.warn('[Auth] Alcuni caricamenti post-login non sono riusciti:', startupErrors, startupResults);
          setStatus('loginStatus', `Accesso completato con avvisi: ${startupErrors.join(' | ')}`, 'error');
        } else {
          setStatus('loginStatus', '', 'info');
        }
        render();
      } else {
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
        attendanceDate = today();
        attendanceDayEntries = {};
        attendanceWeekEntries = {};
        attendanceShiftData = [];
        $('who').textContent = 'Online';
        if (unsub) {
          unsub();
          unsub = null;
        }
        if (shiftsUnsub) {
          shiftsUnsub();
          shiftsUnsub = null;
        }
        clearEmployeeForm();
        clearShiftEditor();
        syncEmployeeTabVisibility();
        syncShiftTabVisibility();
        syncSettingsTabVisibility();
        renderShifts();
        showLogin();
      }
    } catch (e) {
      console.error('[Auth] Errore durante completamento login:', e);
      const detail = getErrorDetails(e, 'Errore imprevisto durante il login.');
      setStatus('loginStatus', `Login fallito: ${detail}`, 'error');
      showLogin();
      hasLoadedSessionData = false;
      localStorage.removeItem(SESSION_KEY);
    }
  });
});
