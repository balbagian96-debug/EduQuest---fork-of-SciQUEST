  /**
  * EduQueSCT Apps Script backend — reference source, checked into the repo for
  * version control only. This file is NOT deployed automatically: paste it
  * into the actual Google Apps Script project (script.google.com) behind the
  * API_URL used in rank.html / login.html / start.html, then redeploy the
  * Web App, same manual process the existing leaderboard script already uses.
  *
  * Sheets expected in the bound Spreadsheet:
  *   - "Leaderboard": columns name, score            (existing, unchanged)
  *   - "Users":       columns username, passwordHash, completedTopics, selectedGrade
  *
  * Passwords: the client hashes the password with SHA-256 (via crypto.subtle)
  * before it ever leaves the browser. This script only ever sees/stores that
  * hash and compares hashes as plain strings — it never sees a plaintext
  * password. There is no per-user salt (a Sheets-backed store can't reasonably
  * support one); that's an accepted limitation for a low-stakes educational
  * game account, not a TODO to "fix" later.
  */

  function doGet(e) {
    const params = e.parameter || {};
    if (params.action === "getProgress") {
      return respond(getProgress(params.username));
    }
    // Legacy behavior: bare GET returns the leaderboard array.
    return respond(getLeaderboard());
  }

  function doPost(e) {
    const data = JSON.parse(e.postData.contents || "{}");

    switch (data.action) {
      case "register":
        return respond(registerUser(data.username, data.passwordHash));
      case "login":
        return respond(loginUser(data.username, data.passwordHash));
      case "saveProgress":
        return respond(saveProgress(data.username, data.completedTopics, data.selectedGrade));
      case "googleAuth":
        return respond(googleAuth(data.idToken));
      case "generateQuestions":
        return respond(generateQuestionsViaGemini(data.topic, data.subject, data.grade));
      default:
        // Legacy behavior: bare {name, score} appends a leaderboard row.
        return respond(addScore(data.name, data.score));
    }
  }

  function respond(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ---------------- Leaderboard (existing behavior) ----------------

  function getLeaderboard() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leaderboard");
    const rows = sheet.getDataRange().getValues().slice(1); // skip header
    return rows.map(r => ({ name: r[0], score: r[1] }));
  }

  function addScore(name, score) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leaderboard");
    sheet.appendRow([name, score]);
    return { ok: true };
  }

  // ---------------- Users / accounts ----------------

  function getUsersSheet() {
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  }

  function findUserRow(username) {
    const sheet = getUsersSheet();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === username) return { rowIndex: i + 1, row: rows[i] };
    }
    return null;
  }

  function registerUser(username, passwordHash) {
    if (!username || !passwordHash) return { ok: false, error: "missing_fields" };
    if (findUserRow(username)) return { ok: false, error: "username_taken" };

    const sheet = getUsersSheet();
    sheet.appendRow([username, passwordHash, JSON.stringify([]), 7]);
    return { ok: true };
  }

  function loginUser(username, passwordHash) {
    const found = findUserRow(username);
    if (!found || found.row[1] !== passwordHash) {
      return { ok: false, error: "invalid_credentials" };
    }
    return {
      ok: true,
      completedTopics: JSON.parse(found.row[2] || "[]"),
      selectedGrade: found.row[3] || 7
    };
  }

  function getProgress(username) {
    const found = findUserRow(username);
    if (!found) return { ok: false, error: "not_found" };
    return {
      ok: true,
      completedTopics: JSON.parse(found.row[2] || "[]"),
      selectedGrade: found.row[3] || 7
    };
  }

  function saveProgress(username, completedTopics, selectedGrade) {
    const found = findUserRow(username);
    if (!found) return { ok: false, error: "not_found" };

    const sheet = getUsersSheet();
    sheet.getRange(found.rowIndex, 3).setValue(JSON.stringify(completedTopics || []));
    sheet.getRange(found.rowIndex, 4).setValue(selectedGrade || 7);
    return { ok: true };
  }

  // ---------------- Google Sign-In ----------------
  // Google users are stored as a normal Users row: username = their email,
  // passwordHash = the "GOOGLE_AUTH" sentinel (never a valid SHA-256 hex string,
  // so a manual login attempt with that email can never pass the hash check).

  const GOOGLE_CLIENT_ID = "418666074204-p4barib3vqbs4iclh45tnbamhle6b0h9.apps.googleusercontent.com";

  function verifyGoogleToken(idToken) {
    try {
      const res = UrlFetchApp.fetch(
        "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
        { muteHttpExceptions: true }
      );
      const status = res.getResponseCode();
      const body = res.getContentText();
      if (status !== 200) {
        return { payload: null, debug: { stage: "tokeninfo_http", status, body } };
      }

      const payload = JSON.parse(body);
      // aud must match OUR client ID — otherwise a token issued for a different
      // app could be replayed here.
      if (payload.aud !== GOOGLE_CLIENT_ID) {
        return { payload: null, debug: { stage: "aud_mismatch", aud: payload.aud, expected: GOOGLE_CLIENT_ID } };
      }
      if (!payload.email || String(payload.email_verified) !== "true") {
        return { payload: null, debug: { stage: "email_verified", email: payload.email, email_verified: payload.email_verified, type: typeof payload.email_verified } };
      }
      return { payload };
    } catch (e) {
      return { payload: null, debug: { stage: "exception", message: String(e) } };
    }
  }

  function googleAuth(idToken) {
    const { payload, debug } = verifyGoogleToken(idToken);
    if (!payload) return { ok: false, error: "invalid_token", debug };

    const email = payload.email;
    const found = findUserRow(email);

    if (found) {
      return {
        ok: true,
        username: email,
        completedTopics: JSON.parse(found.row[2] || "[]"),
        selectedGrade: found.row[3] || 7
      };
    }

    const sheet = getUsersSheet();
    sheet.appendRow([email, "GOOGLE_AUTH", JSON.stringify([]), 7]);
    return { ok: true, username: email, completedTopics: [], selectedGrade: 7 };
  }

  // ---------------- Gemini question generation ----------------
  // Client-side hardcoded Gemini API keys are no longer viable on this Google
  // account (AI Studio keys reject direct REST calls; Cloud Console API keys
  // for the Gemini API now require a service-account binding). Routing through
  // here instead uses the script's own authorized identity via
  // ScriptApp.getOAuthToken() — the frontend never sees a Gemini credential.
  //
  // One-time setup required in the Apps Script editor after pasting this file:
  //   Project Settings → check "Show 'appsscript.json' manifest file in editor"
  //   → add "https://www.googleapis.com/auth/cloud-platform" to oauthScopes
  //   → re-run any function once to accept the new permission prompt → redeploy.

  const GEMINI_MODEL_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

  function generateQuestionsViaGemini(topic, subject, grade) {
    const prompt = `Generate exactly 15 multiple-choice ${subject} questions on the topic "${topic}" for a grade ${grade} student.
  All 15 must be distinct from one another — they will be split across three mini-levels, so variety matters.
  Respond with ONLY strict JSON, no markdown fences, matching exactly this shape:
  [{"text":"...", "choices":["...","...","...","..."], "correct":1}, ...]
  "correct" is a 1-indexed integer (1-4) pointing to the correct entry in "choices". Exactly 15 items, exactly 4 choices each.`;

    try {
      const res = UrlFetchApp.fetch(GEMINI_MODEL_URL, {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        muteHttpExceptions: true
      });

      const status = res.getResponseCode();
      const body = res.getContentText();
      if (status !== 200) {
        return { ok: false, error: "gemini_http_" + status, debug: body };
      }

      const data = JSON.parse(body);
      const raw = (data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text) || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const questions = JSON.parse(cleaned);

      const valid = Array.isArray(questions) && questions.length >= 11 && questions.every(q =>
        q && typeof q.text === "string" &&
        Array.isArray(q.choices) && q.choices.length === 4 &&
        Number.isInteger(q.correct) && q.correct >= 1 && q.correct <= 4
      );
      if (!valid) return { ok: false, error: "gemini_shape_invalid", debug: raw };

      return { ok: true, questions };
    } catch (e) {
      return { ok: false, error: "exception", debug: String(e) };
    }
  }