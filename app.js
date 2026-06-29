import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { firebaseConfig, getAuth } from "./firebase-config.js?v=12";

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const functions = getFunctions(fbApp);

const NAMES = ["Diego","Sunkar","Silvano","Giuseppe","Vitalin","Davide","Zara","Lisa","Anna","Niko","Raffa","Alex"];
let state = { employees: NAMES, kitchenPercent: 20, history: [] };
let unsub = null;
let currentUser = '';
let currentUserUid = '';
let currentUserName = '';
let currentUserRole = '';
let hasLoadedSessionData = false;
let employeesData = [];
let editingEmployeeId = '';
let shiftsData = [];
let shiftsUnsub = null;
let weekOffset = 0;
let editingShiftId = '';
let todayShiftPopupShown = false;
const SESSION_KEY = 'angiesManagerUser';
const EMPLOYEE_ROLES = ['Admin', 'Manager', 'Responsible', 'Waiter', 'Kitchen'];
const WEEK_DAYS_IT = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const SHIFT_TYPES = ['morning', 'evening', 'long', 'split', 'rest'];
const LONG_SHIFT_MIN_HOURS = 7.5;

const $ = id => document.getElementById(id);
const euro = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(+n || 0);
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
const normalizeEmail = s => String(s || '').trim().toLowerCase();
function getCurrentUserRole() { return currentUserRole; }
const isAdmin = () => currentUserRole.toLowerCase() === 'admin';
const isManager = () => currentUserRole.toLowerCase() === 'manager';
const isResponsible = () => currentUserRole.toLowerCase() === 'responsible';
const isWaiter = () => currentUserRole.toLowerCase() === 'waiter';
const canViewGlobalTipsData = () => isAdmin() || isManager() || isResponsible();
const canManageShifts = () => isAdmin() || isManager() || isResponsible();
const canManageUsers = () => isAdmin();
const canViewAllData = () => isAdmin() || isManager();
const canViewUserData = (targetUid) => isAdmin() || isManager() || targetUid === currentUserUid;

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

function deriveNameFromEmail(email) {
  const localPart = normalizeName(String(email || '').split('@')[0]);
  return localPart || String(email || '').trim() || 'Unknown';
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

function getCurrentWeekDates() {
  const base = parseISODate(today());
  base.setDate(base.getDate() + weekOffset * 7);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diff);
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
  if (employeesData.length) {
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
  const email = normalizeEmail($('loginEmail').value);
  const pwd = $('loginPass').value;
  if (!email) return alert('Inserisci l\'email');
  if (!pwd) return alert('Inserisci la password');
  try {
    await signInWithEmailAndPassword(auth, email, pwd);
  } catch (e) {
    console.error('Errore login:', e);
    return alert('Errore login: ' + e.message);
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('Errore logout:', e);
    return alert('Errore logout: ' + (e?.message || 'Logout non riuscito'));
  }
  localStorage.removeItem(SESSION_KEY);
  currentUser = '';
  currentUserName = '';
  currentUserUid = '';
  currentUserRole = '';
  todayShiftPopupShown = false;
  weekOffset = 0;
  shiftsData = [];
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
    const snap = await getDocs(employeeCollection());
    employeesData = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name), 'it', { sensitivity: 'base' }));
    renderEmployeesTable();
  } catch (e) {
    console.error('Errore caricamento dipendenti:', e);
    alert('Errore caricamento dipendenti: ' + e.message);
  }
}

function clearEmployeeForm() {
  editingEmployeeId = '';
  $('employeeName').value = '';
  $('employeeEmail').value = '';
  $('employeePassword').value = '';
  $('employeeRole').value = '';
  $('employeeSaveBtn').textContent = 'Crea dipendente';
  $('employeeCancelBtn').classList.add('hidden');
}

