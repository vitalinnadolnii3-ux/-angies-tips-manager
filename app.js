import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js?v=12";

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

const NAMES = ["Diego","Sunkar","Silvano","Giuseppe","Vitalin","Davide","Zara","Lisa","Anna","Niko","Raffa","Alex"];
let state = { employees: NAMES, kitchenPercent: 20, history: [] };
let unsub = null;
let appStarted = false;

const $ = id => document.getElementById(id);
const euro = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(+n || 0);
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
const LOGIN_NAME_KEY = 'angies-login-name';
const LOGIN_EMAIL_DOMAIN = 'angies.local';
const DEFAULT_LOGIN_LOCAL_PART = 'user';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeLoginName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
}

function loginEmail(name) {
  let raw = sanitizeLoginName(name);
  if (!raw) return '';
  if (raw.includes('@')) {
    let email = raw.toLowerCase();
    return isValidEmail(email) ? email : '';
  }
  let normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${normalized || DEFAULT_LOGIN_LOCAL_PART}@${LOGIN_EMAIL_DOMAIN}`;
}

function setLoginError(msg = '') {
  $('err').textContent = msg;
}

function showLogin(msg = '') {
  setLoginError(msg);
  $('loginScreen').classList.remove('hidden');
  $('app').classList.add('hidden');
}

function showApp(name) {
  $('who').textContent = name ? `Online • ${name}` : 'Online';
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
}

async function startApp() {
  if (appStarted) return;
  await load();
  init();
  render();
  chatListen();
  appStarted = true;
}

async function login() {
  let name = sanitizeLoginName($('loginName').value);
  let password = $('loginPassword').value;
  if (!name || !password) return setLoginError('Inserisci nome e password.');
  let email = loginEmail(name);
  if (!email) return setLoginError('Nome non valido.');
  setLoginError('');
  try {
    await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem(LOGIN_NAME_KEY, name);
  } catch(e) {
    console.error('Errore login:', e);
    if (e.code && e.code.startsWith('auth/') && e.code !== 'auth/network-request-failed') {
      setLoginError('Credenziali non valide.');
    } else {
      setLoginError('Errore di connessione. Riprova.');
    }
  }
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
    const h = await getDocs(collection(db, 'restaurants', 'angies', 'days'));
    state.history = [];
    h.forEach(d => {
      state.history.push({ date: d.id, ...d.data() });
    });
    state.history.sort((a, b) => b.date.localeCompare(a.date));
  } catch(e) {
    console.error('Errore caricamento:', e);
  }
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
  $('export').onclick = exportCSV;
  $('deleteAll').onclick = deleteAll;
  $('send').onclick = sendMsg;
  $('saveSet').onclick = saveSettings;
  $('msg').onkeypress = e => { if (e.key === 'Enter') sendMsg(); };
}

// TAB NAVIGATION
function tab(id, b) {
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

// SPLIT CALCULATION - CORRETTO
function split(r) {
  let p = state.kitchenPercent / 100;
  let c = r.cash || 0;
  let ca = r.card || 0;
  let t = r.total ?? (c + ca);
  
  // Cucina prende la percentuale
  let cucinaCash = c * p;
  let cucinaCard = ca * p;
  
  // Sala prende il resto
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

// RENDER ALL
function render() {
  hours();
  calc();
  dash();
  history();
  stats();
  settings();
}

// RENDER HOURS TABLE - CORRETTO
function hours() {
  let html = '<tr><th>Dipendente</th><th>Ore</th><th>Cash (€/ora)</th><th>Carta (€/ora)</th><th>Totale (€/ora)</th></tr>';
  
  // Calcola totale ore sala
  let totalHours = [...document.querySelectorAll('.hour')].reduce((sum, x) => sum + (+x.value || 0), 0);
  
  state.employees.forEach((n, i) => {
    html += `<tr><td>${esc(n)}</td><td><input class="hour" type="number" step="0.5" value="0"></td><td class="calc-cash"></td><td class="calc-card"></td><td class="calc-total"></td></tr>`;
  });
  $('hours').innerHTML = html;
  
  // Aggiorna i calcoli quando cambiano le ore
  document.querySelectorAll('.hour').forEach((x, i) => {
    x.oninput = () => updateHourCalculations();
  });
  
  // Aggiorna anche quando cambiano cash/card
  $('cash').oninput = () => updateHourCalculations();
  $('card').oninput = () => updateHourCalculations();
}

// UPDATE HOUR CALCULATIONS - CORRETTO
function updateHourCalculations() {
  let cash = +$('cash').value || 0;
  let card = +$('card').value || 0;
  let h = [...document.querySelectorAll('.hour')].map(x => +x.value || 0);
  let totalHours = h.reduce((a, b) => a + b, 0);
  
  let p = state.kitchenPercent / 100;
  let salaCash = cash * (1 - p);
  let salaCard = card * (1 - p);
  
  // Prezzo per ora sala
  let pricePerHourCash = totalHours > 0 ? salaCash / totalHours : 0;
  let pricePerHourCard = totalHours > 0 ? salaCard / totalHours : 0;
  
  // Aggiorna ogni riga
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
  let r = state.history;
  $('dTotal').textContent = euro(sum(r, 'total'));
  $('dCash').textContent = euro(sum(r, 'cash'));
  $('dCard').textContent = euro(sum(r, 'card'));
  $('dDays').textContent = r.length;
}

// HISTORY - CORRETTO
function history() {
  let html = '<tr><th>Data</th>';
  state.employees.forEach(n => html += `<th>${esc(n)} (€/ora)</th>`);
  html += '<th>Sala Cash</th><th>Sala Carta</th><th>Sala Tot.</th><th>Cucina Cash</th><th>Cucina Carta</th><th>Cucina Tot.</th><th>Totale</th><th>Azioni</th></tr>';
  
  state.history.forEach((r, i) => {
    html += `<tr><td>${fmt(r.date)}</td>`;
    
    // Calcola prezzo per ora per ogni dipendente
    let totalHours = r.hours ? r.hours.reduce((a, b) => a + b, 0) : 0;
    let salaData = split(r);
    let pricePerHourCash = totalHours > 0 ? salaData.salaCash / totalHours : 0;
    let pricePerHourCard = totalHours > 0 ? salaData.salaCard / totalHours : 0;
    
    // Mostra per ogni dipendente
    (r.hours || []).forEach((h, j) => {
      let empTotal = (pricePerHourCash + pricePerHourCard) * h;
      html += `<td>${euro(empTotal)}</td>`;
    });
    
    html += `<td>${euro(salaData.salaCash)}</td><td>${euro(salaData.salaCard)}</td><td>${euro(salaData.salaCash + salaData.salaCard)}</td><td>${euro(salaData.cucinaCash)}</td><td>${euro(salaData.cucinaCard)}</td><td>${euro(salaData.cucinaCash + salaData.cucinaCard)}</td><td><b>${euro(r.total)}</b></td><td><button onclick="delDay(${i})">❌</button></td></tr>`;
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

// STATS
function stats() {
  let f = $('from').value || '0000-01-01';
  let t = $('to').value || '9999-12-31';
  let rows = state.history.filter(r => r.date >= f && r.date <= t);
  $('sTotal').textContent = euro(sum(rows, 'total'));
  $('sCash').textContent = euro(sum(rows, 'cash'));
  $('sCard').textContent = euro(sum(rows, 'card'));
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
  try {
    await addDoc(collection(db, 'restaurants', 'angies', 'chat'), {
      text: text,
      name: 'User-' + Math.random().toString(36).substr(2, 9),
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
    
    // Calcola per ogni dipendente
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

// START APP - ACCESSO CON LOGIN
window.addEventListener('load', () => {
  $('loginBtn').onclick = login;
  $('loginName').onkeypress = e => { if (e.key === 'Enter') login(); };
  $('loginPassword').onkeypress = e => { if (e.key === 'Enter') login(); };
  showLogin();

  onAuthStateChanged(auth, async user => {
    if (!user) return showLogin();
    let savedName = sanitizeLoginName(localStorage.getItem(LOGIN_NAME_KEY));
    let userName = savedName || (user.email ? user.email.split('@')[0] : 'Utente');
    showApp(userName);
    await startApp();
  });
});
