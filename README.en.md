# Document Scanner – Prototype

[עברית](README.md) · English

A prototype that tests the three risky parts before full development:

1. **Scanning:** page edge detection, cropping and perspective correction in the browser (OpenCV.js).
2. **Hebrew text recognition (OCR):** via Google Drive, compared with Tesseract running on the phone.
3. **Sharing:** whether a family member can read your folder through the app, using only the `drive.file` permission.

Tab 1 works with no setup. Tabs 2 and 3 need a Google connection (steps A–C below).

The app's interface is in Hebrew. Tab names: **1. סריקה** (Scan), **2. זיהוי טקסט** (Text recognition), **3. שיתוף** (Sharing), **הגדרות** (Settings).

## A. Free hosting (GitHub Pages)

The camera and Google sign-in only work over `https`, so the folder has to be hosted on a site.

1. Sign in to [github.com](https://github.com) (or create a free account).
2. Click **New repository**, give it a name (for example `scanner-proto`), choose **Public** and click **Create repository**.
3. On the empty repository page, click **uploading an existing file**, drag in **all the files and the `js` folder** from the `prototype` folder, and click **Commit changes**.
4. **Settings → Pages**: under *Branch* choose `main` and `/ (root)`, then click **Save**.
5. After a minute or two, the site is live at `https://<username>.github.io/scanner-proto/`.

## B. Google project (free)

At [console.cloud.google.com](https://console.cloud.google.com):

1. **New project:** in the project menu at the top → **New project** → name: `Scanner` → **Create**.
2. **Enable APIs:** *APIs & Services → Library*. Search for and **Enable**:
   - **Google Drive API**
   - **Google Picker API**
3. **Consent screen:** *APIs & Services → OAuth consent screen* (also called *Google Auth Platform*):
   - **Get started** → app name: `Document Scanner`, support email: your email.
   - Audience: **External**.
   - Under **Audience → Test users**, add your email and the emails of the family members taking part in the test.
   - Under **Data access**, add the `.../auth/drive.file` scope.
4. **Sign-in client ID:** *Clients* (or *Credentials*) → **Create client** → type **Web application**.
   - Under **Authorized JavaScript origins**, add:
     - `https://<username>.github.io` (no path, no trailing `/`)
     - `http://localhost:8080` (for testing on a computer; optional)
   - Click **Create** and copy the **Client ID**.
5. **API key for the file picker:** *Credentials* → **Create credentials → API key**. Copy it.
   - Recommended: **Edit API key** → *API restrictions* → **Google Picker API** only, and under *Website restrictions* add `https://<username>.github.io/*`.
6. **App ID:** on the project home page (*Dashboard* / *Project settings*), copy the **Project number** (digits only).

## C. Enter the values

Two options:

- **Easiest for the family:** on GitHub, open `config.js`, click the pencil icon, paste the three values and save (*Commit changes*). Everyone who opens the site gets them automatically.
- **For one phone only:** in the app, open the **הגדרות** (Settings) tab, paste the values and tap **שמור** (Save).

These three values are not secret. They identify the app; they do not give access to anyone's account.

## D. What to test on the phone

Open the site in Chrome. Recommended: menu ⋮ → **Add to Home screen**.

**1. Scanning**

- [ ] Scan 3–4 real documents: a page on a dark table, a page on a light table, a small crumpled receipt, a page in dim light.
- [ ] For each one: take the photo with the **צלם** (Capture) button (manual mode, the default). Were the corners detected correctly after the photo? How many manual corrections were needed?
- [ ] Also try **מצב אוטומטי** (Auto mode): does the live frame catch the page, and does auto-capture work?
- [ ] Dragging corners: does the magnifier help you place them precisely?
- [ ] Try all three filters. Which one looks best?
- [ ] A 2–3 page document → **סיימתי** (Done) → **שתף** (Share): do WhatsApp and Gmail appear in the share sheet, and does the file arrive intact?

**2. Text recognition** (requires sign-in)

- [ ] **המסמך מהסריקה** (Document from scan) → **הרץ זיהוי דרך דרייב** (Run recognition via Drive). Check how much of the text was recognized correctly.
- [ ] The same document with **Tesseract**, for comparison. Note the time and the quality.
- [ ] Repeat with the sample document, and with a handwritten document if you have one.

**3. Sharing** (requires two Google accounts, both listed under Test users)

- [ ] In your account: **צור / עדכן תיקיית בדיקה** (Create / update test folder), type the family member's email → **שתף לצפייה** (Share for viewing).
- [ ] In the family member's account (on their phone, or via **החלף חשבון** – Switch account – at the top): **בחר תיקייה ששותפה איתי** (Pick a folder shared with me). Note which checks passed ✓ and which failed ✗.
- [ ] The same with **בחר את קובץ האינדקס** (Pick the index file).
- [ ] If the file picker doesn't open or doesn't work on the phone, try the same step on a computer with the same account. The permission is granted to the account, not the device, so this could be a one-time step done on a computer.

## E. Sending back the results

In the **הגדרות** (Settings) tab → **העתק סיכום** (Copy summary), then paste it into the conversation. Every check you run is recorded there automatically, with timings and device details.

## F. What we actually set up, and the risks

### Step A (GitHub): what we did

- **Repository:** a folder hosted on GitHub that holds the app's files and keeps a history of every change.
- **GitHub Pages:** a service that serves those files as a website at `https://<username>.github.io/...`.

The site contains **code only**: no documents, no database and no server. When someone opens the address, their browser downloads the code and runs it on their own device.

**Is the code open to everyone?** Yes. We chose **Public**, so anyone can read the code on GitHub. Even with a private repository (which needs a paid GitHub plan), a website's code is always sent to the browser and can be viewed there.

That isn't a risk as long as the code has no secrets, and it has none:

| Value in `config.js` | What it is | Why it's fine to be visible |
|---|---|---|
| Client ID | The app's identity with Google | Google only accepts it from the addresses you approved (Authorized JavaScript origins). Another site can't impersonate your app. |
| API key | Key for Google's file picker | Gives no access to any file or account. If you restricted it to the Picker and your address (step B5), it can't be used anywhere else. |
| App ID | The project number | Just an identifying number. |

**Can anyone use the app?** Anyone can open the address and scan, because that runs on their phone and nothing is stored anywhere. To sign in with Google, the person must be on the **Test users** list (step B3). And anyone who signs in sees only **their own** Drive, never yours.

### Step B (Google Cloud): what we did

- **Project:** a container at Google that represents the app. It's free and not linked to any payment method.
- **Enabling the Drive API and Picker API:** lets the app talk to Drive and show Google's file picker.
- **Consent screen:** what a user sees when signing in: the app's name and which permissions it asks for. In **Testing** mode, only people on the Test users list can sign in, up to 100.
- **Client ID and API key:** the app's identity with Google (see the table above).

### What the `drive.file` permission allows

When a user signs in and approves, the app gets access **only** to:

- Files and folders **the app itself created** (for example `מסמכים סרוקים (בדיקה)` and the PDFs in it).
- Files the user **picked themselves** in Google's file picker.

The app **cannot** see, read, change or delete any other file in Drive: no photos, no other documents, no Gmail and no contacts. Google enforces this on its side; it doesn't depend on our code.

**Where is the access grant kept?** Only in the browser's memory, for one hour, then it renews. It isn't sent to any server other than Google itself, because we have no server.

**Revoking access at any time:** at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), choose the app and click **Remove access**.

### Are the files in Drive open to everyone?

**No.** Every file the app creates is **private** by default, like any other file in your Drive. Only you can see it.

It becomes visible to others only if **you** tap "Share for viewing" and type an email. Even then:

- Only that email gets access, and only to view (not edit or delete).
- It isn't a public link: someone who gets the link without their email being approved sees nothing.
- "Stop sharing" closes the access immediately. You can also see and change the sharing directly in Drive.

### The real risks, and what to do

| Risk | Why it matters | What to do |
|---|---|---|
| **Someone takes over your GitHub account** | Whoever controls the repository can change the code. When a family member signs in, the changed code gets the same access: to the documents the app created (not the rest of Drive). | Two-step verification (2FA) on GitHub, a strong unique password. |
| **Someone takes over your Google Cloud account** | They could change the app's settings, for example add approved addresses. | Two-step verification on your Google account (important anyway). |
| **External libraries** | The code loads OpenCV, pdf-lib and Tesseract from jsdelivr. If someone tampered with a library there, the changed code would run in our app. | Versions are pinned to exact numbers. In full development we'll add integrity checks (SRI) or host the libraries ourselves. |
| **Someone holding the phone** | Recognized text and test results are stored in the phone's browser. | Use a screen lock. Site data can be cleared in Chrome's settings. |
| **Sharing by mistake** | A wrong email gives viewing access to the wrong person. | Check the email before sharing, and stop sharing right away if you made a mistake. |
| **Text recognition through Google** | The document is sent to Google for conversion. | The document is already in your Drive, at the same Google, so this doesn't expose it to anyone new. The temporary copy is deleted right away. |

**Bottom line:** the code is public and that's fine, because it contains no secrets. The documents are private and stay in each user's own Drive. The sensitive point is the security of your GitHub and Google accounts, so turn on two-step verification on both.

## Notes

- On first sign-in, Google shows "Google hasn't verified this app". This is expected for an app in testing mode: click **Continue**.
- The tests create a folder in Drive named `מסמכים סרוקים (בדיקה)` ("Scanned documents (test)"). You can delete it when you're done.
- Google applies OCR only to the first 10 pages of a PDF, up to 2MB per file. If that turns out to be limiting, we'll solve it in full development.
- Running locally on a computer for a quick check: `python -m http.server 8080` from inside the folder, then open `http://localhost:8080`.
