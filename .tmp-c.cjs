const fs=require('fs');
const {initializeApp,cert}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const raw=fs.readFileSync('C:/Users/jange/Projects/yoties-flag-football/.env.local','utf8').split(/\r?\n/).find(l=>l.startsWith('FIREBASE_SERVICE_ACCOUNT_KEY='));
