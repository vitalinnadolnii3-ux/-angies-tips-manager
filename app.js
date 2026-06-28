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
    html+=`<tr><td>${name}</td><td><input class="hour" data-i="${i}" type="number" step="0.25" min="0" oninput="calculate()"></td><td id="cashTip${i}" class="cash-col">${euro(0)}</td><td id="cardTip${i}" class="card-col">${euro(0)}</td><td id="totalTip${i}">${euro(0)}</td></tr>`;
  });
  document.getElementById("hoursTable").innerHTML=html;
}

function inputData(){
  const cash=+document.getElementById("cash").value||0;
  const card=+document.getElementById("card").value||0;
  const hours=[...document.querySelectorAll(".hour")].map(x=>+x.value||0);
  const totalHours=hours.reduce((a,b)=>a+b,0);
  const pct=state.kitchenPercent/100;
  const total=cash+card;
  const cucinaCash=cash*pct;
  const cucinaCard=card*pct;
  const salaCash=cash*(1-pct);
  const salaCard=card*(1-pct);
  const kitchen=cucinaCash+cucinaCard;
  const sala=salaCash+salaCard;
  return {date:document.getElementById("date").value,cash,card,hours,totalHours,total,kitchen,sala,cucinaCash,cucinaCard,salaCash,salaCard,cashHour:totalHours?salaCash/totalHours:0,cardHour:totalHours?salaCard/totalHours:0};
}

function calculate(){
  const d=inputData();
  document.getElementById("kSalaCash").textContent=euro(d.salaCash);
  document.getElementById("kSalaCard").textContent=euro(d.salaCard);
  document.getElementById("kCucinaCash").textContent=euro(d.cucinaCash);
  document.getElementById("kCucinaCard").textContent=euro(d.cucinaCard);
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
  const record={date:d.date,cash:d.cash,card:d.card,kitchen:d.kitchen,sala:d.sala,total:d.total,cucinaCash:d.cucinaCash,cucinaCard:d.cucinaCard,salaCash:d.salaCash,salaCard:d.salaCard,tips};
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

function sumRows(rows, key){return rows.reduce((s,r)=>s+(splitRecord(r)[key]||0),0)}

function renderDashboard(){
  const rows=state.history;
  document.getElementById("dashTotal").textContent=euro(sumRows(rows,"total"));
  document.getElementById("dashCash").textContent=euro(sumRows(rows,"cash"));
  document.getElementById("dashCard").textContent=euro(sumRows(rows,"card"));
  document.getElementById("dashSala").textContent=euro(sumRows(rows,"sala"));
  document.getElementById("dashSalaCash").textContent=euro(sumRows(rows,"salaCash"));
  document.getElementById("dashSalaCard").textContent=euro(sumRows(rows,"salaCard"));
  document.getElementById("dashCucina").textContent=euro(sumRows(rows,"kitchen"));
  document.getElementById("dashCucinaCash").textContent=euro(sumRows(rows,"cucinaCash"));
  document.getElementById("dashCucinaCard").textContent=euro(sumRows(rows,"cucinaCard"));
  document.getElementById("dashDays").textContent=state.history.length;
  const recent=[...state.history].slice(-7).reverse();
  document.getElementById("recentTable").innerHTML="<tr><th>Data</th><th>Cash</th><th>Carta</th><th>Sala Cash</th><th>Sala Carta</th><th>Cucina Cash</th><th>Cucina Carta</th><th>Totale</th></tr>"+recent.map(r=>{const s=splitRecord(r);return `<tr><td>${fmtDate(r.date)}</td><td class="cash-col">${euro(s.cash)}</td><td class="card-col">${euro(s.card)}</td><td class="cash-col">${euro(s.salaCash)}</td><td class="card-col">${euro(s.salaCard)}</td><td class="cash-col">${euro(s.cucinaCash)}</td><td class="card-col">${euro(s.cucinaCard)}</td><td>${euro(s.total)}</td></tr>`}).join("");
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
    html+=`<td class="cash-col">${euro(s.salaCash)}</td><td class="card-col">${euro(s.salaCard)}</td><td>${euro(s.sala)}</td><td class="cash-col">${euro(s.cucinaCash)}</td><td class="card-col">${euro(s.cucinaCard)}</td><td>${euro(s.kitchen)}</td><td>${euro(s.total)}</td><td><button onclick="deleteDay(${idx})">X</button></td></tr>`;
  });
  html+=`<tr class="total-row"><td>Totale</td>`;
  state.employees.forEach((_,i)=>{
    html+=`<td>${euro(state.history.reduce((s,r)=>s+(r.tips[i]?.cash||0),0))}</td><td>${euro(state.history.reduce((s,r)=>s+(r.tips[i]?.card||0),0))}</td><td>${euro(state.history.reduce((s,r)=>s+(r.tips[i]?.total||0),0))}</td>`;
  });
  html+=`<td>${euro(sumRows(state.history,"salaCash"))}</td><td>${euro(sumRows(state.history,"salaCard"))}</td><td>${euro(sumRows(state.history,"sala"))}</td><td>${euro(sumRows(state.history,"cucinaCash"))}</td><td>${euro(sumRows(state.history,"cucinaCard"))}</td><td>${euro(sumRows(state.history,"kitchen"))}</td><td>${euro(sumRows(state.history,"total"))}</td><td></td></tr>`;
  document.getElementById("historyTable").innerHTML=html;
}

