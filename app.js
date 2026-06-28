const DEFAULT_NAMES=["Diego","Sunkar","Silvano","Giuseppe","Vitalin","Davide","Zara","Lisa","Anna","Niko","Raffa","Alex"];
let state=JSON.parse(localStorage.getItem("angiesTipsState")||"null")||{employees:DEFAULT_NAMES,kitchenPercent:20,history:[]};

const euro=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(n)||0);
const today=()=>new Date().toISOString().slice(0,10);
const saveState=()=>localStorage.setItem("angiesTipsState",JSON.stringify(state));

function init(){
  document.querySelectorAll(".tabs button").forEach(btn=>btn.onclick=()=>show(btn.dataset.tab,btn));
  document.getElementById("date").value=today();
  document.getElementById("fromDate").value=today().slice(0,8)+"01";
  document.getElementById("toDate").value=today();
  document.getElementById("cash").value=0;
  document.getElementById("card").value=0;
  document.getElementById("saveBtn").onclick=saveDay;
  document.getElementById("clearBtn").onclick=clearInput;
  document.getElementById("exportBtn").onclick=exportCSV;
  document.getElementById("deleteAllBtn").onclick=deleteAll;
  document.getElementById("saveSettingsBtn").onclick=saveSettings;
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

function renderHours(){
  let html="<tr><th>Dipendente</th><th>Ore</th><th>Cash</th><th>Carta</th><th>Totale</th></tr>";
  state.employees.forEach((name,i)=>{
    html+=`<tr><td>${name}</td><td><input class="hour" data-i="${i}" type="number" step="0.25" min="0" oninput="calculate()"></td><td id="cashTip${i}">${euro(0)}</td><td id="cardTip${i}">${euro(0)}</td><td id="totalTip${i}">${euro(0)}</td></tr>`;
  });
  document.getElementById("hoursTable").innerHTML=html;
}

function inputData(){
  const cash=+document.getElementById("cash").value||0;
  const card=+document.getElementById("card").value||0;
  const hours=[...document.querySelectorAll(".hour")].map(x=>+x.value||0);
  const totalHours=hours.reduce((a,b)=>a+b,0);
  const total=cash+card;
  const kitchen=total*(state.kitchenPercent/100);
  const sala=total-kitchen;
  return {date:document.getElementById("date").value,cash,card,hours,totalHours,total,kitchen,sala,cashHour:totalHours?cash*(1-state.kitchenPercent/100)/totalHours:0,cardHour:totalHours?card*(1-state.kitchenPercent/100)/totalHours:0};
}

function calculate(){
  const d=inputData();
  document.getElementById("kKitchen").textContent=euro(d.kitchen);
  document.getElementById("kSala").textContent=euro(d.sala);
  document.getElementById("kHours").textContent=d.totalHours;
  document.getElementById("kPerHour").textContent=euro(d.totalHours?d.sala/d.totalHours:0);
  state.employees.forEach((_,i)=>{
    const c=d.hours[i]*d.cashHour, ca=d.hours[i]*d.cardHour, t=c+ca;
    const a=document.getElementById("cashTip"+i); if(a) a.textContent=euro(c);
    const b=document.getElementById("cardTip"+i); if(b) b.textContent=euro(ca);
    const e=document.getElementById("totalTip"+i); if(e) e.textContent=euro(t);
  });
}

function saveDay(){
  const d=inputData();
  if(!d.date) return alert("Inserisci la data.");
  if(d.total<=0) return alert("Inserisci Cash o Carta.");
  if(d.totalHours<=0) return alert("Inserisci almeno un'ora lavorata.");
  const tips=state.employees.map((name,i)=>({name,hours:d.hours[i],cash:d.hours[i]*d.cashHour,card:d.hours[i]*d.cardHour,total:d.hours[i]*(d.cashHour+d.cardHour)}));
  const record={date:d.date,cash:d.cash,card:d.card,kitchen:d.kitchen,sala:d.sala,total:d.total,tips};
  const idx=state.history.findIndex(r=>r.date===d.date);
  if(idx>=0){
    if(!confirm("Questa data esiste già. Vuoi aggiornarla?")) return;
    state.history[idx]=record;
  }else{
    state.history.push(record);
  }
  state.history.sort((a,b)=>a.date.localeCompare(b.date));
  saveState();
  clearInput(false);
  renderAll();
  alert("Giornata salvata.");
}

function clearInput(resetDate=true){
  if(resetDate) document.getElementById("date").value=today();
  document.getElementById("cash").value=0;
  document.getElementById("card").value=0;
  document.querySelectorAll(".hour").forEach(x=>x.value="");
  calculate();
}

function renderDashboard(){
  document.getElementById("dashTotal").textContent=euro(state.history.reduce((s,r)=>s+r.total,0));
  document.getElementById("dashSala").textContent=euro(state.history.reduce((s,r)=>s+r.sala,0));
  document.getElementById("dashCucina").textContent=euro(state.history.reduce((s,r)=>s+r.kitchen,0));
  document.getElementById("dashDays").textContent=state.history.length;
  const recent=[...state.history].slice(-7).reverse();
  document.getElementById("recentTable").innerHTML="<tr><th>Data</th><th>Totale</th><th>Sala</th><th>Cucina</th></tr>"+recent.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${euro(r.total)}</td><td>${euro(r.sala)}</td><td>${euro(r.kitchen)}</td></tr>`).join("");
}

function renderHistory(){
  let html="<tr><th>Data</th>"+state.employees.map(n=>`<th>${n}</th>`).join("")+"<th>Sala</th><th>Cucina</th><th>Totale</th><th></th></tr>";
  state.history.forEach((r,idx)=>{
    html+=`<tr><td>${fmtDate(r.date)}</td>`+state.employees.map((_,i)=>`<td class="${r.tips[i]?.total?"" :"absent"}">${r.tips[i]?.total?euro(r.tips[i].total):""}</td>`).join("")+`<td>${euro(r.sala)}</td><td>${euro(r.kitchen)}</td><td>${euro(r.total)}</td><td><button onclick="deleteDay(${idx})">X</button></td></tr>`;
  });
  let totals=state.employees.map((_,i)=>state.history.reduce((s,r)=>s+(r.tips[i]?.total||0),0));
  html+=`<tr class="total-row"><td>Totale</td>`+totals.map(v=>`<td>${euro(v)}</td>`).join("")+`<td>${euro(state.history.reduce((s,r)=>s+r.sala,0))}</td><td>${euro(state.history.reduce((s,r)=>s+r.kitchen,0))}</td><td>${euro(state.history.reduce((s,r)=>s+r.total,0))}</td><td></td></tr>`;
  document.getElementById("historyTable").innerHTML=html;
}

function deleteDay(i){if(confirm("Cancellare questa giornata?")){state.history.splice(i,1);saveState();renderAll();}}
function deleteAll(){if(confirm("Cancellare tutto lo storico?")){state.history=[];saveState();renderAll();}}

function renderStats(){
  const from=document.getElementById("fromDate").value||"0000-01-01";
  const to=document.getElementById("toDate").value||"9999-12-31";
  const rows=state.history.filter(r=>r.date>=from&&r.date<=to);
  document.getElementById("sCash").textContent=euro(rows.reduce((s,r)=>s+r.cash,0));
  document.getElementById("sCard").textContent=euro(rows.reduce((s,r)=>s+r.card,0));
  document.getElementById("sSala").textContent=euro(rows.reduce((s,r)=>s+r.sala,0));
  document.getElementById("sCucina").textContent=euro(rows.reduce((s,r)=>s+r.kitchen,0));
  let data=state.employees.map((name,i)=>{
    const hours=rows.reduce((s,r)=>s+(r.tips[i]?.hours||0),0);
    const total=rows.reduce((s,r)=>s+(r.tips[i]?.total||0),0);
    const days=rows.filter(r=>(r.tips[i]?.hours||0)>0).length;
    return {name,hours,total,days};
  }).sort((a,b)=>b.total-a.total);
  document.getElementById("statsTable").innerHTML="<tr><th>Dipendente</th><th>Ore</th><th>Totale</th><th>Giorni</th><th>Media/giorno</th><th>Media/ora</th><th>Rank</th></tr>"+data.map((x,i)=>`<tr><td>${x.name}</td><td>${x.hours}</td><td>${euro(x.total)}</td><td>${x.days}</td><td>${euro(x.days?x.total/x.days:0)}</td><td>${euro(x.hours?x.total/x.hours:0)}</td><td>${i+1}</td></tr>`).join("");
}

function renderSettings(){
  document.getElementById("kitchenPercent").value=state.kitchenPercent;
  document.getElementById("employeesTable").innerHTML="<tr><th>N.</th><th>Nome</th></tr>"+state.employees.map((n,i)=>`<tr><td>${i+1}</td><td><input class="empName" value="${n}"></td></tr>`).join("");
}

function saveSettings(){
  state.kitchenPercent=+document.getElementById("kitchenPercent").value||20;
  state.employees=[...document.querySelectorAll(".empName")].map(x=>x.value.trim()||"Dipendente");
  saveState(); renderAll(); alert("Impostazioni salvate.");
}

function exportCSV(){
  const headers=["Data",...state.employees,"Sala","Cucina","Totale"];
  const rows=[headers.join(";")];
  state.history.forEach(r=>{
    rows.push([fmtDate(r.date),...state.employees.map((_,i)=>(r.tips[i]?.total||0).toFixed(2).replace(".",",")),r.sala.toFixed(2).replace(".",","),r.kitchen.toFixed(2).replace(".",","),r.total.toFixed(2).replace(".",",")].join(";"));
  });
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([rows.join("\\n")],{type:"text/csv"}));
  a.download="storico_mance.csv";
  a.click();
}

function fmtDate(d){return new Date(d+"T00:00:00").toLocaleDateString("it-IT");}

init();
