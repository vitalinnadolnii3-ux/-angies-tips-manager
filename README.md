# Angie's Manager v7 definitivo

Carica nella root del repository:
- index.html
- style.css
- app.js
- firebase-config.js
- firebase.json
- database.rules.json
- .firebaserc
- FIRESTORE_RULES.txt
- firestore.indexes.json
- README.md

Dopo il caricamento vai su Firebase > Firestore Database > Regole e incolla il contenuto di FIRESTORE_RULES.txt.
Per Realtime Database usa Firebase > Realtime Database > Regole e incolla il contenuto di `database.rules.json`.

In alternativa puoi pubblicare automaticamente regole e indici con Firebase CLI:
- `npm install -g firebase-tools`
- `firebase login`
- `firebase deploy --only firestore,database`

Poi crea solo l'utente admin bootstrap in Firebase > Authentication > Users > Add user. Gli altri dipendenti vengono creati automaticamente dalla tab Dipendenti con password iniziale `angiesroma`.

Per la gestione dipendenti admin dall'app:
- collezione Firestore: `restaurants/angies/employees/{uid}` con campi `email`, `name`, `role`, `enabled`, `createdAt`, `updatedAt`
- utenti RTDB: `users/{uid}` con campi `email`, `name`, `role`, `active` usati per RBAC di turni/attendance
- turni settimanali: `restaurants/angies/shifts/{shiftId}` con campi `uid`, `date`, `shiftText`, `startTime`, `endTime`, `role`, `notes`, `isRestDay`, `createdAt`, `updatedAt`
- attendance RTDB: `attendance/{date}/{uid}` con campi `entryTime`, `exitTime`, `pauseMinutes`, `workedMinutes`, `scheduledShiftText`, `delayMinutes`, `earlyLeaveMinutes`, `notes`, `updatedAt`, `updatedBy`
- opzionale (consigliato) Callable Functions:
  - `createEmployeeAuthUser`
  - `updateEmployeeAuthUser`
  - `deleteEmployeeAuthUser`
Se `createEmployeeAuthUser` non è disponibile, la creazione usa fallback client-side con sessione secondaria.
Il pulsante "Reimposta password" prova prima a riportare la password a `angiesroma` tramite `updateEmployeeAuthUser`; se la funzione non è disponibile, invia automaticamente l'email di reset di Firebase.

Apri il sito con:
https://vitalinnadolnii3-ux.github.io/-angies-tips-manager/?v=7

Nota: `firestore.indexes.json` contiene l'indice composito necessario per i turni dei dipendenti (`uid` ASC, `date` ASC).
Prima di bloccare Realtime Database con le regole versionate, assicurati che `users/{uid}` contenga almeno i profili dei membri che devono accedere a turni/attendance (l'app li mantiene sincronizzati durante login e aggiornamenti admin).
Dopo ogni aggiornamento di regole o indici esegui `firebase deploy --only firestore,database` prima di usare la gestione turni o l'area entrata/uscita.

Bootstrap admin: se cambi l'email admin preconfigurata, cerca l'indirizzo corrente e aggiornalo negli stessi tre punti `app.js`, `FIRESTORE_RULES.txt` e `database.rules.json`, poi ridistribuisci l'app e le regole Firebase.