function renderEmployeesTable() {
  const table = $('employeeList');
  if (!table) return;
  if (!isAdmin()) {
    table.innerHTML = '<tr><td>Accesso consentito solo agli admin.</td></tr>';
    return;
  }
  let html = '<tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Azioni</th></tr>';
  if (!employeesData.length) {
    html += '<tr><td colspan="5">Nessun dipendente registrato.</td></tr>';
    table.innerHTML = html;
    return;
  }
  employeesData.forEach(emp => {
    const enabled = emp.enabled !== false;
    const statusClass = enabled ? 'status-enabled' : 'status-disabled';
    const statusText = enabled ? 'Attivo' : 'Disabilitato';
    html += `<tr>
      <td>${esc(emp.name || '-')}</td>
      <td>${esc(emp.email || '-')}</td>
      <td>${esc(emp.role || '-')}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td class="table-actions">
        <button data-employee-action="edit" data-employee-id="${esc(emp.id)}">Modifica</button>
        <button data-employee-action="toggle" data-employee-id="${esc(emp.id)}">${enabled ? 'Disabilita' : 'Abilita'}</button>
        <button class="danger" data-employee-action="delete" data-employee-id="${esc(emp.id)}">Elimina</button>
      </td>
    </tr>`;
  });
  table.innerHTML = html;
}

function validateEmployeePayload({ name, email, role, password, requirePassword = false, ignoreId = '' }) {
  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);
  if (!normalizedName) throw new Error('Nome obbligatorio.');
  if (!normalizedEmail) throw new Error('Email obbligatoria.');
  if (!normalizedRole) throw new Error('Ruolo obbligatorio.');
  const normalizedPassword = String(password || '');
  if (requirePassword && normalizedPassword.length < 8) throw new Error('Password minima di 8 caratteri.');
  if (!requirePassword && normalizedPassword && normalizedPassword.length < 8) throw new Error('Nuova password minima di 8 caratteri.');
  return { normalizedName, normalizedEmail, normalizedRole, normalizedPassword };
}

async function checkEmailUniqueness(email, ignoreId = '') {
  const snap = await getDocs(employeeCollection());
  return !snap.docs.some(d => d.id !== ignoreId && normalizeEmail(d.data()?.email) === email);
}

async function upsertEmployeeProfile(uid, data, isCreate = false) {
  const payload = {
    name: data.name,
    email: data.email,
    role: data.role,
    enabled: data.enabled !== false,
    updatedAt: serverTimestamp()
  };
  if (isCreate) payload.createdAt = serverTimestamp();
  await setDoc(employeeDoc(uid), payload, { merge: !isCreate });

  // Sync role to /users/ collection for RBAC
  // /users/ uses lowercase roles ('admin','manager','responsible','waiter','kitchen') per the data model spec
  const userPayload = {
    email: data.email,
    name: data.name,
    role: String(data.role || '').toLowerCase(),
    active: data.enabled !== false,
    updatedAt: serverTimestamp()
  };
  if (isCreate) userPayload.createdAt = serverTimestamp();
  try {
    await setDoc(userDoc(uid), userPayload, { merge: !isCreate });
  } catch (e) {
    // Non-fatal: /users/ sync may fail if caller lacks permission
    console.warn('Avviso: sincronizzazione /users/ non riuscita:', e.message);
  }
}

async function createEmployee() {
  if (!isAdmin()) return alert('Solo admin');
  let data;
  try {
    data = validateEmployeePayload({
      name: $('employeeName').value,
      email: $('employeeEmail').value,
      role: $('employeeRole').value,
      password: $('employeePassword').value,
      requirePassword: true
    });
  } catch (e) {
    return alert(e.message);
  }

  let uid = '';
  try {
    const isUnique = await checkEmailUniqueness(data.normalizedEmail);
    if (!isUnique) return alert('Email già associata a un dipendente.');
  } catch (e) {
    console.error('Errore verifica email dipendente:', e);
    return alert('Errore verifica email: ' + e.message);
  }
  try {
    const fnResult = await callEmployeeAdminFunction('createEmployeeAuthUser', {
      email: data.normalizedEmail,
      password: data.normalizedPassword,
      name: data.normalizedName,
      role: data.normalizedRole
    });
    uid = fnResult.data?.uid ? String(fnResult.data.uid) : '';
  } catch (e) {
    console.warn('Callable createEmployeeAuthUser non disponibile, uso fallback client-side.', e);
    uid = '';
  }

  if (!uid) {
    try {
      uid = await createAuthUserWithSecondarySession(data.normalizedEmail, data.normalizedPassword);
    } catch (e) {
      console.error('Errore creazione utente auth:', e);
      return alert('Errore creazione utente: ' + e.message);
    }
  }

  try {
    await upsertEmployeeProfile(uid, {
      name: data.normalizedName,
      email: data.normalizedEmail,
      role: data.normalizedRole,
      enabled: true
    }, true);
    await writeLog(`employee_create:${data.normalizedEmail}:${data.normalizedRole}`);
    clearEmployeeForm();
    await loadEmployees();
    alert('Dipendente creato con successo.');
  } catch (e) {
    console.error('Errore salvataggio profilo dipendente:', e);
    alert('Errore salvataggio profilo: ' + e.message);
  }
}

