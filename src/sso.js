// Salesforceアカウントでのログイン（OAuth 2.0 認可コード + PKCE）— CaseShelfと同じ方式
//
// 流れ:
//  1. 「Salesforceでログイン」→ Salesforceのログイン画面へ移動
//  2. ログイン後、Salesforceが ?code=... を付けてこのアプリに戻す
//  3. code を使ってアクセストークンを取得し、ログインした人の情報を取得
//  4. 取得したトークンで、商談・商談分割・ユーザを「読み取り」だけ行う（書き込みは一切しない）
//     トークンはログアウトするまでこのブラウザ（localStorage）に保持し、ログアウト時に無効化する。
//
// サーバーを持たない構成のため、コンシューマの秘密（Client Secret）は使わず、PKCEで保護する。
window.AppSSO = (function () {
  "use strict";

  var SS_KEY = "salesreport_sf_pkce";
  var TOKEN_KEY = "salesreport_sf_session_v1";
  var API_VERSION = "v60.0";

  var initialParams = new URLSearchParams(window.location.search);

  function config() {
    var c = (window.AppConfig && window.AppConfig.salesforce) || {};
    return {
      myDomainUrl: String(c.myDomainUrl || "").replace(/\/+$/, ""),
      clientId: String(c.clientId || ""),
    };
  }

  function isConfigured() {
    var c = config();
    return !!(c.myDomainUrl && c.clientId);
  }

  // Salesforce側の「コールバックURL」と完全に一致させる必要がある
  function redirectUri() {
    return window.location.origin + window.location.pathname.replace(/index\.html$/, "");
  }

  function base64Url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomString(len) {
    var bytes = new Uint8Array(len);
    window.crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function sha256Base64Url(text) {
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      return base64Url(new Uint8Array(buf));
    });
  }

  function saveState(obj) {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  function takeState() {
    try {
      var v = sessionStorage.getItem(SS_KEY);
      sessionStorage.removeItem(SS_KEY);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }

  function startLogin() {
    if (!isConfigured()) {
      return Promise.reject(new Error("Salesforceログインの設定がまだ完了していません（src/config.js を確認してください）。"));
    }
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error("このブラウザ環境ではSalesforceログインを使えません（https または localhost で開いてください）。"));
    }
    var c = config();
    var verifier = randomString(48);
    var state = randomString(16);
    return sha256Base64Url(verifier).then(function (challenge) {
      saveState({ verifier: verifier, state: state });
      var params = new URLSearchParams({
        response_type: "code",
        client_id: c.clientId,
        redirect_uri: redirectUri(),
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope: "openid email profile api",
        state: state,
        // 毎回Salesforceのログイン画面を表示する（CaseShelfと同じ）。
        // 既にSalesforceにログイン済みのブラウザでも、パスキーなど組織の多要素認証を通してからデータを読む
        prompt: "login",
      });
      window.location.assign(c.myDomainUrl + "/services/oauth2/authorize?" + params.toString());
    });
  }

  function cleanUrl() {
    try {
      history.replaceState(null, "", window.location.pathname);
    } catch (e) {}
  }

  function postForm(url, data) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data).toString(),
    });
  }

  function networkError() {
    return new Error(
      "Salesforceと通信できませんでした。Salesforce側のCORS設定（このアプリのURLの許可、「OAuthエンドポイントのCORSを有効化」）を確認してください。"
    );
  }

  var consumed = null;

  // Salesforceから戻ってきたときの処理。戻ってきたのでなければ null、戻ってきた場合はプロフィールを返す
  function consumeRedirect() {
    if (consumed) return consumed;
    var code = initialParams.get("code");
    var err = initialParams.get("error");
    var returnedState = initialParams.get("state");
    if (!code && !err) {
      consumed = Promise.resolve(null);
      return consumed;
    }
    initialParams = new URLSearchParams();
    cleanUrl();
    var saved = takeState();

    if (err) {
      consumed = Promise.reject(
        new Error(err === "access_denied" ? "Salesforceでのログインがキャンセルされました。" : "Salesforceでのログインに失敗しました（" + err + "）。")
      );
      return consumed;
    }
    if (!saved || returnedState !== saved.state) {
      consumed = Promise.reject(new Error("ログインの確認に失敗しました。もう一度「Salesforceでログイン」を押してください。"));
      return consumed;
    }

    var c = config();
    consumed = postForm(c.myDomainUrl + "/services/oauth2/token", {
      grant_type: "authorization_code",
      code: code,
      client_id: c.clientId,
      redirect_uri: redirectUri(),
      code_verifier: saved.verifier,
    })
      .catch(function () {
        throw networkError();
      })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || !body.access_token) {
            throw new Error("Salesforceでのログインに失敗しました（" + (body.error_description || body.error || res.status) + "）。");
          }
          return body;
        });
      })
      .then(function (tokenBody) {
        var token = tokenBody.access_token;
        return fetch(c.myDomainUrl + "/services/oauth2/userinfo", { headers: { Authorization: "Bearer " + token } })
          .catch(function () {
            throw networkError();
          })
          .then(function (res) {
            if (!res.ok) throw new Error("Salesforceの利用者情報を取得できませんでした（" + res.status + "）。");
            return res.json();
          })
          .then(function (info) {
            var profile = { email: info.email || "", name: info.name || "", sfUserId: info.user_id || "" };
            saveToken({ accessToken: token, instanceUrl: tokenBody.instance_url || c.myDomainUrl, profile: profile });
            return profile;
          });
      });
    return consumed;
  }

  function saveToken(obj) {
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  function readToken() {
    try {
      var v = localStorage.getItem(TOKEN_KEY);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }
  function dropToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function getSession() {
    var t = readToken();
    return t && t.accessToken ? { profile: t.profile || {}, instanceUrl: t.instanceUrl } : null;
  }

  function endSession() {
    var t = readToken();
    dropToken();
    if (t && t.accessToken) {
      postForm(config().myDomainUrl + "/services/oauth2/revoke", { token: t.accessToken }).catch(function () {});
    }
  }

  function expire() {
    dropToken();
    try {
      window.dispatchEvent(new Event("salesreport-session-expired"));
    } catch (e) {}
  }

  function apiError(res, body) {
    var first = Array.isArray(body) ? body[0] : body;
    var code = (first && first.errorCode) || String(res.status);
    var msg = (first && first.message) || "";
    var text;
    if (code === "INVALID_FIELD" || code === "INVALID_TYPE" || code === "MALFORMED_QUERY") {
      text =
        "Salesforceの項目の設定が正しくありません。src/config.js の項目のAPI参照名を確認してください（" + msg + "）。";
    } else if (code === "API_DISABLED_FOR_ORG" || code === "API_CURRENTLY_DISABLED") {
      text = "SalesforceのAPIを利用する権限がありません。管理者にお問い合わせください。";
    } else if (code === "INSUFFICIENT_ACCESS" || code === "INSUFFICIENT_ACCESS_OR_READONLY") {
      text = "Salesforceのデータを参照する権限がありません（" + msg + "）。";
    } else {
      text = "Salesforceとの通信でエラーが発生しました（" + code + (msg ? ": " + msg : "") + "）。";
    }
    var err = new Error(text);
    err.code = code;
    err.status = res.status;
    return err;
  }

  // Salesforce REST API を呼ぶ（GETのみ使う）
  function api(path) {
    var t = readToken();
    if (!t || !t.accessToken) {
      expire();
      return Promise.reject(new Error("Salesforceに接続されていません。ログインし直してください。"));
    }
    var base = String(t.instanceUrl || config().myDomainUrl).replace(/\/+$/, "");
    var url = base + (path.indexOf("/services/") === 0 ? path : "/services/data/" + API_VERSION + path);
    return fetch(url, { headers: { Authorization: "Bearer " + t.accessToken, Accept: "application/json" } })
      .catch(function () {
        throw new Error("Salesforceと通信できませんでした。ネットワーク、またはSalesforce側のCORS設定を確認してください。");
      })
      .then(function (res) {
        if (res.status === 401) {
          expire();
          var e = new Error("Salesforceの接続の有効期限が切れました。もう一度ログインしてください。");
          e.status = 401;
          throw e;
        }
        return res.text().then(function (text) {
          var parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch (e) {}
          if (!res.ok) throw apiError(res, parsed);
          return parsed;
        });
      });
  }

  // SOQLを実行し、2000件を超える場合も続きを取得してすべて返す
  function query(soql, onProgress) {
    var out = [];
    function next(path) {
      return api(path).then(function (body) {
        out = out.concat((body && body.records) || []);
        if (onProgress) onProgress(out.length, body && body.totalSize);
        if (body && !body.done && body.nextRecordsUrl) return next(body.nextRecordsUrl);
        return out;
      });
    }
    return next("/query?q=" + encodeURIComponent(soql));
  }

  // オブジェクトの項目一覧（ログインした人が参照できる項目だけが返る）
  function describe(objectName) {
    return api("/sobjects/" + encodeURIComponent(objectName) + "/describe");
  }

  // 件数だけを数える（SELECT COUNT() ...）
  function count(soql) {
    return api("/query?q=" + encodeURIComponent(soql)).then(function (body) {
      return (body && body.totalSize) || 0;
    });
  }

  function soqlString(v) {
    return "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  }

  function recordUrl(objectName, id) {
    var t = readToken();
    var base = String((t && t.instanceUrl) || config().myDomainUrl).replace(/\/+$/, "").replace(".my.salesforce.com", ".lightning.force.com");
    return base + "/lightning/r/" + objectName + "/" + id + "/view";
  }

  return {
    isConfigured: isConfigured,
    startLogin: startLogin,
    consumeRedirect: consumeRedirect,
    getSession: getSession,
    endSession: endSession,
    query: query,
    count: count,
    describe: describe,
    soqlString: soqlString,
    recordUrl: recordUrl,
  };
})();
