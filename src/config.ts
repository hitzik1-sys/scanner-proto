// זהות האפליקציה מול גוגל. ערכים ציבוריים, לא סודות:
// גוגל מקבלת אותם רק מהכתובות שאושרו בפרויקט (Authorized JavaScript origins).
export const GOOGLE = {
  clientId: '768880386402-o99iekfrktba8loomqng3is1uhsqp555.apps.googleusercontent.com',
  apiKey: 'AIzaSyDuLwLpOkneT2T9i8Wql5D7UPOmfL93FFg',
  appId: '768880386402',
};

// הרשאות בלבד. לא להוסיף הרשאה רחבה (כמו drive או gmail.readonly) בלי לשאול את המשתמש.
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // רק קבצים שהאפליקציה יצרה או שהמשתמש בחר
  'https://www.googleapis.com/auth/drive.appdata', // תיקייה נסתרת לגיבוי ההגדרות
  'https://www.googleapis.com/auth/gmail.send', // שליחת מיילים בלבד, בלי קריאה
];