async function updateEmployee() {
  if (!isAdmin()) return alert('Solo admin');
  const employee = employeesData.find(emp => emp.id === editingEmployeeId);
  if (!employee) return alert('Dipendente non trovato.');

  let data;
  try {
    data = validateEmployeePayload({
      name: $('employeeName').value,
      email: $('employeeEmail').value,
      role: $('employeeRole').value,
      password: $('employeePassword').value,
      requirePassword: false,
      ignoreId: editingEmployeeId
    });
  } catch (e) {
    return alert(e.message);
  }

  const wantsAuthUpdate = data.normalizedEmail !== normalizeEmail(employee.email) || data.normalizedPassword.length >= 8;
  try {
    const isUnique = await checkEmailUniqueness(data.normalizedEmail, employee.id);
    if (!isUnique) return alert('Email già associata a un dipendente.');
  } catch (e) {
    console.error('Errore verifica email dipendente:', e);
    return alert('Errore verifica email: ' + e.message);
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
      return alert('Aggiornamento email/password richiede Cloud Function `updateEmployeeAuthUser` configurata.');
    }
  }

  try {
    await upsertEmployeeProfile(employee.id, {
      name: data.normalizedName,
      email: data.normalizedEmail,
      role: data.normalizedRole,
      enabled: employee.enabled !== false
    });
    await writeLog(`employee_update:${employee.id}`);
    clearEmployeeForm();
    await loadEmployees();
    syncEmployeeTabVisibility();
    alert('Dipendente aggiornato.');
  } catch (e) {
    console.error('Errore aggiornamento dipendente:', e);
    alert('Errore aggiornamento: ' + e.message);
  }
}

function editEmployee(id) {
  if (!isAdmin()) return;
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) return;
  editingEmployeeId = employee.id;
  $('employeeName').value = employee.name || '';
  $('employeeEmail').value = employee.email || '';
  $('employeePassword').value = '';
  $('employeeRole').value = normalizeRole(employee.role);
  $('employeeSaveBtn').textContent = 'Salva modifiche';
  $('employeeCancelBtn').classList.remove('hidden');
}

async function toggleEmployeeEnabled(id) {
  if (!isAdmin()) return alert('Solo admin');
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) return;
  const nextEnabled = employee.enabled === false;
  try {
    await upsertEmployeeProfile(employee.id, {
      name: employee.name || '',
      email: normalizeEmail(employee.email),
      role: normalizeRole(employee.role),
      enabled: nextEnabled
    });
    await writeLog(`employee_${nextEnabled ? 'enable' : 'disable'}:${employee.id}`);
    await loadEmployees();
    if (employee.id === currentUserUid && !nextEnabled) {
      alert('Il tuo account è stato disabilitato. Verrai disconnesso.');
      await logout();
    }
  } catch (e) {
    console.error('Errore aggiornamento stato dipendente:', e);
    alert('Errore aggiornamento stato: ' + e.message);
  }
}

async function removeEmployee(id) {
  if (!isAdmin()) return alert('Solo admin');
  const employee = employeesData.find(emp => emp.id === id);
  if (!employee) return;
  if (!confirm(`Eliminare definitivamente ${employee.name || employee.email}?`)) return;
  try {
    await callEmployeeAdminFunction('deleteEmployeeAuthUser', { uid: employee.id });
  } catch (e) {
    console.error('Errore cancellazione auth dipendente:', e);
    return alert('Eliminazione account Auth richiede Cloud Function `deleteEmployeeAuthUser` configurata.');
  }
  try {
    await deleteDoc(employeeDoc(employee.id));
    // Also delete /users/ document for the RBAC system
    try {
      await deleteDoc(userDoc(employee.id));
    } catch (e) {
      console.warn('Avviso: cancellazione /users/ non riuscita:', e.message);
    }
    await writeLog(`employee_delete:${employee.id}`);
    if (editingEmployeeId === employee.id) clearEmployeeForm();
    await loadEmployees();
  } catch (e) {
    console.error('Errore cancellazione profilo dipendente:', e);
    alert('Errore cancellazione profilo: ' + e.message);
  }
}