function deleteDay(i){if(confirm("Cancellare questa giornata?")){state.history.splice(i,1);saveState();renderAll();}}
function deleteAll(){if(confirm("Cancellare tutto lo storico?")){state.history=[];saveState();renderAll();}}

function renderStats(){
  const from=document.getElementById("fromDate").value||"0000-01-01";
  const to=document.getElementById("toDate").value||"9999-12-31";
  const rows=state.history.filter(r=>r.date>=from&&r.date<=to);
  document.getElementById("sCash").textContent=euro(sumRows(rows,"cash"));
  document.getElementById("sCard").textContent=euro(sumRows(rows,"card"));
  document.getElementById("sTotal").textContent=euro(sumRows(rows,"total"));
  document.getElementById("sSala").textContent=euro(sumRows(rows,"sala"));
  document.getElementById("sSalaCash").textContent=euro(sumRows(rows,"salaCash"));
  document.getElementById("sSalaCard").textContent=euro(sumRows(rows,"salaCard"));
  document.getElementById("sCucina").textContent=euro(sumRows(rows,"kitchen"));
  document.getElementById("sCucinaCash").textContent=euro(sumRows(rows,"cucinaCash"));
  document.getElementById("sCucinaCard").textContent=euro(sumRows(rows,"cucinaCard"));

  let data=state.employees.map((name,i)=>{
    const hours=rows.reduce((s,r)=>s+(r.tips[i]?.hours||0),0);
    const cash=rows.reduce((s,r)=>s+(r.tips[i]?.cash||0),0);
    const card=rows.reduce((s,r)=>s+(r.tips[i]?.card||0),0);
    const total=rows.reduce((s,r)=>s+(r.tips[i]?.total||0),0);
    const days=rows.filter(r=>(r.tips[i]?.hours||0)>0).length;
    return {name,hours,cash,card,total,days};
  }).sort((a,b)=>b.total-a.total);

  document.getElementById("statsTable").innerHTML=
    "<tr><th>Dipendente</th><th>Ore</th><th>Cash</th><th>Carta</th><th>Totale</th><th>Giorni</th><th>Media/giorno</th><th>Media/ora</th><th>Rank</th></tr>"+
    data.map((x,i)=>`<tr><td>${x.name}</td><td>${x.hours}</td><td class="cash-col">${euro(x.cash)}</td><td class="card-col">${euro(x.card)}</td><td>${euro(x.total)}</td><td>${x.days}</td><td>${euro(x.days?x.total/x.days:0)}</td><td>${euro(x.hours?x.total/x.hours:0)}</td><td>${i+1}</td></tr>`).join("");
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

init();
