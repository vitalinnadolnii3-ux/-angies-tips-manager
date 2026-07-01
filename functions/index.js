// NOTE: This file must also include the existing deployed Cloud Functions:
//   createEmployeeAuthUser, updateEmployeeAuthUser, deleteEmployeeAuthUser
// Add those exports here to avoid losing them on the next `firebase deploy --only functions`.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Generates a Firebase password reset link for an employee's email address.
 * Returns { link: string } — a direct, clickable URL the employee can use
 * to set a new password without needing to copy-paste anything.
 *
 * Only authenticated admin users (role === 'admin' in
 * /restaurants/angies/users/{uid}) may call this function.
 */
exports.generatePasswordResetLink = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Autenticazione richiesta.');
  }

  // Verify that the caller holds the admin role in Firestore.
  const callerSnap = await admin.firestore()
    .collection('restaurants').doc('angies')
    .collection('users').doc(request.auth.uid)
    .get();

  if (
    !callerSnap.exists ||
    String(callerSnap.data().role || '').toLowerCase() !== 'admin'
  ) {
    throw new HttpsError('permission-denied', 'Solo gli admin possono generare link di reset.');
  }

  const { email } = request.data || {};
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new HttpsError('invalid-argument', 'Email richiesta.');
  }

  try {
    const link = await admin.auth().generatePasswordResetLink(email.trim().toLowerCase());
    return { link };
  } catch (e) {
    throw new HttpsError('internal', 'Generazione link fallita: ' + e.message);
  }
});