async function loadCurrentUserProfile(user) {
  currentUser = user.email || '';
  currentUserUid = user.uid || '';
  currentUserName = deriveNameFromEmail(user.email);
  currentUserRole = '';

  try {
    // Check /users/ collection first (new RBAC system)
    const userSnap = await getDoc(userDoc(user.uid));
    if (userSnap.exists()) {
      const profile = userSnap.data();
      const active = profile.active !== false;
      if (!active) {
        alert('Account disabilitato. Contatta un amministratore.');
        await signOut(auth);
        return false;
      }
      currentUserName = normalizeName(profile.name) || currentUserName;
      // /users/ collection stores roles as lowercase ('admin','manager','responsible','waiter','kitchen')
      currentUserRole = profile.role || 'waiter';
    } else {
      // Fallback to /employees/ collection for backwards compatibility
      const profileSnap = await getDoc(employeeDoc(user.uid));
      if (profileSnap.exists()) {
        const profile = profileSnap.data();
        const enabled = profile.enabled !== false;
        if (!enabled) {
          alert('Account disabilitato. Contatta un amministratore.');
          await signOut(auth);
          return false;
        }
        currentUserName = normalizeName(profile.name) || currentUserName;
        currentUserRole = normalizeRole(profile.role) || 'Waiter';
      } else {
        currentUserRole = 'Waiter';
        await upsertEmployeeProfile(user.uid, {
          name: deriveNameFromEmail(user.email),
          email: currentUser,
          role: currentUserRole,
          enabled: true
        }, true);
        await writeLog('employee_profile_bootstrap');
      }
    }
  } catch (e) {
    console.error('Errore caricamento profilo utente:', e);
    alert('Errore caricamento profilo utente: ' + e.message);
    await signOut(auth);
    return false;
  }
  return true;
}

function shiftMapByKey() {
  const map = new Map();
  shiftsData.forEach(shift => {
    const key = `${shift.uid}__${shift.date}`;
    map.set(key, shift);
  });
  return map;
}

function maybeShowTodayShiftPopup() {
  if (todayShiftPopupShown || canManageShifts() || !currentUserUid) return;
  const shift = shiftsData.find(s => s.uid === currentUserUid && s.date === today());
  if (!shift) return;
  todayShiftPopupShown = true;
  const text = getShiftDisplayText(shift);
  alert(`Il tuo turno di oggi: ${text || 'Nessun turno assegnato'}`);
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
  if (!canManageShifts()) return alert('Accesso consentito solo ad Admin/Manager/Responsible.');
  const uid = $('shiftEmployee').value;
  const date = $('shiftDate').value;
  const selectedEmployee = getShiftEmployees().find(emp => emp.id === uid);
  let shiftType = normalizeShiftType($('shiftType').value) || 'morning';
  const isRestDay = $('shiftRestDay').checked || shiftType === 'rest';
  if (!uid) return alert('Seleziona un dipendente.');
  if (!date) return alert('Seleziona una data.');
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
  } catch (e) {
    console.error('Errore salvataggio turno:', e);
    alert('Errore salvataggio turno: ' + e.message);
  }
}

