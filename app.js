import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = getFirestore(app);

const DEFAULT_NAMES=["Diego","Sunkar","Silvano","Giuseppe","Vitalin","Davide","Zara","Lisa","Anna","Niko","Raffa","Alex"];
let state={employees:DEFAULT_NAMES,kitchenPercent:20,history:[]};
let currentUser=null;

const euro=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(n)||0);
const today=()=>new Date().toISOString().slice(0,10);

document.getElementById("loginBtn").onclick=async()=>{
  try{
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
    loginError.textContent="";
  }catch(e){
    loginError.textContent="Email o password non corretti.";
  }
};
document.getElementById("logoutBtn").onclick=()=>signOut(auth);

onAuthStateChanged(auth, async user=>{
  currentUser=user;
  if(user){
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    userInfo.textContent=user.email;
    await loadCloud();
    initApp();
  }else{
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
});

async function loadCloud(){
  const settingsSnap=await getDoc(doc(fs,"restaurants","angies","settings","main"));
  if(settingsSnap.exists()){
    const s=settingsSnap.data();
    state.employees=s.employees||DEFAULT_NAMES;
    state.kitchenPercent=s.kitchenPercent||20;
  }
  const daysSnap=await getDocs(collection(fs,"restaurants","angies","days"));
  state.history=daysSnap.docs.map(d=>d.data()).sort((a,b)=>a.date.localeCompare(b.date));
}

async function saveSettingsCloud(){
  await setDoc(doc(fs,"restaurants","angies","settings","main"),{
    employees:state.employees,
    kitchenPercent:state.kitchenPercent
  });
}

async function saveDayCloud(record){
  await setDoc(doc(fs,"restaurants","angies","days",record.date),record);
}

async function deleteDayCloud(date){
  await deleteDoc(doc(fs,"restaurants","angies","days",date));
}

function initApp(){
  document.querySelectorAll(".tabs button").forEach(btn=>btn.onclick=()=>show(btn.dataset.tab,btn));
  date.value=today();
  fromDate.value=today().slice(0,8)+"01";
  toDate.value=today();
  cash.value=0;
  card.value=0;
  saveBtn.onclick=saveDay;
  clearBtn.onclick=clearInput;
  exportBtn.onclick=exportCSV;
  deleteAllBtn.onclick=deleteAll;
  saveSettingsBtn.onclick=saveSettings;
  ["cash","card","fromDate","toDate"].forEach(id=>document.getElementById(id).addEventListener("input",renderAll));
  renderAll();
}

function show(id,btn){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderAll();
}

function renderAll(){renderHours();renderDashboard();renderHistory();renderStats();renderSettings();calculate();}

function splitRecord(r){
  const pct=state.kitchenPercent/100;
  return {
    cash:r.cash||0,
    card:r.card||0,
    total:r.total||((r.cash||0)+(r.card||0)),
    salaCash:r.salaCash ?? ((r.cash||0)*(1-pct)),
    salaCard:r.salaCard ?? ((r.card||0)*(1-pct)),
    cucinaCash:r.cucinaCash ?? ((r.cash||0)*pct),
    cucinaCard:r.cucinaCard ?? ((r.card||0)*pct),
    sala:r.sala ?? (((r.cash||0)+(r.card||0))*(1-pct)),
    kitchen:r.kitchen ?? (((r.cash||0)+(r.card||0))*pct),
  }
}

function renderHours(){
  let html="<tr><th>Dipendente</th><th>Ore</th><th>Cash</th><th>Carta</th><th>Totale</th></tr>";
  state.employees.forEach((name,i)=>{
    html+=`<tr><td>${name}</td><td><input class="hour" data-i="${i}" type="number" step="0.25" min="0" oninput="window.calculate()"></td><td id="cashTip${i}" class="cash-col">${euro(0)}</td><td id="cardTip${i}" class="card-col">${euro(0)}</td><td id="totalTip${i}">${euro(0)}</td></tr>`;
  });
  hoursTable.innerHTML=html;
}

function inputData(){
  const cashV=+cash.value||0;
  const cardV=+card.value||0;
  const hours=[...document.querySelectorAll(".hour")].map(x=>+x.value||0);
  const totalHours=hours.reduce((a,b)=>a+b,0);
  const pct=state.kitchenPercent/100;
  const total=cashV+cardV;
  const cucinaCash=cashV*pct;
  const cucinaCard=cardV*pct;
  const salaCash=cashV*(1-pct);
  const salaCard=cardV*(1-pct);
  const kitchen=cucinaCash+cucinaCard;
  const sala=salaCash+salaCard;
  return {date:date.value,cash:cashV,card:cardV,hours,totalHours,total,kitchen,sala,cucinaCash,cucinaCard,salaCash,salaCard,cashHour:totalHours?salaCash/totalHours:0,cardHour:totalHours?salaCard/totalHours:0};
}

window.calculate=function calculate(){
  const d=inputData();
  kSalaCash.textContent=euro(d.salaCash);
  kSalaCard.textContent=euro(d.salaCard);
  kCucinaCash.textContent=euro(d.cucinaCash);
  kCucinaCard.textContent=euro(d.cucinaCard);
  kHours.textContent=d.totalHours;
  kPerHour.textContent=euro(d.totalHours?d.sala/d.totalHours:0);
  state.employees.forEach((_,i)=>{
    const c=d.hours[i]*d.cashHour, ca=d.hours[i]*d.cardHour, t=c+ca;
    const a=document.getElementById("cashTip"+i); if(a) a.textContent=euro(c);
    const b=document.getElementById("cardTip"+i); if(b) b.textContent=euro(ca);
    const e=document.getElementById("totalTip"+i); if(e) e.textContent=euro(t);
  });
}

async function saveDay(){
  const d=inputData();
  if(!d.date) return alert("Inserisci la data.");
  if(d.total<=0) return alert("Inserisci Cash o Carta.");
  if(d.totalHours<=0) return alert("Inserisci almeno un'ora lavorata.");
  const tips=state.employees.map((name,i)=>({name,hours:d.hours[i],cash:d.hours[i]*d.cashHour,card:d.hours[i]*d.cardHour,total:d.hours[i]*(d.cashHour+d.cardHour)}));
  const record={date:d.date,cash:d.cash,card:d.card,kitchen:d.kitchen,sala:d.sala,total:d.total,cucinaCash:d.cucinaCash,cucinaCard:d.cucinaCard,salaCash:d.salaCash,salaCard:d.salaCard,tips};
  const idx=state.history.findIndex(r=>r.date===d.date);
  if(idx>=0){
    if(!confirm("Questa data esiste già. Vuoi aggiornarla?")) return;
    state.history[idx]=record;
  }else{
    state.history.push(record);
  }
  state.history.sort((a,b)=>a.date.localeCompare(b.date));
  await saveDayCloud(record);
  clearInput(false);
  renderAll();
  alert("Giornata salvata online.");
}

function clearInput(resetDate=true){
  if(resetDate) date.value=today();
  cash.value=0;
  card.value=0;
  document.querySelectorAll(".hour").forEach(x=>x.value="");
  window.calculate();
}

function sumRows(rows, key){return rows.reduce((s,r)=>s+(splitRecord(r)[key]||0),0)}

function renderDashboard(){
  const rows=state.history;
  dashTotal.textContent=euro(sumRows(rows,"total"));
  dashCash.textContent=euro(sumRows(rows,"cash"));
  dashCard.textContent=euro(sumRows(rows,"card"));
  dashSala.textContent=euro(sumRows(rows,"sala"));
  dashSalaCash.textContent=euro(sumRows(rows,"salaCash"));
  dashSalaCard.textContent=euro(sumRows(rows,"salaCard"));
  dashCucina.textContent=euro(sumRows(rows,"kitchen"));
  dashCucinaCash.textContent=euro(sumRows(rows,"cucinaCash"));
  dashCucinaCard.textContent=euro(sumRows(rows,"cucinaCard"));
  dashDays.textContent=state.history.length;
  const recent=[...state.history].slice(-7).reverse();
  recentTable.innerHTML="<tr><th>Data</th><th>Cash</th><th>Carta</th><th>Sala Cash</th><th>Sala Carta</th><th>Cucina Cash</th><th>Cucina Carta</th><th>Totale</th></tr>"+recent.map(r=>{const s=splitRecord(r);return `<tr><td>${fmtDate(r.date)}</td><td class="cash-col">${euro(s.cash)}</td><td class="card-col">${euro(s.card)}</td><td class="cash-col">${euro(s.salaCash)}</td><td class="card-col">${euro(s.salaCard)}</td><td class="cash-col">${euro(s.cucinaCash)}</td><td class="card-col">${euro(s.cucinaCard)}</td><td>${euro(s.total)}</td></tr>`}).join("");
}

function renderHistory(){
  let html="<tr><th>Data</th>";
  state.employees.forEach(n=>{html+=`<th>${n} Cash</th><th>${n} Carta</th><th>${n} Totale</th>`});
  html+="<th>Sala Cash</th><th>Sala Carta</th><th>Sala Totale</th><th>Cucina Cash</th><th>Cucina Carta</th><th>Cucina Totale</th><th>Totale Giorno</th><th></th></tr>";
  state.history.forEach((r,idx)=>{
    const s=splitRecord(r);
    html+=`<tr><td>${fmtDate(r.date)}</td>`;
    state.employees.forEach((_,i)=>{
      const t=r.tips[i]||{};
      html+=`<td class="${t.cash?'cash-col':'absent'}">${t.cash?euro(t.cash):""}</td><td class="${t.card?'card-col':'absent'}">${t.card?euro(t.card):""}</td><td>${t.total?euro(t.total):""}</td>`;
    });
    html+=`<td class="cash-col">${euro(s.salaCash)}</td><td class="card-col">${euro(s.salaCard)}</td><td>${euro(s.sala)}</td><td class="cash-col">${euro(s.cucinaCash)}</td><td class="card-col">${euro(s.cucinaCard)}</td><td>${euro(s.kitchen)}</td><td>${euro(s.total)}</td><td><button onclick="window.deleteDay(${idx})">X</button></td></tr>`;
  });
  historyTable.innerHTML=html;
}

window.deleteDay=async function(i){
  if(confirm("Cancellare questa giornata?")){
    const dateToDelete=state.history[i].date;
    state.history.splice(i,1);
    await deleteDayCloud(dateToDelete);
    renderAll();
  }
}

async function deleteAll(){
  if(!confirm("Cancellare tutto lo storico online?")) return;
  for(const r of state.history) await deleteDayCloud(r.date);
  state.history=[];
  renderAll();
}

function renderStats(){
  const from=fromDate.value||"0000-01-01";
  const to=toDate.value||"9999-12-31";
  const rows=state.history.filter(r=>r.date>=from&&r.date<=to);
  sCash.textContent=euro(sumRows(rows,"cash"));
  sCard.textContent=euro(sumRows(rows,"card"));
  sTotal.textContent=euro(sumRows(rows,"total"));
  sSala.textContent=euro(sumRows(rows,"sala"));
  sSalaCash.textContent=euro(sumRows(rows,"salaCash"));
  sSalaCard.textContent=euro(sumRows(rows,"salaCard"));
  sCucina.textContent=euro(sumRows(rows,"kitchen"));
  sCucinaCash.textContent=euro(sumRows(rows,"cucinaCash"));
  sCucinaCard.textContent=euro(sumRows(rows,"cucinaCard"));

  let data=state.employees.map((name,i)=>{
    const hours=rows.reduce((s,r)=>s+(r.tips[i]?.hours||0),0);
    const cash=rows.reduce((s,r)=>s+(r.tips[i]?.cash||0),0);
    const card=rows.reduce((s,r)=>s+(r.tips[i]?.card||0),0);
    const total=rows.reduce((s,r)=>s+(r.tips[i]?.total||0),0);
    const days=rows.filter(r=>(r.tips[i]?.hours||0)>0).length;
    return {name,hours,cash,card,total,days};
  }).sort((a,b)=>b.total-a.total);

  statsTable.innerHTML=
    "<tr><th>Dipendente</th><th>Ore</th><th>Cash</th><th>Carta</th><th>Totale</th><th>Giorni</th><th>Media/giorno</th><th>Media/ora</th><th>Rank</th></tr>"+
    data.map((x,i)=>`<tr><td>${x.name}</td><td>${x.hours}</td><td class="cash-col">${euro(x.cash)}</td><td class="card-col">${euro(x.card)}</td><td>${euro(x.total)}</td><td>${x.days}</td><td>${euro(x.days?x.total/x.days:0)}</td><td>${euro(x.hours?x.total/x.hours:0)}</td><td>${i+1}</td></tr>`).join("");
}

function renderSettings(){
  kitchenPercent.value=state.kitchenPercent;
  employeesTable.innerHTML="<tr><th>N.</th><th>Nome</th></tr>"+state.employees.map((n,i)=>`<tr><td>${i+1}</td><td><input class="empName" value="${n}"></td></tr>`).join("");
}

async function saveSettings(){
  state.kitchenPercent=+kitchenPercent.value||20;
  state.employees=[...document.querySelectorAll(".empName")].map(x=>x.value.trim()||"Dipendente");
  await saveSettingsCloud();
  renderAll(); alert("Impostazioni salvate online.");
}

function exportCSV(){
  const headers=["Data"];
  state.employees.forEach(n=>{headers.push(`${n} Cash`,`${n} Carta`,`${n} Totale`)});
  headers.push("Sala Cash","Sala Carta","Sala Totale","Cucina Cash","Cucina Carta","Cucina Totale","Totale Giorno");
  const rows=[headers.join(";")];
  state.history.forEach(r=>{
    const s=splitRecord(r);
    const line=[fmtDate(r.date)];
    state.employees.forEach((_,i)=>{line.push((r.tips[i]?.cash||0).toFixed(2).replace(".",","),(r.tips[i]?.card||0).toFixed(2).replace(".",","),(r.tips[i]?.total||0).toFixed(2).replace(".",","))});
    line.push(s.salaCash.toFixed(2).replace(".",","),s.salaCard.toFixed(2).replace(".",","),s.sala.toFixed(2).replace(".",","),s.cucinaCash.toFixed(2).replace(".",","),s.cucinaCard.toFixed(2).replace(".",","),s.kitchen.toFixed(2).replace(".",","),s.total.toFixed(2).replace(".",","));
    rows.push(line.join(";"));
  });
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([rows.join("\\n")],{type:"text/csv"}));
  a.download="storico_mance_cash_carta.csv";
  a.click();
}

function fmtDate(d){return new Date(d+"T00:00:00").toLocaleDateString("it-IT");}


let chatUnsub=null;

function listenChat(){
  if(chatUnsub) chatUnsub();
  const q=query(collection(fs,"restaurants","angies","chat"),orderBy("createdAt","asc"));
  chatUnsub=onSnapshot(q,snap=>{
    const box=document.getElementById("chatBox");
    if(!box) return;
    box.innerHTML="";
    snap.forEach(d=>{
      const m=d.data();
      const mine=currentUser && m.email===currentUser.email;
      const time=m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString("it-IT") : "";
      box.innerHTML += `<div class="msg ${mine?'me':''}"><strong>${m.name||m.email||"Utente"}</strong>${escapeHtml(m.text||"")}<br><span>${time}</span></div>`;
    });
    box.scrollTop=box.scrollHeight;
  });
}

async function sendChat(){
  const input=document.getElementById("chatMessage");
  const text=input.value.trim();
  if(!text) return;
  await addDoc(collection(fs,"restaurants","angies","chat"),{
    text,
    email:currentUser.email,
    name:currentUser.email.split("@")[0],
    createdAt:serverTimestamp()
  });
  input.value="";
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
