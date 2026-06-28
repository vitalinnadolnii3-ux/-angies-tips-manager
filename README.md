# Angie's Manager v7 definitivo

Carica nella root del repository:
- index.html
- style.css
- app.js
- firebase-config.js
- firebase.json
- .firebaserc
- FIRESTORE_RULES.txt
- firestore.indexes.json
- README.md

Dopo il caricamento vai su Firebase > Firestore Database > Regole e incolla il contenuto di FIRESTORE_RULES.txt.

In alternativa puoi pubblicare automaticamente regole e indici con Firebase CLI:
- `npm install -g firebase-tools`
- `firebase login`
- `firebase deploy --only firestore`

Poi crea un utente in Firebase > Authentication > Users > Add user.

Per la gestione dipendenti admin dall'app:
- collezione Firestore: `restaurants/angies/employees/{uid}` con campi `email`, `name`, `role`, `enabled`, `createdAt`, `updatedAt`
- turni settimanali: `restaurants/angies/shifts/{shiftId}` con campi `uid`, `date`, `shiftText`, `startTime`, `endTime`, `role`, `notes`, `isRestDay`, `createdAt`, `updatedAt`
- opzionale (consigliato) Callable Functions:
  - `createEmployeeAuthUser`
  - `updateEmployeeAuthUser`
  - `deleteEmployeeAuthUser`
Se `createEmployeeAuthUser` non è disponibile, la creazione usa fallback client-side con sessione secondaria.

Apri il sito con:
https://vitalinnadolnii3-ux.github.io/-angies-tips-manager/?v=7

Nota: `firestore.indexes.json` contiene l'indice composito necessario per i turni dei dipendenti (`uid` ASC, `date` ASC).
Dopo ogni aggiornamento di regole o indici esegui `firebase deploy --only firestore` prima di usare la gestione turni.