async function deleteShift() {
  if (!canManageShifts()) {
    console.warn('Solo Admin/Manager/Responsible possono eliminare i turni.');
    return alert('Questa azione richiede permessi Admin/Manager/Responsible.');
  }
  if (!editingShiftId) return;
  if (!confirm('Eliminare questo turno?')) return;
  try {
    await deleteDoc(shiftDoc(editingShiftId));
    await writeLog(`shift_delete:${editingShiftId}`);
    clearShiftEditor();
  } catch (e) {
    console.error('Errore eliminazione turno:', e);
    alert('Errore eliminazione turno: ' + e.message);
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
  $('employeeSaveBtn').onclick = () => editingEmployeeId ? updateEmployee() : createEmployee();
  $('employeeCancelBtn').onclick = clearEmployeeForm;
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
    if (action === 'toggle') toggleEmployeeEnabled(id);
    if (action === 'delete') removeEmployee(id);
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
    console.warn('Solo admin possono gestire i dipendenti.');
    alert('Questa azione richiede permessi di amministratore.');
    return;
  }
  if (id === 'settings' && !isAdmin()) {
    console.warn('Accesso alle impostazioni riservato agli admin.');
    alert('Non hai i permessi per accedere a questa sezione.');
    return;
  }
  if (id === 'myShifts' && canManageShifts()) {
    alert('Questa vista è disponibile per i dipendenti.');
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
  let cash = +$('cash').value || 0;
  let card = +$('card').value || 0;
  let h = [...document.querySelectorAll('.hour')].map(x => +x.value || 0);
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
  renderShifts();
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
  let cash = +$('cash').value || 0;
  let card = +$('card').value || 0;
  let h = [...document.querySelectorAll('.hour')].map(x => +x.value || 0);
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
  if (!currentUserUid) return alert('Sessione non valida. Effettua di nuovo il login.');
  let d = data();
  if (!d.date) return alert('Inserisci la data.');
  if (d.total <= 0) return alert('Inserisci Cash o Carta.');
  if (d.totalHours <= 0) return alert('Inserisci almeno un\'ora.');
  
  let existing = state.history.find(x => x.date === d.date);
  if (existing) {
    state.history.splice(state.history.indexOf(existing), 1);
  }
  state.history.unshift(d);
  
  try {
    await setDoc(doc(db, 'restaurants', 'angies', 'days', d.date), d);
    alert('Giornata salvata!');
    clear();
    render();
  } catch(e) {
    console.error('Errore salvataggio:', e);
    alert('Errore salvataggio: ' + e.message);
  }
}

// SHARE ON WHATSAPP
function shareWhatsApp() {
  let d = data();
  if (!d.date) return alert('Seleziona una data.');
  if (d.total <= 0) return alert('Nessun dato da condividere.');
  if (d.totalHours <= 0) {
    alert("Inserisci almeno un'ora.");
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
    alert('Errore cancellazione: ' + e.message);
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
    alert('Impostazioni salvate!');
    render();
  } catch(e) {
    console.error('Errore: ', e);
    alert('Errore: ' + e.message);
  }
}

// CHAT LISTEN
function chatListen() {
  if (unsub) unsub();
  let q = query(collection(db, 'restaurants', 'angies', 'chat'), orderBy('createdAt', 'asc'));
  unsub = onSnapshot(q, snap => {
    let box = $('chatBox');
    box.innerHTML = '';
    snap.forEach(d => {
      let msg = d.data();
      box.innerHTML += `<div class="msg"><strong>${esc(msg.name)}</strong>: ${esc(msg.text)}</div>`;
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
  if (!currentUser) return alert('Effettua il login');
  try {
    await addDoc(collection(db, 'restaurants', 'angies', 'chat'), {
      text: text,
      name: currentUser,
      createdAt: serverTimestamp()
    });
    $('msg').value = '';
  } catch(e) {
    console.error('Errore invio messaggio:', e);
    alert('Errore: ' + e.message);
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
    if (user) {
      const loadedProfile = await loadCurrentUserProfile(user);
      if (!loadedProfile) {
        hasLoadedSessionData = false;
        localStorage.removeItem(SESSION_KEY);
        currentUser = '';
        currentUserName = '';
        currentUserUid = '';
        currentUserRole = '';
        employeesData = [];
        shiftsData = [];
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
      if (!hasLoadedSessionData) {
        await load();
        hasLoadedSessionData = true;
      }
      await loadEmployees();
      syncEmployeeTabVisibility();
      syncShiftTabVisibility();
      syncSettingsTabVisibility();
      populateShiftEmployeeOptions();
      attachShiftListeners();
      render();
      showApp();
      chatListen();
      writeLog('login');
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
  });
});
