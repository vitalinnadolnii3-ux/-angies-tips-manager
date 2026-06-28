// OFFLINE MODE - Usa localStorage invece di Firebase

const NAMES = ["Diego","Sunkar","Silvano","Giuseppe","Vitalin","Davide","Zara","Lisa","Anna","Niko","Raffa","Alex"];
let state = { employees: NAMES, kitchenPercent: 20, history: [], chat: [] };

const $ = id => document.getElementById(id);
const euro = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(+n || 0);
const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));

// LOAD DATA FROM LOCALSTORAGE
function load() {
  const saved = localStorage.getItem('angies-manager-state');
  if (saved) {
    try {
      state = JSON.parse(saved);
    } catch(e) {
      console.error('Errore caricamento dati:', e);
      state = { employees: NAMES, kitchenPercent: 20, history: [], chat: [] };
    }
  }
}

// SAVE DATA TO LOCALSTORAGE
function saveState() {
  localStorage.setItem('angies-manager-state', JSON.stringify(state));
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

// SPLIT CALCULATION
function split(r) {
  let p = state.kitchenPercent / 100;
  let c = r.cash || 0;
  let ca = r.card || 0;
  let t = r.total ?? (c + ca);
  return {
    cash: c,
    card: ca,
    total: t,
    salaCash: r.salaCash ?? c * (1 - p),
    salaCard: r.salaCard ?? ca * (1 - p),
    cucinaCash: r.cucinaCash ?? c * p,
    cucinaCard: r.cucinaCard ?? ca * p
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
  chatRender();
}

// RENDER HOURS TABLE
function hours() {
  let html = '<tr><th>Dipendente</th><th>Ore</th><th>Cash</th><th>Carta</th><th>Totale</th></tr>';
  state.employees.forEach((n, i) => {
    html += `<tr><td>${esc(n)}</td><td><input class="hour" type="number" step="0.5" value="0"></td><td class="calc"></td><td class="calc"></td><td class="calc"></td></tr>`;
  });
  $('hours').innerHTML = html;
  
  document.querySelectorAll('.hour').forEach((x, i) => {
    x.oninput = () => {
      let h = +x.value || 0;
      let c = (+$('cash').value || 0) / state.employees.length * h;
      let ca = (+$('card').value || 0) / state.employees.length * h;
      let cells = x.parentElement.parentElement.querySelectorAll('.calc');
      cells[0].textContent = euro(c);
      cells[1].textContent = euro(ca);
      cells[2].textContent = euro(c + ca);
      calc();
    };
  });
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
function saveDay() {
  let d = data();
  if (!d.date) return alert('Inserisci la data.');
  if (d.total <= 0) return alert('Inserisci Cash o Carta.');
  if (d.totalHours <= 0) return alert('Inserisci almeno un\'ora.');
  
  let existing = state.history.find(x => x.date === d.date);
  if (existing) {
    state.history.splice(state.history.indexOf(existing), 1);
  }
  state.history.unshift(d);
  saveState();
  
  alert('Giornata salvata!');
  clear();
  render();
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

// HISTORY
function history() {
  let html = '<tr><th>Data</th>';
  state.employees.forEach(n => html += `<th>${esc(n)} Cash</th><th>${esc(n)} Carta</th><th>${esc(n)} Totale</th>`);
  html += '<th>Sala Cash</th><th>Sala Carta</th><th>Sala Tot.</th><th>Cucina Cash</th><th>Cucina Carta</th><th>Cucina Tot.</th><th>Azioni</th></tr>';
  
  state.history.forEach((r, i) => {
    html += `<tr><td>${fmt(r.date)}</td>`;
    state.employees.forEach((n, j) => {
      let c = (split(r).salaCash / state.employees.length) || 0;
      let ca = (split(r).salaCard / state.employees.length) || 0;
      html += `<td>${euro(c)}</td><td>${euro(ca)}</td><td>${euro(c + ca)}</td>`;
    });
    html += `<td>${euro(split(r).salaCash)}</td><td>${euro(split(r).salaCard)}</td><td>${euro(split(r).salaCash + split(r).salaCard)}</td><td>${euro(split(r).cucinaCash)}</td><td>${euro(split(r).cucinaCard)}</td><td>${euro(split(r).cucinaCash + split(r).cucinaCard)}</td><td><button onclick="delDay(${i})">✕</button></td></tr>`;
  });
  $('hist').innerHTML = html;
}

// DELETE DAY
window.delDay = i => {
  if (!confirm('Cancellare questa giornata?')) return;
  state.history.splice(i, 1);
  saveState();
  render();
};

// DELETE ALL
function deleteAll() {
  if (!confirm('Cancellare tutto lo storico?')) return;
  state.history = [];
  saveState();
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
function saveSettings() {
  state.kitchenPercent = +$('kitchen').value || 20;
  state.employees = [...document.querySelectorAll('.emp')].map(x => x.value.trim()).filter(Boolean);
  saveState();
  alert('Impostazioni salvate!');
  render();
}

// CHAT RENDER
function chatRender() {
  let box = $('chatBox');
  box.innerHTML = '';
  state.chat.forEach(msg => {
    box.innerHTML += `<div class="msg"><strong>${esc(msg.name)}</strong>: ${esc(msg.text)}</div>`;
  });
  box.scrollTop = box.scrollHeight;
}

// SEND MESSAGE
function sendMsg() {
  let text = $('msg').value.trim();
  if (!text) return;
  
  state.chat.push({
    text: text,
    name: 'User',
    timestamp: new Date().toLocaleTimeString('it-IT')
  });
  
  saveState();
  $('msg').value = '';
  chatRender();
}

// EXPORT CSV
function exportCSV() {
  let h = ['Data'];
  state.employees.forEach(n => h.push(`${n} Cash`, `${n} Carta`, `${n} Totale`));
  h.push('Sala Cash', 'Sala Carta', 'Sala Totale', 'Cucina Cash', 'Cucina Carta', 'Cucina Totale', 'Totale');
  
  let rows = [h];
  state.history.forEach(r => {
    let row = [fmt(r.date)];
    state.employees.forEach(() => {
      row.push(num(0), num(0), num(0));
    });
    row.push(
      num(split(r).salaCash),
      num(split(r).salaCard),
      num(split(r).salaCash + split(r).salaCard),
      num(split(r).cucinaCash),
      num(split(r).cucinaCard),
      num(split(r).cucinaCash + split(r).cucinaCard),
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
window.addEventListener('load', () => {
  load();
  init();
  render();
});
