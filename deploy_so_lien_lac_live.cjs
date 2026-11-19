const https = require('https');
const fs = require('fs');
const path = require('path');

try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
} catch (e) {}

const VENDOR_ID = '3529cd2b-7af6-4fda-887c-392a79393d6a';
const CLIENT_ID = 'fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9';
const PAGE_ID = '6adff7ba36309b0002b6e659';
const SLUG = 'so-lien-lac-test';

const CDN_LOGO = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/logo.png';
const CDN_TEACHER = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/so-lien-lac/teacher_webcam.jpg';
const CDN_COURSE_MAM_NON = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/course_mam_non.jpg';
const CDN_COURSE_TIEU_HOC = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/course_tieu_hoc.jpg';
const CDN_COURSE_THIEU_NIEN = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/course_thieu_nien.jpg';
const CDN_POSTER_UYEN = 'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/v2_poster_student_uyen.jpg';
const CDN_HW_IMAGE = 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1770099194454-z7448273160437-1e6e445644d8731bb8311d8766aa1ee8-jpg';
const CDN_HW_VIDEO = 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1715874240352-btvn-bai-1-mp4';

function replaceSllAssets(str) {
  return str
    .replace(/assets\/logo\.(?:jpg|png)/g, CDN_LOGO)
    .replace(/assets\/teacher_webcam\.jpg/g, CDN_TEACHER)
    .replace(/assets\/course_mam_non\.jpg/g, CDN_COURSE_MAM_NON)
    .replace(/assets\/course_tieu_hoc\.jpg/g, CDN_COURSE_TIEU_HOC)
    .replace(/assets\/course_thieu_nien\.jpg/g, CDN_COURSE_THIEU_NIEN)
    .replace(/assets\/poster_student_uyen\.jpg/g, CDN_POSTER_UYEN)
    .replace(/assets\/hw_vo_viet_chu_han\.jpg/g, CDN_HW_IMAGE)
    .replace(/assets\/hw_btvn_bai_1\.mp4/g, CDN_HW_VIDEO);
}

async function req(method, urlStr, headers = {}, body = null, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const r = https.request({
          method,
          hostname: u.hostname,
          path: u.pathname + u.search,
          headers
        }, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8')
          }));
        });
        r.on('error', reject);
        if (body) r.write(body);
        r.end();
      });
      if (res.status !== 502 && res.status !== 504 && res.status !== 500) return res;
      console.warn(`[HTTP ${res.status}] Attempt ${attempt} on ${urlStr} failed, retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2500 * attempt));
      if (attempt === retries) return res;
    } catch (err) {
      console.warn(`[Network Error: ${err.message}] Attempt ${attempt} failed, retrying...`);
      await new Promise(r => setTimeout(r, 2500 * attempt));
      if (attempt === retries) throw err;
    }
  }
}

async function getSignedUrl(token, s3Key, mimeType) {
  const signEndpoint = `https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url?key=${encodeURIComponent(s3Key)}&contentType=${encodeURIComponent(mimeType)}`;
  const res = await fetch(signEndpoint, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(`Signed URL request failed: ${res.status}`);
  const data = await res.json();
  const url = typeof data === 'string' ? data : (data.url || data.signedUrl || data.data?.url || data.data);
  return url;
}

async function uploadBufferToS3(signedUrl, buffer, mimeType) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length)
    },
    body: buffer
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
  return true;
}

async function main() {
  console.log('=== [SLL] Triển khai Sổ Liên Lạc Điện Tử Lên izTeach ===');

  // 1. Read source files (Admin/Teacher Management Portal + Clean HSK1 3.0 Student Portal)
  const htmlRaw = fs.readFileSync(path.join(__dirname, 'so-lien-lac.html'), 'utf8');
  const uxCss = fs.readFileSync(path.join(__dirname, 'so-lien-lac-ux.css'), 'utf8');
  const authCss = fs.readFileSync(path.join(__dirname, 'so-lien-lac-auth.css'), 'utf8');
  const uxJs = fs.readFileSync(path.join(__dirname, 'so-lien-lac-ux.js'), 'utf8');
  const lmsCss = fs.readFileSync(path.join(__dirname, 'so-lien-lac-lms.css'), 'utf8');
  const lmsJs = fs.readFileSync(path.join(__dirname, 'so-lien-lac-lms.js'), 'utf8');
  const webappClientJs = fs.readFileSync(path.join(__dirname, 'ktn-webapp-client.js'), 'utf8');

  // Always auto-build sll-hocsinh.html & demo_hsk1_student_portal.html from portal_template.html + clean_lessons_data.json + all_courses_lessons_data.json
  const lessonsDataJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'clean_lessons_data.json'), 'utf8'));
  const allCoursesDataJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'all_courses_lessons_data.json'), 'utf8'));
  const portalTemplateRaw = fs.readFileSync(path.join(__dirname, 'portal_template.html'), 'utf8');
  const builtCleanPortalRaw = portalTemplateRaw
    .replace(/__LESSONS_DATA__/g, JSON.stringify(lessonsDataJson))
    .replace(/__ALL_COURSES_DATA__/g, JSON.stringify(allCoursesDataJson));
  fs.writeFileSync(path.join(__dirname, 'sll-hocsinh.html'), builtCleanPortalRaw, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'demo_hsk1_student_portal.html'), builtCleanPortalRaw, 'utf8');
  const cleanPortalRaw = builtCleanPortalRaw;

  // Extract Clean Student Portal HTML, CSS, JS
  const cleanCssMatch = cleanPortalRaw.match(/<style>([\s\S]*?)<\/style>/i);
  const cleanRawCss = cleanCssMatch ? cleanCssMatch[1].trim() : '';
  const cleanJsMatch = cleanPortalRaw.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
  const cleanRawJs = cleanJsMatch ? cleanJsMatch[1].trim() : '';
  const cleanBodyMatch = cleanPortalRaw.match(/<body>([\s\S]*?)<script>/i);
  const cleanBodyHtml = cleanBodyMatch ? cleanBodyMatch[1].trim() : '';

  function scopeCleanPortalCss(input) {
    const noComments = input.replace(/\/\*[\s\S]*?\*\//g, '');
    function proc(block) {
      let out = '', i = 0;
      while (i < block.length) {
        const open = block.indexOf('{', i);
        if (open === -1) { out += block.slice(i); break; }
        const selRaw = block.slice(i, open).trim();
        let depth = 1, j = open + 1;
        while (j < block.length && depth > 0) {
          if (block[j] === '{') depth++;
          else if (block[j] === '}') depth--;
          j++;
        }
        const inner = block.slice(open + 1, j - 1);
        if (selRaw.startsWith('@media')) {
          out += selRaw + '{' + proc(inner) + '}\n';
        } else if (selRaw.startsWith('@keyframes')) {
          out += selRaw + '{' + inner + '}\n';
        } else if (selRaw) {
          const scopedSels = selRaw.split(',').map(s => {
            s = s.trim();
            if (!s) return '';
            if (s === ':root' || s === 'html' || s === 'body') return '#ktn-clean-portal-mount';
            if (s === '*') return '#ktn-clean-portal-mount, #ktn-clean-portal-mount *';
            return '#ktn-clean-portal-mount ' + s;
          }).filter(Boolean).join(', ');
          out += scopedSels + '{' + inner + '}\n';
        }
        i = j;
      }
      return out;
    }
    return proc(noComments);
  }
  const scopedCleanCss = scopeCleanPortalCss(cleanRawCss);

  // Extract <style>...</style> from htmlRaw
  const styleMatch = htmlRaw.match(/<style>([\s\S]*?)<\/style>/i);
  const inlineCss = styleMatch ? styleMatch[1] : '';

  // Extract <body>...</body> from htmlRaw
  const bodyMatch = htmlRaw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let bodyInner = bodyMatch ? bodyMatch[1] : htmlRaw;

  // Remove script tags from bodyInner (they will be in section.props.js)
  bodyInner = bodyInner.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Extract inline script from htmlRaw
  const scriptMatch = htmlRaw.match(/<script>([\s\S]*?)<\/script>[\s\S]*?<script src="so-lien-lac-ux\.js"><\/script>/i);
  const inlineJs = scriptMatch ? scriptMatch[1] : '';

  // 2. Prepare HTML with asset replacement and root wrapper (BOTH Admin/Teacher SLL & Clean Student Portal)
  // Completely strip secondary login page (#auth-shell) — only homepage login modal is allowed!
  let sllHtml = replaceSllAssets(bodyInner)
    .replace(/<section id="auth-shell"[\s\S]*?<\/section>/i, '')
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/<button id="auth-open-demo"[\s\S]*?<\/button>/gi, '')
    .replace(/<div id="demo-auth-bar"[\s\S]*?<\/div>/gi, '');

  let finalHtml = `<div id="ktn-sll-root" data-auth="locked">\n${sllHtml}\n</div>\n<div id="ktn-clean-portal-mount" style="display:none;">\n${cleanBodyHtml}\n</div>`;

  // 3. Prepare CSS
  const resetCss = `
/* ============================================================ */
/* izTeach Host Overrides & Container Isolation                 */
/* ============================================================ */
#__next > main > div.mx-auto.max-w-screen-3xl > div.fixed.inset-x-0.top-0,
#__next > main > div.mx-auto.max-w-screen-3xl > div.border-t.border-slate-200,
.ant-message,
.ant-notification {
  display: none !important;
}
#__next > main > div.mx-auto.max-w-screen-3xl > div.pt-16 {
  padding-top: 0 !important;
}
#__next > main > div.mx-auto.max-w-screen-3xl {
  max-width: 100% !important;
  padding: 0 !important;
}
div.flex-1.justify-center > div[data-aos] {
  opacity: 1 !important;
  transform: none !important;
}
div.flex-1.justify-center > div:nth-child(n+2):not(:has(#ktn-sll-root)) {
  display: none !important;
}
div.flex-1.justify-center > div:has(#ktn-sll-root) {
  display: block !important;
  opacity: 1 !important;
  transform: none !important;
}
#ktn-sll-root {
  width: 100%;
  min-height: 100vh;
  background: #F8FAFC;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  color: #0F172A;
  box-sizing: border-box;
}
#ktn-sll-root *, #ktn-sll-root *::before, #ktn-sll-root *::after {
  box-sizing: border-box;
}
#ktn-clean-portal-mount {
  width: 100%;
  min-height: 100vh;
}
`;

  // Adapt auth CSS so data-auth works on #ktn-sll-root or body
  const adaptedAuthCss = authCss
    .replace(/body\[data-auth=([^\]]+)\] >/g, '#ktn-sll-root[data-auth="$1"] >')
    .replace(/body\[data-auth=([^\]]+)\]/g, '#ktn-sll-root[data-auth="$1"]');

  const adaptedLmsCss = lmsCss
    .replace(/body\.lms-on \.app-header/g, 'body.lms-on #ktn-sll-root .app-header')
    .replace(/body\.lms-on \.app-main/g, 'body.lms-on #ktn-sll-root .app-main');

  const finalCss = `${resetCss}\n/* --- INLINE CSS --- */\n${inlineCss}\n/* --- UX CSS --- */\n${uxCss}\n/* --- AUTH CSS --- */\n${adaptedAuthCss}\n/* --- LMS SHELL CSS --- */\n${adaptedLmsCss}\n/* --- CLEAN STUDENT PORTAL CSS --- */\n${scopedCleanCss}`;

  const ktnGlobalAuthHook = `;(function(){window.__ktnCleanPortalLoaded=true;try{localStorage.removeItem("ol-credentials-auth-user");sessionStorage.removeItem("ol-credentials-auth-user");var oldPush=document.getElementById("ktn-global-push-card");if(oldPush)oldPush.remove();}catch(e){}function normalizeKtnEmail(raw){var s=String(raw||"").trim().toLowerCase();if(!s)return "";var map={"taphong2002":"taphong2002@gmail.com","taphong":"taphong2002@gmail.com","taphong2002@gmail.com":"taphong2002@gmail.com","hoangngan":"hoangngan@khongtunhi.com","hoangngan.ktn@gmail.com":"hoangngan@khongtunhi.com","hoangngan.yct@gmail.com":"hoangngan@khongtunhi.com","dachanh":"dachanh@khongtunhi.com","dachanh.ktn@gmail.com":"dachanh@khongtunhi.com","anman":"anman@khongtunhi.com","anman.ktn@gmail.com":"anman@khongtunhi.com","minhkhang":"minhkhang@khongtunhi.com","minhkhang.ktn@gmail.com":"minhkhang@khongtunhi.com","baochau":"baochau@khongtunhi.com","baochau.ktn@gmail.com":"baochau@khongtunhi.com","giabao":"giabao@khongtunhi.com","giabao.ktn@gmail.com":"giabao@khongtunhi.com","linhlm":"linh.lam@khongtunhi.com","linhlm@khongtunhi.com":"linh.lam@khongtunhi.com","linh.lam@khongtunhi.com":"linh.lam@khongtunhi.com","lam.mylinh@khongtunhi.com":"linh.lam@khongtunhi.com","linhlam.ktn@gmail.com":"linh.lam@khongtunhi.com","linhlam@gmail.com":"linh.lam@khongtunhi.com","colinh":"linh.lam@khongtunhi.com","mylinh":"linh.lam@khongtunhi.com","giaovien":"linh.lam@khongtunhi.com","giaovien@khongtunhi.com":"linh.lam@khongtunhi.com","gv":"linh.lam@khongtunhi.com","teacher":"linh.lam@khongtunhi.com","hatt":"thu.ha@khongtunhi.com","hatt@khongtunhi.com":"thu.ha@khongtunhi.com","thu.ha@khongtunhi.com":"thu.ha@khongtunhi.com","coha":"thu.ha@khongtunhi.com","admin":"hocvienkhongtunhi123@gmail.com","quanly":"quanly@khongtunhi.com","khongtunhi":"khongtunhi@gmail.com","khongtunhi@gmail.com":"khongtunhi@gmail.com"};if(map[s])return map[s];if(window.app){var ht=(window.app.teachers||[]).find(function(t){return String(t.email||"").toLowerCase()===s||(Array.isArray(t.aliases)&&t.aliases.some(function(a){return String(a||"").toLowerCase()===s;}));});if(ht&&ht.email)return String(ht.email).toLowerCase();var hs=(window.app.students||[]).find(function(st){return String(st.email||"").toLowerCase()===s||(Array.isArray(st.aliases)&&st.aliases.some(function(a){return String(a||"").toLowerCase()===s;}));});if(hs&&hs.email)return String(hs.email).toLowerCase();}return s.indexOf("@")!==-1?s:(s+"@khongtunhi.com");}window.__normalizeKtnEmail=normalizeKtnEmail;function saveGlobalKtnSession(data){if(!data||window.__ktnLoggingOut)return;var em=normalizeKtnEmail(data.email||"");data.email=em;try{var rawPrev=localStorage.getItem("ktn_sll_persistent_auth_v2");if(rawPrev){var prevObj=JSON.parse(rawPrev);if(prevObj&&normalizeKtnEmail(prevObj.email||"")===em){if(!data.token&&prevObj.token)data.token=prevObj.token;if(!data.classCode&&prevObj.classCode)data.classCode=prevObj.classCode;if(!data.onlineCourses&&prevObj.onlineCourses)data.onlineCourses=prevObj.onlineCourses;if((!data.accessToken||String(data.accessToken).indexOf("KTN-")===0)&&prevObj.accessToken&&String(prevObj.accessToken).indexOf("KTN-")!==0)data.accessToken=prevObj.accessToken;}}}catch(e){}if(em==="hocvienkhongtunhi123@gmail.com"||em==="quanly@khongtunhi.com"||em==="khongtunhi@gmail.com"){data.role="admin";data.roles=["admin"];}else if(em==="linh.lam@khongtunhi.com"||em==="thu.ha@khongtunhi.com"){data.role=data.role||"teacher";data.roles=Array.isArray(data.roles)&&data.roles.length?data.roles:["teacher"];}else{data.role=data.role||"student";data.roles=Array.isArray(data.roles)&&data.roles.length?data.roles:[data.role];}if(em==="taphong2002@gmail.com"){data.id="bc21991c-ce9b-465d-b85f-dbb1821e51a9";data.userId="bc21991c-ce9b-465d-b85f-dbb1821e51a9";data.studentId="6abb2c0b8b46e30002add37b";data.code=data.code||"KTN-2026-TAPHON";data.name=data.name||"ta phong vo";if(!Array.isArray(data.onlineCourses)||!data.onlineCourses.length)data.onlineCourses=[{id:"6adadba969897b0002482ca5",title:"HSK1 3.0"},{id:"65e7704a9ea90c00080d5195",title:"Chinese For Kids"}];}if(!data.token&&data.accessToken)data.token=data.accessToken;if(!data.accessToken&&data.token)data.accessToken=data.token;try{localStorage.setItem("ktn_sll_persistent_auth_v2",JSON.stringify(data));localStorage.setItem("sll_session_v2",JSON.stringify(data));if(data.token)localStorage.setItem("sll_ktn_token",data.token);localStorage.removeItem("ol-credentials-auth-user");sessionStorage.removeItem("ol-credentials-auth-user");}catch(e){}try{var mini={email:em,name:data.name||em.split("@")[0],id:data.id||data.studentId||em,studentId:data.studentId||data.id||em,role:data.role||"student",roles:data.roles||[data.role||"student"]};document.cookie="ktn_sll_auth_v2="+encodeURIComponent(JSON.stringify(mini))+"; path=/; max-age=315360000; SameSite=Lax";}catch(e){}try{if(window.caches&&window.caches.open){window.caches.open("ktn-sll-auth-v2").then(function(c){c.put("/__ktn_session__",new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}}));}).catch(function(){});}}catch(e){}try{if(window.indexedDB){var idbReq=window.indexedDB.open("ktn_webapp_auth_db",1);idbReq.onupgradeneeded=function(ev){var db=ev.target.result;if(!db.objectStoreNames.contains("session_store"))db.createObjectStore("session_store");};idbReq.onsuccess=function(){try{var db=idbReq.result;var tx=db.transaction("session_store","readwrite");tx.objectStore("session_store").put(data,"active_session");tx.oncomplete=function(){try{db.close();}catch(e){}};}catch(e){}};}}catch(e){}}window.__saveGlobalKtnSession=saveGlobalKtnSession;if(window.__ktnSllAuthHookedV8)return;window.__ktnSllAuthHookedV8=true;window.__ktnSllAuthHooked=true;var origRm=Storage.prototype.removeItem;Storage.prototype.removeItem=function(k){if(!window.__ktnAllowLogout&&(k==="ktn_sll_persistent_auth_v2"||k==="sll_session_v2"||k==="sll_ktn_token"||k==="ktn_pwa_permanent_optin_v1"||k==="ktn_push_enabled_v2"))return;return origRm.apply(this,arguments);};var origClr=Storage.prototype.clear;Storage.prototype.clear=function(){if(!window.__ktnAllowLogout){var s2=localStorage.getItem("ktn_sll_persistent_auth_v2");var s3=localStorage.getItem("ktn_pwa_permanent_optin_v1");var s4=localStorage.getItem("ktn_pending_target_hash");var s5=localStorage.getItem("sll_session_v2");var s6=localStorage.getItem("sll_ktn_token");var s7=localStorage.getItem("ktn_push_enabled_v2");origClr.apply(this,arguments);if(s2)localStorage.setItem("ktn_sll_persistent_auth_v2",s2);if(s3)localStorage.setItem("ktn_pwa_permanent_optin_v1",s3);if(s4)localStorage.setItem("ktn_pending_target_hash",s4);if(s5)localStorage.setItem("sll_session_v2",s5);if(s6)localStorage.setItem("sll_ktn_token",s6);if(s7)localStorage.setItem("ktn_push_enabled_v2",s7);return;}return origClr.apply(this,arguments);};function hasSavedKtnSession(){if(window.__ktnLoggingOut||window.location.search.indexOf("login=1")!==-1)return false;try{var raw=localStorage.getItem("ktn_sll_persistent_auth_v2")||localStorage.getItem("sll_session_v2");if(raw){var parsed=JSON.parse(raw);if(parsed&&parsed.email)return true;}if(document.cookie&&document.cookie.indexOf("ktn_sll_auth_v2=")!==-1)return true;}catch(e){}return false;}try{var isStandalone=Boolean(window.navigator.standalone||(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches));if(window.location.pathname==="/"&&isStandalone&&hasSavedKtnSession()){window.location.replace("/custom-page/so-lien-lac-test"+(window.location.search||"")+(window.location.hash||""));return;}}catch(e){}function ensureVendorOrigin(){try{if(!localStorage.getItem("ol-amplify-vendorId-from-origin")){localStorage.setItem("ol-amplify-vendorId-from-origin",JSON.stringify({payload:{vendorId:"3529cd2b-7af6-4fda-887c-392a79393d6a"},expiredAt:Date.now()+864000000}));}localStorage.removeItem("ol-credentials-auth-user");sessionStorage.removeItem("ol-credentials-auth-user");sessionStorage.removeItem("ktn_sll_scenario");sessionStorage.removeItem("ktn_sll_scenario_email");localStorage.removeItem("ktn_sll_scenario");localStorage.removeItem("ktn_sll_scenario_email");}catch(e){}}ensureVendorOrigin();function removeOldTray(){var oldTray=document.getElementById("ktn-modal-gmail-tray");if(oldTray)oldTray.remove();}var prevFetch=window.fetch?window.fetch.bind(window):null;function clearAntNotices(){document.querySelectorAll(".ant-notification-notice, .ant-message-notice, .ant-message").forEach(function(n){n.remove();});}function enhanceKtnLoginForm(){var forms=document.querySelectorAll("form.ant-form");Array.prototype.forEach.call(forms,function(form){var pwdInput=form.querySelector("input#password");if(!pwdInput||form.querySelector("#ktn-toggle-pwd-btn"))return;var btn=document.createElement("button");btn.type="button";btn.id="ktn-toggle-pwd-btn";btn.textContent="Hiện mật khẩu";btn.style.cssText="margin-top:6px;background:transparent;border:none;color:#2563EB;font-size:12px;font-weight:700;cursor:pointer;padding:2px 0;display:inline-block;";btn.onclick=function(){var isPwd=pwdInput.getAttribute("type")==="password";pwdInput.setAttribute("type",isPwd?"text":"password");btn.textContent=isPwd?"Ẩn mật khẩu":"Hiện mật khẩu";};if(pwdInput.parentNode){pwdInput.parentNode.appendChild(btn);}});}function setKtnLoginSubmitLoading(isLoading){var forms=document.querySelectorAll("form.ant-form");Array.prototype.forEach.call(forms,function(form){if(!form.querySelector("input#email"))return;var subBtn=form.querySelector("button[type=submit]");if(!subBtn)return;subBtn.disabled=Boolean(isLoading);subBtn.textContent=isLoading?"Đang đăng nhập…":"Đăng nhập";});}function showKtnModalError(msg){var forms=document.querySelectorAll("form.ant-form");Array.prototype.forEach.call(forms,function(form){if(!form.querySelector("input#email")||!form.querySelector("input#password"))return;var errEl=form.querySelector("#ktn-modal-login-error");if(!msg){if(errEl){errEl.textContent="";errEl.style.display="none";}return;}if(!errEl){errEl=document.createElement("div");errEl.id="ktn-modal-login-error";errEl.setAttribute("role","alert");errEl.style.cssText="margin-bottom:10px;padding:8px 10px;border-radius:8px;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;font-size:12px;font-weight:600;line-height:1.4;text-align:left;";var subBtn=form.querySelector("button[type=submit]");if(subBtn&&subBtn.parentNode){subBtn.parentNode.insertBefore(errEl,subBtn);}else{form.appendChild(errEl);}}errEl.textContent=msg;errEl.style.display="block";});}function hideKtnLoginModal(){showKtnModalError("");setKtnLoginSubmitLoading(false);document.querySelectorAll("div.fixed.inset-0").forEach(function(d){if(d.querySelector("form.ant-form")){d.classList.remove("opacity-100","visible");d.classList.add("opacity-0","invisible");}});}function isMobileViewport(){return Boolean(window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches);}function openKtnLoginModal(){removeOldTray();showKtnModalError("");enhanceKtnLoginForm();if(hasSavedKtnSession()&&window.location.pathname.indexOf("so-lien-lac")===-1){var savedHash="";try{savedHash=localStorage.getItem("ktn_pending_target_hash")||"";}catch(e){}window.location.href="/custom-page/so-lien-lac-test"+savedHash;return true;}if(window.location.pathname.indexOf("so-lien-lac")!==-1){window.location.hash="#/login";return true;}var emInput=document.querySelector("form.ant-form input#email");if(!emInput&&!isMobileViewport()){var navBar=document.querySelector("#__next main div.fixed.inset-x-0.top-0");var clicked=false;if(navBar){var btns=navBar.querySelectorAll("button, a");Array.prototype.forEach.call(btns,function(b){if(clicked)return;var txt=(b.textContent||"").trim().toLowerCase();if(txt==="đăng nhập"||txt.indexOf("đăng nhập")!==-1){b.click();clicked=true;}});}emInput=document.querySelector("form.ant-form input#email");}if(emInput){enhanceKtnLoginForm();var card=emInput.closest(".ant-card");if(card)card.classList.add("ant-modal");var overlay=emInput.closest("div.fixed.inset-0");if(overlay){overlay.classList.remove("opacity-0","invisible");overlay.classList.add("opacity-100","visible");return true;}}var targetHash="";try{targetHash=localStorage.getItem("ktn_pending_target_hash")||"";}catch(e){}window.location.href="/custom-page/so-lien-lac-test"+(targetHash||"#/login");return true;}window.openKtnLoginModal=openKtnLoginModal;window.openKtnLogin=openKtnLoginModal;setInterval(function(){if(window.openKtnLogin!==openKtnLoginModal)window.openKtnLogin=openKtnLoginModal;if(window.openKtnLoginModal!==openKtnLoginModal)window.openKtnLoginModal=openKtnLoginModal;},300);try{if(window.location.pathname==="/"&&window.location.search.indexOf("login=1")!==-1){if(isMobileViewport()){window.location.replace("/custom-page/so-lien-lac-test#/login");}else{var loginPoll=0;var loginTimer=setInterval(function(){loginPoll=loginPoll+1;var emEl=document.querySelector("form.ant-form input#email");if(emEl||loginPoll===15){clearInterval(loginTimer);openKtnLoginModal();try{var cp=new URLSearchParams(window.location.search);cp.delete("login");var cqs=cp.toString();window.history.replaceState(null,"",window.location.pathname+(cqs?("?"+cqs):""));}catch(e){}}},120);}}}catch(e){}document.addEventListener("click",function(ev){var t=ev.target;if(!t||!t.closest)return;if(t.closest("#ktn-react-v2-root")||t.closest("#ktn-clean-portal-mount")||t.closest("#view-course-learning")||t.closest("#ktn-sll-root")||t.closest("form.ant-form"))return;ensureVendorOrigin();removeOldTray();enhanceKtnLoginForm();if(t.classList&&t.classList.contains("fixed")&&t.classList.contains("inset-0")&&t.querySelector("form.ant-form")){hideKtnLoginModal();return;}var btn=t.closest("button, a");if(btn){var txt=(btn.textContent||"").trim().toLowerCase();var oc=btn.getAttribute("onclick")||"";if(txt==="đăng nhập"||oc.indexOf("openKtnLogin")!==-1){if(hasSavedKtnSession()&&window.location.pathname.indexOf("so-lien-lac")===-1){ev.preventDefault();ev.stopPropagation();var savedHash="";try{savedHash=localStorage.getItem("ktn_pending_target_hash")||"";}catch(e){}window.location.href="/custom-page/so-lien-lac-test"+savedHash;return;}setTimeout(function(){enhanceKtnLoginForm();var emInput=document.querySelector("form.ant-form input#email");if(emInput){var card=emInput.closest(".ant-card");if(card)card.classList.add("ant-modal");var overlay=emInput.closest("div.fixed.inset-0");if(overlay){overlay.classList.remove("opacity-0","invisible");overlay.classList.add("opacity-100","visible");}}},60);}}},true);document.addEventListener("submit",function(){ensureVendorOrigin();setKtnLoginSubmitLoading(true);},true);function finishMockXhr(xhr,obj,st){var code=st||200;var txt=JSON.stringify(obj);setTimeout(function(){try{Object.defineProperty(xhr,"readyState",{value:4,configurable:true});Object.defineProperty(xhr,"status",{value:code,configurable:true});Object.defineProperty(xhr,"statusText",{value:code===200?"OK":"Bad Request",configurable:true});Object.defineProperty(xhr,"responseText",{value:txt,configurable:true});Object.defineProperty(xhr,"response",{value:xhr.responseType==="json"?obj:txt,configurable:true});xhr.getAllResponseHeaders=function(){return "content-type: application/json\\r\\n";};xhr.getResponseHeader=function(h){return String(h||"").toLowerCase()==="content-type"?"application/json":null;};if(typeof xhr.onreadystatechange==="function")xhr.onreadystatechange();if(typeof xhr.onload==="function")xhr.onload();if(typeof xhr.onloadend==="function")xhr.onloadend();xhr.dispatchEvent(new Event("readystatechange"));xhr.dispatchEvent(new Event("load"));xhr.dispatchEvent(new Event("loadend"));}catch(e){}},15);}function callKtnWorkerLogin(em,rawPwd){var bStr=JSON.stringify({email:em,password:rawPwd});var hn=String((window.location&&window.location.hostname)||"").toLowerCase();var isLoc=!hn||hn==="localhost"||hn==="127.0.0.1";return prevFetch("/api/ktn/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:bStr}).then(function(r){return r.json().catch(function(){return null;}).then(function(j){if(r.ok||r.status===401||r.status===403||isLoc)return {ok:r.ok,status:r.status,json:j};return prevFetch("https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev/api/ktn/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:bStr}).then(function(r2){return r2.json().catch(function(){return null;}).then(function(j2){return {ok:r2.ok,status:r2.status,json:j2};});});});}).catch(function(){if(isLoc)return null;return prevFetch("https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev/api/ktn/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:bStr}).then(function(r2){return r2.json().catch(function(){return null;}).then(function(j2){return {ok:r2.ok,status:r2.status,json:j2};});}).catch(function(){return null;});});}var prevOpen=XMLHttpRequest.prototype.open;var prevSend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__ktnMethod=m;this.__ktnUrl=String(u||"");return prevOpen.apply(this,arguments);};XMLHttpRequest.prototype.send=function(body){var u=String(this.__ktnUrl||"");if(u.indexOf("/student/signin")!==-1&&prevFetch){try{var parsed=typeof body==="string"?JSON.parse(body):(body||{});var em=normalizeKtnEmail(parsed.email||parsed.phone||"");var rawB64=parsed.password;var selfXhr=this;setKtnLoginSubmitLoading(true);var tryCreds=function(pwdB64){var pStr=JSON.stringify({email:em,password:pwdB64,vendorId:"3529cd2b-7af6-4fda-887c-392a79393d6a"});var rawPwd="";try{rawPwd=atob(pwdB64);}catch(e){rawPwd=pwdB64;}var staffProm=prevFetch("https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin",{method:"POST",headers:{"Content-Type":"application/json"},body:pStr}).then(function(r){return r.json().catch(function(){return null;}).then(function(j){if((!r.ok||!j||!j.accessToken)&&(em==="quanly@khongtunhi.com"||em==="khongtunhi@gmail.com")){var fbStr=JSON.stringify({email:"hocvienkhongtunhi123@gmail.com",password:pwdB64,vendorId:"3529cd2b-7af6-4fda-887c-392a79393d6a"});return prevFetch("https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin",{method:"POST",headers:{"Content-Type":"application/json"},body:fbStr}).then(function(rf){return rf.json().catch(function(){return null;}).then(function(jf){return {ok:rf.ok,status:rf.status,json:jf,portal:"staff"};});});}return {ok:r.ok,status:r.status,json:j,portal:"staff"};});});return Promise.allSettled([prevFetch("https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin",{method:"POST",headers:{"Content-Type":"application/json"},body:pStr}).then(function(r){return r.json().then(function(j){return {ok:r.ok,status:r.status,json:j,portal:"student"};});}),staffProm,callKtnWorkerLogin(em,rawPwd)]);};tryCreds(rawB64).then(function(results){var stRes=results[0]&&results[0].status==="fulfilled"?results[0].value:null;var sfRes=results[1]&&results[1].status==="fulfilled"?results[1].value:null;var ktnRes=results[2]&&results[2].status==="fulfilled"?results[2].value:null;var bothRejected=Boolean(results[0]&&results[0].status==="rejected"&&results[1]&&results[1].status==="rejected"&&!ktnRes);var isStaffHit=Boolean(sfRes&&sfRes.ok&&sfRes.json&&Array.isArray(sfRes.json.roles)&&(sfRes.json.roles.indexOf("root")!==-1||sfRes.json.roles.indexOf("admin")!==-1||sfRes.json.roles.indexOf("teacher")!==-1));var hit=isStaffHit?sfRes:((stRes&&stRes.ok&&stRes.json&&stRes.json.accessToken)?stRes:((sfRes&&sfRes.ok&&sfRes.json&&sfRes.json.accessToken)?sfRes:null));return {hit:hit,stRes:stRes,ktnRes:ktnRes,bothRejected:bothRejected};}).then(function(out){setKtnLoginSubmitLoading(false);var hit=out.hit;var stRes=out.stRes;var ktnRes=out.ktnRes;var bothRejected=out.bothRejected;if(ktnRes&&(ktnRes.status===401||ktnRes.status===403)){hit=null;}else if(!hit&&ktnRes&&ktnRes.ok&&ktnRes.json&&ktnRes.json.ok&&ktnRes.json.session){hit={ok:true,status:200,portal:ktnRes.json.session.role==="student"?"student":"staff",json:Object.assign({},ktnRes.json.session,{accessToken:ktnRes.json.token||"KTN-SESSION-VERIFIED"})};}if(hit){window.__ktnLoggingOut=false;showKtnModalError("");var ktnSession=(ktnRes&&ktnRes.ok&&ktnRes.json&&ktnRes.json.session)?ktnRes.json.session:{};var data=Object.assign({},hit.json,ktnSession,{email:em});delete data.izteachAccessToken;if(em==="hocvienkhongtunhi123@gmail.com"||em==="quanly@khongtunhi.com"||em==="khongtunhi@gmail.com"){data.role="admin";data.roles=["admin"];}if(ktnRes&&ktnRes.ok&&ktnRes.json&&ktnRes.json.token){data.token=ktnRes.json.token;data.accessToken=ktnRes.json.token;}try{sessionStorage.setItem("ktn_sll_view","connected");sessionStorage.setItem("ktn_sll_fresh_login","1");saveGlobalKtnSession(data);}catch(e){}finishMockXhr(selfXhr,data,200);setTimeout(function(){clearAntNotices();hideKtnLoginModal();var targetHash="";try{targetHash=localStorage.getItem("ktn_pending_target_hash")||"";localStorage.removeItem("ktn_pending_target_hash");}catch(e){}var destUrl="/custom-page/so-lien-lac-test"+(targetHash||"");window.location.replace(destUrl);},120);}else if(bothRejected){var netErrObj={message:"Chưa kết nối được. Em thử lại nhé."};showKtnModalError("Chưa kết nối được. Em thử lại nhé.");finishMockXhr(selfXhr,netErrObj,503);}else{var errObj=(ktnRes&&ktnRes.json)||(stRes&&stRes.json)||{message:"Em hãy kiểm tra lại tài khoản hoặc mật khẩu"};var errStatus=(ktnRes&&ktnRes.status)||(stRes&&stRes.status)||400;showKtnModalError((ktnRes&&ktnRes.json&&ktnRes.json.message)||"Em hãy kiểm tra lại tài khoản hoặc mật khẩu");finishMockXhr(selfXhr,errObj,errStatus);}});return;}catch(e){setKtnLoginSubmitLoading(false);}}if(u.indexOf("/prod/student/undefined")!==-1){finishMockXhr(this,{id:"STAFF-KTN",name:"Thành viên Khổng Tử Nhí",state:"verified"},200);return;}return prevSend.apply(this,arguments);};function pollLiveKtnPush(){if(!hasSavedKtnSession()||window.location.pathname==="/")return;if(window.KTN_NOTIF&&typeof window.KTN_NOTIF.pullCloudNotifications==="function"){window.KTN_NOTIF.pullCloudNotifications();}}setTimeout(pollLiveKtnPush,1200);setInterval(pollLiveKtnPush,10000);})();`;

  // 4. Prepare JS with native izTeach auth & instant initialization
  const nativeAuthJs = `
/* ============================================================ */
/* Native izTeach Client-Side Authentication & Session Provider  */
/* ============================================================ */
${ktnGlobalAuthHook}
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { admin: 'Quản lý trung tâm', teacher: 'Giáo viên', parent: 'Học sinh', student: 'Học sinh' };
  const roleBadges = { admin: 'Quản lý', teacher: 'Giáo viên', parent: 'Học viên', student: 'Học viên' };
  const VENDOR_ID = '${VENDOR_ID}';

  let applyAppRoleInternal = null;

  const auth = {
    session: null, mode: 'locked', activeRole: null, expiryTimer: null,

    sessionRole() {
      return this.activeRole || this.session?.roles?.[0] || null;
    },
    canUseRole(role) {
      if (this.mode !== 'connected') return true;
      const r = this.sessionRole();
      if (r === 'student' || r === 'parent') return role === 'parent' || role === 'student';
      if (r === 'admin') return role === 'admin' || (role === 'parent' && Boolean(window.app?.adminPreviewingStudent));
      return r === role;
    },
    canAccessAdminStudent() {
      if (this.mode !== 'connected') return window.app?.currentRole === 'admin';
      return this.sessionRole() === 'admin';
    },

    closeOpenDialogs() {
      window.app?.closeCoursePlayer?.();
      window.app?.closeMediaZoom?.();
      window.app?.closeYctGameModal?.();
      window.app?.closePwaNotifyModal?.();
      ['admin-student-dialog', 'course-player-dialog', 'action-dialog', 'media-zoom-dialog', 'yct-game-dialog', 'pwa-notify-dialog'].forEach(id => {
        const dlg = $(id);
        if (dlg && (dlg.open || dlg.hasAttribute('open'))) {
          try { dlg.close(); } catch (e) {}
        }
      });
      document.querySelectorAll('.ant-notification-notice, .ant-message-notice, .ant-message').forEach(n => n.remove());
    },

    setMode(mode) {
      this.mode = mode;
      const root = $('ktn-sll-root') || document.body;
      root.dataset.auth = mode;
      document.body.dataset.auth = mode;
      if ($('auth-shell')) $('auth-shell').classList.toggle('hidden', mode !== 'locked');
      if ($('auth-workspace')) $('auth-workspace').classList.add('hidden');
      if ($('header-auth-user')) $('header-auth-user').classList.toggle('hidden', mode !== 'connected');
      if ($('demo-auth-bar')) $('demo-auth-bar').classList.toggle('hidden', mode !== 'demo');
      const skip = document.querySelector('.skip-link');
      if (skip) skip.href = (mode === 'demo' || mode === 'connected') ? '#main-content' : '#auth-shell';
      try { sessionStorage.setItem('ktn_sll_view', mode); } catch (e) {}
      window.app?._measureResponsiveLayout?.();
    },

    showError(msg) {
      const err = $('auth-error');
      if (!err) return;
      err.textContent = msg;
      err.classList.toggle('hidden', !msg);
    },

    showLogin(msg = '') {
      clearTimeout(this.expiryTimer);
      this.session = null;
      this.activeRole = null;
      this.closeOpenDialogs();
      if (window.app) window.app.adminPreviewingStudent = false;
      window.location.replace('/?login=1');
    },

    enterDemo() {
      this.closeOpenDialogs();
      if (window.app) window.app.adminPreviewingStudent = false;
      this.setMode('demo');
      if (window.app?.renderAll) window.app.renderAll();
    },

    normalizeEmail(raw) {
      const s = String(raw || '').trim().toLowerCase();
      if (!s) return '';
      const directMap = {
        'taphong2002': 'taphong2002@gmail.com',
        'taphong': 'taphong2002@gmail.com',
        'taphong2002@gmail.com': 'taphong2002@gmail.com',
        'hoangngan': 'hoangngan@khongtunhi.com',
        'hoangngan.ktn@gmail.com': 'hoangngan@khongtunhi.com',
        'hoangngan.yct@gmail.com': 'hoangngan@khongtunhi.com',
        'dachanh': 'dachanh@khongtunhi.com',
        'dachanh.ktn@gmail.com': 'dachanh@khongtunhi.com',
        'anman': 'anman@khongtunhi.com',
        'anman.ktn@gmail.com': 'anman@khongtunhi.com',
        'minhkhang': 'minhkhang@khongtunhi.com',
        'minhkhang.ktn@gmail.com': 'minhkhang@khongtunhi.com',
        'baochau': 'baochau@khongtunhi.com',
        'baochau.ktn@gmail.com': 'baochau@khongtunhi.com',
        'giabao': 'giabao@khongtunhi.com',
        'giabao.ktn@gmail.com': 'giabao@khongtunhi.com',
        'linhlm': 'linh.lam@khongtunhi.com',
        'linhlm@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'linh.lam@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'lam.mylinh@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'linhlam.ktn@gmail.com': 'linh.lam@khongtunhi.com',
        'linhlam@gmail.com': 'linh.lam@khongtunhi.com',
        'colinh': 'linh.lam@khongtunhi.com',
        'mylinh': 'linh.lam@khongtunhi.com',
        'giaovien': 'linh.lam@khongtunhi.com',
        'giaovien@khongtunhi.com': 'linh.lam@khongtunhi.com',
        'gv': 'linh.lam@khongtunhi.com',
        'teacher': 'linh.lam@khongtunhi.com',
        'hatt': 'thu.ha@khongtunhi.com',
        'hatt@khongtunhi.com': 'thu.ha@khongtunhi.com',
        'thu.ha@khongtunhi.com': 'thu.ha@khongtunhi.com',
        'coha': 'thu.ha@khongtunhi.com',
        'admin': 'hocvienkhongtunhi123@gmail.com',
        'quanly': 'quanly@khongtunhi.com',
        'khongtunhi': 'khongtunhi@gmail.com',
        'khongtunhi@gmail.com': 'khongtunhi@gmail.com'
      };
      if (directMap[s]) return directMap[s];
      if (window.app) {
        const hitT = (window.app.teachers || []).find(t =>
          String(t.email || '').toLowerCase() === s ||
          (Array.isArray(t.aliases) && t.aliases.some(a => String(a || '').toLowerCase() === s))
        );
        if (hitT && hitT.email) return String(hitT.email).toLowerCase();
        const hitS = (window.app.students || []).find(st =>
          String(st.email || '').toLowerCase() === s ||
          (Array.isArray(st.aliases) && st.aliases.some(a => String(a || '').toLowerCase() === s))
        );
        if (hitS && hitS.email) return String(hitS.email).toLowerCase();
      }
      if (typeof window.__normalizeKtnEmail === 'function') return window.__normalizeKtnEmail(raw);
      return s.includes('@') ? s : (s + '@khongtunhi.com');
    },

    showSession(session) {
      this.closeOpenDialogs();
      this.session = session;
      this.activeRole = session.roles[0];
      if (session?.account?.email) {
        session.account.email = this.normalizeEmail(session.account.email);
        if (typeof window.__saveGlobalKtnSession === 'function') {
          window.__saveGlobalKtnSession({
            id: session.account.id || session.account.email,
            studentId: session.account.id || session.account.email,
            name: session.account.name || session.account.email.split('@')[0],
            email: session.account.email,
            roles: session.roles,
            token: session.token || undefined,
            classCode: session.classCode || undefined,
            onlineCourses: session.onlineCourses || undefined,
            accessToken: session.accessToken || 'KTN-PERSIST-TOKEN',
            accessTokenExpiredAt: Date.now() + 365 * 86400000
          });
        }
        if (!session.token && typeof fetch === 'function') {
          const curHost = String((typeof window !== 'undefined' && window.location && window.location.hostname) || '').toLowerCase();
          const isLocal = !curHost || curHost === 'localhost' || curHost === '127.0.0.1';
          const sessionUrl = isLocal ? '/api/ktn/auth/session' : 'https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev/api/ktn/auth/session';
          fetch(sessionUrl, { method: 'GET', credentials: isLocal ? 'same-origin' : 'include', cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d && d.ok && d.token && this.session && this.session.account?.email === session.account.email) {
                this.session.token = d.token;
                if (d.session?.classCode && !this.session.classCode) this.session.classCode = d.session.classCode;
                if (typeof window.__saveGlobalKtnSession === 'function') {
                  window.__saveGlobalKtnSession({
                    id: session.account.id || session.account.email,
                    studentId: session.account.id || session.account.email,
                    name: session.account.name || session.account.email.split('@')[0],
                    email: session.account.email,
                    roles: session.roles,
                    token: d.token,
                    classCode: d.session?.classCode || session.classCode,
                    onlineCourses: d.session?.onlineCourses || session.onlineCourses,
                    accessToken: session.accessToken || 'KTN-PERSIST-TOKEN',
                    accessTokenExpiredAt: Date.now() + 365 * 86400000
                  });
                }
              }
            })
            .catch(() => {});
        }
        window.app?.updatePwaManifestForUser?.(session.account.email);
      }
      if ($('auth-work-title')) $('auth-work-title').textContent = 'Không gian ' + (labels[this.activeRole] || this.activeRole).toLowerCase();
      const items = [
        ['Tài khoản', session.account.email],
        ['Quyền tự động nhận diện', session.roles.map(r => labels[r] || r).join(', ')],
        ['Phạm vi dữ liệu', session.access?.scope === 'center' ? 'Toàn bộ trung tâm' : (session.access?.scope === 'assigned' ? 'Lớp và học sinh được giao' : 'Hồ sơ của mình')]
      ];
      if ($('auth-account-info')) {
        $('auth-account-info').replaceChildren(...items.map(([l, v]) => {
          const b = document.createElement('div'), t = document.createElement('span'), tx = document.createElement('strong');
          t.textContent = l; tx.textContent = v; b.append(t, tx); return b;
        }));
      }
      if ($('auth-role-menu')) {
        $('auth-role-menu').replaceChildren(...session.roles.map(role => {
          const el = document.createElement('button');
          el.type = 'button'; el.className = 'btn-ghost'; el.textContent = labels[role] || role; el.dataset.role = role;
          el.addEventListener('click', () => this.switchWorkspaceRole(role));
          return el;
        }));
        $('auth-role-menu').classList.toggle('hidden', session.roles.length <= 1);
      }
      this.setMode('connected');
      this.showError('');
      if ($('header-auth-user')) $('header-auth-user').classList.remove('hidden');
      this.switchWorkspaceRole(this.activeRole);
      try {
        sessionStorage.removeItem('ktn_sll_fresh_login');
      } catch (e) {}
      if (typeof window.__syncKtnPortalViewByRole === 'function') window.__syncKtnPortalViewByRole();
    },

    switchWorkspaceRole(role) {
      if (!this.session?.roles.includes(role)) return false;
      this.activeRole = role;
      this.syncWorkspace(role);
      let resolvedName = this.session.account.name || this.session.account.email;
      if ((role === 'student' || role === 'parent') && window.app) {
        const activeStu = window.app.getActiveParentStudent?.();
        if (activeStu && activeStu.name) resolvedName = activeStu.name;
      } else if (role === 'teacher' && window.app?.state?.teacherName) {
        resolvedName = window.app.state.teacherName;
      }
      if ($('auth-work-title')) $('auth-work-title').textContent = 'Không gian ' + (labels[role] || role).toLowerCase();
      if ($('auth-welcome')) $('auth-welcome').textContent = 'Xin chào, ' + resolvedName;
      if ($('header-user-role')) $('header-user-role').textContent = 'Vai trò: ' + (roleBadges[role] || 'Học viên');
      if ($('auth-role-menu')) $('auth-role-menu').querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.role === role)));
      if ($('auth-check-access')) $('auth-check-access').classList.toggle('hidden', role !== 'admin');
      if ($('auth-provider-admin')) $('auth-provider-admin').classList.toggle('hidden', role !== 'admin');
      if ($('auth-connection-result')) $('auth-connection-result').classList.add('hidden');

      let studentDesc = ['Theo dõi việc học và gửi bài trong hồ sơ của mình.', [['Việc học của mình', 'Bài tập, nhận xét, khóa học video và trao đổi liên quan đến mình.']]];
      if ((role === 'student' || role === 'parent') && window.app) {
        const idx = typeof window.app.ensureStudentForSession === 'function'
          ? window.app.ensureStudentForSession(this.session)
          : (typeof this.session?.studentIdx === 'number' ? this.session.studentIdx : -1);
        if (idx >= 0 && window.app.students[idx]) {
          const stu = window.app.students[idx];
          const caseType = window.app.computeStudentCase(stu);
          const meta = window.app.getCaseMeta(caseType);
          studentDesc = [
            meta.title + ' — ' + meta.desc,
            stu.hasLiveClass && stu.classCode
              ? [
                  ['Sổ Liên Lạc lớp ' + stu.classCode, 'Trao đổi với giáo viên và nộp bài tập video/ảnh lớp ' + stu.classCode + '.'],
                  ['Khóa học trực tuyến', 'Truy cập các khóa học video đã đăng ký.']
                ]
              : [
                  ['Khóa học trực tuyến', 'Truy cập các khóa học video đã đăng ký.'],
                  ['Lớp học trực tiếp', 'Tài khoản chưa đăng ký lớp trực tiếp với giáo viên.']
                ]
          ];
        }
      }

      const descriptions = {
        admin: ['Điều hành toàn trung tâm. Xem tổng thể và chi tiết, phân công giáo viên, quản lý lớp, học sinh, tài khoản và báo cáo.', [
          ['Tổng quan trung tâm', 'Theo dõi tất cả lớp, học sinh, tiến độ và tình hình học tập.'],
          ['Giáo viên & phân công', 'Giao hoặc thu hồi lớp và học sinh cho từng giáo viên.'],
          ['Học vụ & liên lạc', 'Theo dõi bài tập, nhận xét, chuyên cần và trao đổi trong toàn trung tâm.'],
          ['Báo cáo & quản trị', 'Nắm báo cáo, học phí và quyền tài khoản trong trung tâm.']
        ]],
        teacher: ['Chỉ làm việc với lớp và học sinh do quản lý trung tâm phân công. Không tự phân công, quản lý tài khoản hay xem dữ liệu toàn trung tâm.', [
          ['Lớp được giao', 'Xem và thực hiện công việc dạy học trong phạm vi phân công.'],
          ['Học sinh được giao', 'Theo dõi học tập, chấm bài và trao đổi với phụ huynh đúng phạm vi.']
        ]],
        student: studentDesc
      }[role] || ['Không gian làm việc', []];
      if ($('auth-scope-summary')) $('auth-scope-summary').textContent = descriptions[0];
      if ($('auth-role-capabilities')) {
        $('auth-role-capabilities').replaceChildren(...descriptions[1].map(([title, desc]) => {
          const card = document.createElement('div'), h = document.createElement('h3'), p = document.createElement('p');
          h.textContent = title; p.textContent = desc; card.append(h, p); return card;
        }));
      }
      return true;
    },

    syncWorkspace(role) {
      if (!window.app) return;
      const appRole = (role === 'student' || role === 'parent') ? 'parent' : (role === 'teacher' ? 'teacher' : 'admin');
      const runSwitch = applyAppRoleInternal || window.app.switchRole.bind(window.app);
      window.app.adminPreviewingStudent = false;
      if (appRole === 'teacher') {
        window.app.applyTeacherSession?.(this.session);
      } else if (appRole === 'parent') {
        const idx = typeof window.app.ensureStudentForSession === 'function'
          ? window.app.ensureStudentForSession(this.session)
          : (typeof this.session?.studentIdx === 'number' ? this.session.studentIdx : 0);
        window.app.selectParentStudent?.(idx);
      }
      if (window.app.currentRole !== appRole) {
        runSwitch(appRole);
      } else {
        window.app.renderAll?.();
        if (window.app.lmsApply) window.app.lmsApply();
      }
    },

    async checkAccess() {
      const button = $('auth-check-access');
      if (!button) return;
      button.disabled = true;
      try {
        if ($('auth-connection-result')) {
          $('auth-connection-result').textContent = 'Đã xác thực quyền Quản lý trung tâm trên hệ thống izTeach: phạm vi toàn bộ trung tâm.';
          $('auth-connection-result').classList.remove('hidden');
        }
      } finally {
        button.disabled = false;
      }
    },

    async login(event) {
      if (event) {
        event.preventDefault();
        if (event.__ktnLoginHandled) return;
        event.__ktnLoginHandled = true;
      }
      this.showError('');
      const submit = $('auth-submit');
      if (submit) { submit.disabled = true; submit.textContent = 'Đang xác thực tài khoản…'; }
      const rawLoginInput = String($('auth-email')?.value || '').trim();
      const password = $('auth-password')?.value || '';

      if (!rawLoginInput || !password || password.length < 6) {
        this.showError('Vui lòng nhập tài khoản/email và mật khẩu ít nhất 6 ký tự.');
        if (submit) { submit.disabled = false; submit.textContent = 'Đăng nhập'; }
        return;
      }

      if (window.app?.pullSilentCloudState) {
        await window.app.pullSilentCloudState(true).catch(() => false);
      }

      const email = this.normalizeEmail(rawLoginInput);
      const pwdCandidates = [password];
      const endpoints = [
        ['staff', 'https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin'],
        ['student', 'https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin']
      ];

      try {
        let hit = null;
        let staffHit = null;
        let studentHit = null;
        for (const candPwd of pwdCandidates) {
          const b64Password = btoa(unescape(encodeURIComponent(candPwd)));
          const probes = await Promise.allSettled(endpoints.map(async ([pType, endpoint]) => {
            const resp = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password: b64Password, vendorId: VENDOR_ID })
            });
            const json = await resp.json().catch(() => null);
            if (resp.ok && json && json.accessToken) return { pType, json };
            if (pType === 'staff' && (email === 'quanly@khongtunhi.com' || email === 'khongtunhi@gmail.com')) {
              const fbResp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'hocvienkhongtunhi123@gmail.com', password: b64Password, vendorId: VENDOR_ID })
              });
              const fbJson = await fbResp.json().catch(() => null);
              if (fbResp.ok && fbJson && fbJson.accessToken) return { pType, json: fbJson };
            }
            throw new Error(json?.message || 'Unauthorized');
          }));

          staffHit = probes[0].status === 'fulfilled' ? probes[0].value : null;
          studentHit = probes[1].status === 'fulfilled' ? probes[1].value : null;
          const isStaffRole = staffHit && Array.isArray(staffHit.json?.roles) &&
            (staffHit.json.roles.includes('root') || staffHit.json.roles.includes('admin') || staffHit.json.roles.includes('teacher'));
          hit = isStaffRole ? staffHit : (studentHit || staffHit);
          if (hit) break;
        }

        const loginBodyStr = JSON.stringify({ email, password });
        const curHost = String((typeof window !== 'undefined' && window.location && window.location.hostname) || '').toLowerCase();
        const isLocalHost = !curHost || curHost === 'localhost' || curHost === '127.0.0.1';
        let ktnLoginRes = await fetch('/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: loginBodyStr
        }).then(async r => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => null) })).catch(() => null);

        if ((!ktnLoginRes || (!ktnLoginRes.ok && ktnLoginRes.status !== 401 && ktnLoginRes.status !== 403)) && !isLocalHost) {
          const fbWorkerRes = await fetch('https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev/api/ktn/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: loginBodyStr
          }).then(async r => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => null) })).catch(() => null);
          if (fbWorkerRes) ktnLoginRes = fbWorkerRes;
        }

        if (ktnLoginRes && (ktnLoginRes.status === 401 || ktnLoginRes.status === 403)) {
          hit = null;
        } else if (!hit && ktnLoginRes && ktnLoginRes.ok && ktnLoginRes.json && ktnLoginRes.json.ok && ktnLoginRes.json.session) {
          hit = {
            pType: ktnLoginRes.json.session.role === 'student' ? 'student' : 'staff',
            json: {
              ...ktnLoginRes.json.session,
              accessToken: ktnLoginRes.json.token || 'KTN-SESSION-VERIFIED'
            }
          };
        }
        if (!hit) {
          throw new Error(ktnLoginRes?.json?.message || ktnLoginRes?.json?.error || 'Đăng nhập không thành công. Kiểm tra lại email hoặc mật khẩu.');
        }

        const { pType: matchedPortal, json: rawData } = hit;
        const data = { ...rawData, email };
        delete data.izteachAccessToken;
        if (!data.studentId && staffHit?.json?.studentId) data.studentId = staffHit.json.studentId;
        if (ktnLoginRes && ktnLoginRes.ok && ktnLoginRes.json && ktnLoginRes.json.token) {
          data.token = ktnLoginRes.json.token;
          data.accessToken = ktnLoginRes.json.token;
          if (ktnLoginRes.json.session?.classCode) data.classCode = ktnLoginRes.json.session.classCode;
        }

        const upstreamRoles = Array.isArray(data.roles) ? data.roles : [];
        const isKnownTeacher = Boolean((window.app?.teachers || []).some(t => String(t.email || '').toLowerCase() === email));
        const roles = [];
        if (upstreamRoles.includes('root') || upstreamRoles.includes('admin') || email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com' || email === 'khongtunhi@gmail.com') {
          roles.push('admin');
        } else if (upstreamRoles.includes('teacher') || data.type === 'teacher' || isKnownTeacher) {
          roles.push('teacher');
        } else {
          roles.push('student');
        }
        data.role = roles[0];
        data.roles = roles;

        try {
          sessionStorage.setItem('ktn_sll_fresh_login', '1');
          if (typeof window.__saveGlobalKtnSession === 'function') {
            window.__saveGlobalKtnSession(data);
          } else {
            const enc = window.IZTEACH_STORAGE?.encodeAuthUser ? window.IZTEACH_STORAGE.encodeAuthUser(data) : JSON.stringify(data);
            localStorage.setItem('ol-credentials-auth-user', enc);
            localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify(data));
            localStorage.setItem('sll_session_v2', JSON.stringify(data));
            if (data.token) localStorage.setItem('sll_ktn_token', data.token);
          }
          localStorage.setItem('ol-amplify-vendorId-from-origin', JSON.stringify({ payload: { vendorId: VENDOR_ID }, expiredAt: Date.now() + 864e5 }));
        } catch (e) {}

        const session = {
          account: { id: data.studentId || data.id || email, name: data.name || email.split('@')[0], email, vendorId: VENDOR_ID },
          roles,
          access: { scope: roles.includes('admin') ? 'center' : (roles.includes('teacher') ? 'assigned' : 'self') },
          token: data.token,
          classCode: data.classCode,
          onlineCourses: data.onlineCourses,
          accessToken: data.accessToken,
          expiresAt: Date.now() + 365 * 86400000
        };

        if ($('auth-password')) $('auth-password').value = '';
        window.__ktnLoggingOut = false;
        this.showSession(session);
        if (window.app?.showToast) window.app.showToast('Đăng nhập thành công: ' + (labels[roles[0]] || roles[0]));
      } catch (err) {
        if ($('auth-password')) $('auth-password').value = '';
        this.showError(err.message || 'Đăng nhập không thành công. Kiểm tra lại email hoặc mật khẩu.');
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = 'Đăng nhập'; }
      }
    },

    _applyRestoredUser(rawUser) {
      if (!rawUser || window.__ktnLoggingOut) return false;
      const user = rawUser.user || rawUser.account || rawUser.payload || rawUser;
      const email = this.normalizeEmail(user.email || rawUser.email || '');
      if (!email) return false;
      const name = String(user.name || rawUser.name || email.split('@')[0]).trim();
      const id = String(user.id || user.studentId || rawUser.id || rawUser.studentId || email).trim();
      const upstreamRoles = Array.isArray(user.roles) ? user.roles : (Array.isArray(rawUser.roles) ? rawUser.roles : []);
      const isKnownTeacher = Boolean((window.app?.teachers || []).some(t => String(t.email || '').toLowerCase() === email));
      const roles = [];
      if (upstreamRoles.includes('root') || upstreamRoles.includes('admin') || email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com' || email === 'khongtunhi@gmail.com') roles.push('admin');
      else if (upstreamRoles.includes('teacher') || user.type === 'teacher' || rawUser.type === 'teacher' || isKnownTeacher) roles.push('teacher');
      else roles.push('student');

      this.showSession({
        account: { id, name, email, vendorId: VENDOR_ID },
        roles,
        access: { scope: roles.includes('admin') ? 'center' : (roles.includes('teacher') ? 'assigned' : 'self') },
        token: rawUser.token || user.token,
        classCode: rawUser.classCode || user.classCode,
        onlineCourses: rawUser.onlineCourses || user.onlineCourses,
        accessToken: rawUser.accessToken || user.accessToken || 'KTN-PERSIST-TOKEN',
        expiresAt: Date.now() + 365 * 86400000
      });
      return true;
    },

    restoreSession() {
      if (window.__ktnLoggingOut) {
        this.showLogin();
        return;
      }
      try {
        let user = null;
        try {
          const rawV2 = localStorage.getItem('ktn_sll_persistent_auth_v2');
          if (rawV2) user = JSON.parse(rawV2);
        } catch (e) {}
        if (!user) {
          try {
            const rawOl = localStorage.getItem('ol-credentials-auth-user');
            if (rawOl && window.IZTEACH_STORAGE?.decodeAuthUser) {
              user = window.IZTEACH_STORAGE.decodeAuthUser(rawOl);
            }
          } catch (e) {}
        }
        if (!user) {
          try {
            const m = document.cookie.match(/(?:^|;\s*)ktn_sll_auth_v2=([^;]+)/);
            if (m && m[1]) user = JSON.parse(decodeURIComponent(m[1]));
          } catch (e) {}
        }
        // [SEC-02 FIXED] Xóa bỏ hoàn toàn cửa hậu ?ktn_user= trên URL
        try {
          const curParams = new URLSearchParams(window.location.search);
          if (curParams.has('ktn_user')) {
            curParams.delete('ktn_user');
            const qs = curParams.toString();
            window.history.replaceState(null, '', window.location.pathname + (qs ? ('?' + qs) : ''));
          }
        } catch (e) {}
        if (this._applyRestoredUser(user)) return;

        if (window.caches && typeof window.caches.open === 'function') {
          window.caches.open('ktn-sll-auth-v2').then(c => c.match('/__ktn_session__')).then(r => r ? r.json() : null).then(cached => {
            if (cached && this.mode === 'locked' && !window.__ktnLoggingOut) {
              this._applyRestoredUser(cached);
            }
          }).catch(() => {});
        }
      } catch (e) {}

      this.showLogin();
    },

    async logout(opts = {}) {
      window.__ktnLoggingOut = true;
      window.__ktnAllowLogout = true;
      if (window.KtnWebApp && typeof window.KtnWebApp.logout === 'function') {
        return window.KtnWebApp.logout(opts);
      }
      try {
        localStorage.removeItem('ktn_sll_persistent_auth_v2');
        localStorage.removeItem('ol-credentials-auth-user');
        localStorage.removeItem('ol-credentials-access-token');
        localStorage.removeItem('ktn_webapp_session_v1');
      } catch (e) {}
      try {
        sessionStorage.removeItem('ktn_sll_view');
        sessionStorage.removeItem('ktn_sll_auth');
      } catch (e) {}
      try {
        document.cookie = 'ktn_sll_auth_v2=; path=/; max-age=0; SameSite=Lax';
      } catch (e) {}
      try {
        if (window.caches && typeof window.caches.open === 'function') {
          const c = await window.caches.open('ktn-sll-auth-v2');
          await c.delete('/__ktn_session__');
          await window.caches.delete('ktn-sll-auth-v2');
        }
      } catch (e) {}
      try {
        await new Promise((resolve, reject) => {
          if (!window.indexedDB) return resolve(false);
          const req = indexedDB.open('ktn_webapp_auth_db', 1);
          req.onupgradeneeded = () => {
            try {
              const db = req.result;
              if (!db.objectStoreNames.contains('session_store')) db.createObjectStore('session_store');
            } catch (e) {}
          };
          req.onsuccess = () => {
            try {
              const db = req.result;
              const tx = db.transaction('session_store', 'readwrite');
              tx.objectStore('session_store').delete('active_session');
              tx.oncomplete = () => { try { db.close(); } catch (e) {} resolve(true); };
              tx.onerror = () => { try { db.close(); } catch (e) {} reject(tx.error || new Error('IDB_DELETE_ERROR')); };
              tx.onabort = () => { try { db.close(); } catch (e) {} reject(tx.error || new Error('IDB_DELETE_ABORTED')); };
            } catch (err) { reject(err); }
          };
          req.onerror = () => reject(req.error || new Error('IDB_OPEN_ERROR'));
        });
      } catch (err) {
        window.__ktnLoggingOut = false;
        window.__ktnAllowLogout = false;
        window.alert('Chưa xóa xong dữ liệu phiên đăng nhập. Vui lòng bấm Đăng xuất lại.');
        return false;
      }
      try {
        const curHost = String((typeof window !== 'undefined' && window.location && window.location.hostname) || '').toLowerCase();
        const isLocal = !curHost || curHost === 'localhost' || curHost === '127.0.0.1';
        let res = await fetch('/api/ktn/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null);
        if ((!res || !res.ok) && !isLocal) {
          res = await fetch('https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev/api/ktn/auth/logout', { method: 'POST', credentials: 'include' });
        }
        if (!res || !res.ok) throw new Error('HTTP_' + (res ? res.status : 'ERR'));
      } catch (err) {
        window.__ktnLoggingOut = false;
        window.__ktnAllowLogout = false;
        window.alert('Không thể xác nhận đăng xuất với máy chủ. Vui lòng thử lại.');
        return false;
      }
      window.__ktnAllowLogout = false;
      window.location.replace(opts.redirectUrl || '/?login=1');
      return true;
    },

    init() {
      const submit = $('auth-submit');
      if (submit) submit.disabled = false;
      if (!window.__ktnSllDocDelegated) {
        window.__ktnSllDocDelegated = true;
        document.addEventListener('submit', e => {
          if (e.target && e.target.id === 'auth-form') {
            e.preventDefault();
            window.sllAuth?.login(e);
          }
        });
        document.addEventListener('click', e => {
          const t = e.target;
          if (!t) return;
          if (t.tagName === 'DIALOG' && t.open && e.clientX > 0 && e.clientY > 0) {
            const r = t.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
              window.sllAuth?.closeOpenDialogs();
              return;
            }
          }
          if (!t.closest) return;
          if (t.closest('#auth-logout')) {
            e.preventDefault();
            window.sllAuth?.logout();
          } else if (t.closest('#auth-check-access')) {
            e.preventDefault();
            window.sllAuth?.checkAccess();
          } else if (t.closest('#auth-toggle-password')) {
            e.preventDefault();
            const btn = t.closest('#auth-toggle-password');
            const inp = $('auth-password');
            if (!inp) return;
            const vis = inp.type === 'password';
            inp.type = vis ? 'text' : 'password';
            btn.textContent = vis ? 'Ẩn' : 'Hiện';
            btn.setAttribute('aria-pressed', String(vis));
          }
        });
      }
      if (window.app && window.app.switchRole && !applyAppRoleInternal) {
        applyAppRoleInternal = window.app.switchRole.bind(window.app);
        window.app.switchRole = role => {
          const normalized = role === 'student' ? 'parent' : role;
          if (this.mode === 'connected') {
            if (this.sessionRole() === 'admin' && ((normalized === 'parent' && window.app?.adminPreviewingStudent) || normalized === 'admin')) {
              return applyAppRoleInternal(normalized);
            }
            return false;
          }
          return applyAppRoleInternal(normalized);
        };
      }
      this.restoreSession();
    }
  };

  window.sllAuth = auth;
})();
`;

  // Combine JS (Admin/Teacher Sổ Liên Lạc + Clean HSK1 3.0 Student Portal + Role Router)
  const finalJs = replaceSllAssets(`
/* ============================================================ */
/* Sổ Liên Lạc Điện Tử & Cổng Học Viên — Khổng Tử Nhí Runtime    */
/* ============================================================ */
${inlineJs}
${uxJs}
${lmsJs}
${nativeAuthJs}
${webappClientJs}

/* ============================================================ */
/* Clean HSK1 3.0 Student Portal Module                         */
/* ============================================================ */
(function initCleanPortalScope() {
  try {
    var dupMounts = document.querySelectorAll('#ktn-clean-portal-mount');
    if (dupMounts.length > 1) {
      for (var dIdx = 1; dIdx < dupMounts.length; dIdx++) {
        dupMounts[dIdx].remove();
      }
    }
${cleanRawJs}
  } catch (err) {
    console.error('[KTN-CLEAN-PORTAL] Module load error:', err);
  }
})();

/* ============================================================ */
/* Role-Based View Router: Admin/Teacher <-> Student Portal     */
/* ============================================================ */
window.__syncKtnPortalViewByRole = function() {
  var sllRoot = document.getElementById('ktn-sll-root');
  var allCleanMounts = document.querySelectorAll('#ktn-clean-portal-mount');
  if (allCleanMounts.length > 1) {
    for (var i = 1; i < allCleanMounts.length; i++) {
      allCleanMounts[i].remove();
    }
  }
  var cleanMount = allCleanMounts[0] || document.getElementById('ktn-clean-portal-mount');
  if (!sllRoot || !cleanMount) return;

  var user = (typeof window.getRealCurrentUser === 'function' ? window.getRealCurrentUser() : null)
    || (window.sllAuth && window.sllAuth.session && window.sllAuth.session.account ? {
         id: window.sllAuth.session.account.id,
         name: window.sllAuth.session.account.name,
         email: window.sllAuth.session.account.email,
         roles: window.sllAuth.session.roles,
         accessToken: window.sllAuth.session.accessToken
       } : null);

  var email = String((user && user.email) || '').trim().toLowerCase();
  if (!user || (!email && !user.id)) {
    cleanMount.style.setProperty('display', 'none', 'important');
    sllRoot.style.setProperty('display', 'none', 'important');
    if (window.location.pathname.indexOf('so-lien-lac') !== -1) {
      window.location.replace('/?login=1');
    }
    return;
  }

  var roles = Array.isArray(user && user.roles) ? user.roles : [];
  var isStaff = roles.indexOf('admin') !== -1 || roles.indexOf('root') !== -1 || roles.indexOf('teacher') !== -1
    || email === 'quanly@khongtunhi.com'
    || email === 'hocvienkhongtunhi123@gmail.com'
    || email === 'khongtunhi@gmail.com'
    || email === 'linh.lam@khongtunhi.com'
    || email === 'thu.ha@khongtunhi.com';

  var isAdminPreviewing = Boolean(window.app && window.app.adminPreviewingStudent);
  var isStudentLoggedIn = Boolean(user && (email || user.id) && !isStaff && !isAdminPreviewing);

  if (isStudentLoggedIn) {
    var wasHidden = cleanMount.style.display === 'none';
    sllRoot.style.setProperty('display', 'none', 'important');
    cleanMount.style.setProperty('display', 'block', 'important');
    document.body.classList.remove('lms-on');
    if (typeof window.renderUserProfile === 'function') window.renderUserProfile();
    if (wasHidden && !window.isRecording && !window.__isRecordingClassEx && !window.__isRequestingMic) {
      if (typeof window.syncLiveStudentProfile === 'function') window.syncLiveStudentProfile();
      if (typeof window.syncPortalState === 'function') window.syncPortalState();
    }
  } else {
    cleanMount.style.setProperty('display', 'none', 'important');
    sllRoot.style.setProperty('display', 'block', 'important');
    try {
      var v = document.getElementById('hsk1-video-player');
      if (v && !v.paused) v.pause();
      var a = document.getElementById('sbt-native-audio');
      if (a && !a.paused) a.pause();
    } catch (e) {}
    if (window.sllAuth && window.sllAuth.mode === 'connected' && window.app && typeof window.app.lmsApply === 'function') {
      window.app.lmsApply();
    }
  }
};

// Immediate & safe initialization
(function initSLL() {
  var attempts = 0;
  function start() {
    if (!document.getElementById('ktn-sll-root') && attempts < 60) {
      attempts++;
      setTimeout(start, 50);
      return;
    }
    try {
      if (window.app && window.app.init) window.app.init();
      if (window.sllAuth && window.sllAuth.init) window.sllAuth.init();
      if (typeof window.__syncKtnPortalViewByRole === 'function') window.__syncKtnPortalViewByRole();
      console.log('[KTN-SLL] Unified Admin/Teacher & Student Portal initialized successfully');
    } catch (e) {
      console.error('[KTN-SLL] Init error:', e);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`);

  console.log('Payload statistics:');
  console.log('- HTML bytes:', Buffer.byteLength(finalHtml, 'utf8'));
  console.log('- CSS bytes:', Buffer.byteLength(finalCss, 'utf8'));
  console.log('- JS bytes:', Buffer.byteLength(finalJs, 'utf8'));

  // 5. Login to izTeach admin API
  console.log('\n--- 1. Authenticating with izTeach Admin API ---');
  const adminPassword = process.env.IZTEACH_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('Missing IZTEACH_ADMIN_PASSWORD environment variable (set in .env before running deploy).');
  }
  const loginRes = await req('POST', 'https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin', {
    'Content-Type': 'application/json'
  }, JSON.stringify({
    email: 'hocvienkhongtunhi123@gmail.com',
    password: Buffer.from(adminPassword).toString('base64'),
    vendorId: VENDOR_ID
  }));

  if (loginRes.status !== 200) {
    throw new Error('Admin login failed: ' + loginRes.status + ' ' + loginRes.text);
  }
  const auth = JSON.parse(loginRes.text);
  const token = auth.accessToken;
  console.log('Admin login OK! AccessToken length:', token.length);

  const apiHeaders = {
    'Authorization': token,
    'ol-client-id': CLIENT_ID,
    'ol-vendor-id': VENDOR_ID,
    'Content-Type': 'application/json'
  };

  // 6. Deploy SectionHtml to custom-page-vendor-setting
  console.log('\n--- 2a. Uploading Bundle JS & CSS to CloudFront CDN ---');
  const liveTimestamps = ['1793454892901', '1793454673456'];
  const newTs = Date.now();

  const jsBuf = Buffer.from(finalJs, 'utf8');
  const cssBuf = Buffer.from(finalCss, 'utf8');

  // 1. Upload in-place to currently active live bundle keys
  for (const liveTs of liveTimestamps) {
    const liveJsKey = `resource/documents/${VENDOR_ID}/sofl-remake/so-lien-lac-bundle-v${liveTs}.js`;
    const liveCssKey = `resource/documents/${VENDOR_ID}/sofl-remake/so-lien-lac-bundle-v${liveTs}.css`;
    const liveSignedJs = await getSignedUrl(token, liveJsKey, 'application/javascript; charset=utf-8');
    await uploadBufferToS3(liveSignedJs, jsBuf, 'application/javascript; charset=utf-8');
    console.log(`Live Bundle JS (${liveJsKey}) overwritten on CloudFront (${jsBuf.length} bytes)`);

    const liveSignedCss = await getSignedUrl(token, liveCssKey, 'text/css; charset=utf-8');
    await uploadBufferToS3(liveSignedCss, cssBuf, 'text/css; charset=utf-8');
    console.log(`Live Bundle CSS (${liveCssKey}) overwritten on CloudFront (${cssBuf.length} bytes)`);
  }

  // 2. Also upload to new timestamped keys
  const newJsKey = `resource/documents/${VENDOR_ID}/sofl-remake/so-lien-lac-bundle-v${newTs}.js`;
  const newCssKey = `resource/documents/${VENDOR_ID}/sofl-remake/so-lien-lac-bundle-v${newTs}.css`;
  const newSignedJs = await getSignedUrl(token, newJsKey, 'application/javascript; charset=utf-8');
  await uploadBufferToS3(newSignedJs, jsBuf, 'application/javascript; charset=utf-8');
  const newSignedCss = await getSignedUrl(token, newCssKey, 'text/css; charset=utf-8');
  await uploadBufferToS3(newSignedCss, cssBuf, 'text/css; charset=utf-8');

  const cdnJsUrl = `https://d21acfi38wn3iy.cloudfront.net/${newJsKey}`;
  const cdnCssUrl = `https://d21acfi38wn3iy.cloudfront.net/${newCssKey}`;

  // 2a-extra: Upload standalone role pages (sll-hocsinh.html, sll-teacher.html, sll-admin.html, ktn-webapp-client.js) to CloudFront CDN
  const standaloneFiles = [
    ['ktn-webapp-client.js', 'application/javascript; charset=utf-8'],
    ['sll-hocsinh.html', 'text/html; charset=utf-8'],
    ['sll-teacher.html', 'text/html; charset=utf-8'],
    ['sll-admin.html', 'text/html; charset=utf-8']
  ];
  for (const [fileName, mimeType] of standaloneFiles) {
    const filePath = path.join(__dirname, fileName);
    if (fs.existsSync(filePath)) {
      let fileContent = fs.readFileSync(filePath, 'utf8');
      if (fileName.endsWith('.html')) {
        fileContent = fileContent.replace(
          'src="ktn-webapp-client.js"',
          `src="https://d21acfi38wn3iy.cloudfront.net/resource/documents/${VENDOR_ID}/sofl-remake/ktn-webapp-client.js"`
        );
      }
      const s3Key = `resource/documents/${VENDOR_ID}/sofl-remake/${fileName}`;
      const signed = await getSignedUrl(token, s3Key, mimeType);
      const buf = Buffer.from(fileContent, 'utf8');
      await uploadBufferToS3(signed, buf, mimeType);
      console.log(`Uploaded standalone ${fileName} -> https://d21acfi38wn3iy.cloudfront.net/${s3Key} (${buf.length} bytes)`);
    }
  }

  console.log('\n--- 2b. Inspecting Custom Page ' + PAGE_ID + ' & Updating Active Bundle + SectionHtml ---');
  try {
    const existingCpRes = await req('GET', `https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/custom-page-data?customPage=${PAGE_ID}&vendorId=${VENDOR_ID}`, apiHeaders);
    const existingCpData = JSON.parse(existingCpRes.text);
    const existingSections = Array.isArray(existingCpData) ? existingCpData : (existingCpData.data || []);
    const hasLiveReactV2 = existingSections.some(sec =>
      String(sec?.props?.html || '').includes('ktn-react-v2-root') ||
      String(sec?.props?.js || '').includes('ktn-react-v2')
    );
    if (hasLiveReactV2 && process.env.KTN_FORCE_LEGACY_CUSTOM_PAGE !== 'true') {
      console.log(
        '[GUARD] Custom Page ' + PAGE_ID + ' is actively running React V2 (#ktn-react-v2-root). ' +
        'Skipping legacy S3 chunk overwrite & SectionHtml overwrite.'
      );
    } else {
      for (const sec of existingSections) {
        const m = (sec.props?.js || '').match(/resource\/documents\/[^"'\s?]+\.js/);
        if (m && !m[0].includes('ktn-react-v2') && !liveTimestamps.some(ts => m[0].includes(ts))) {
          const dynamicJsKey = m[0];
          if (dynamicJsKey.includes('clean-hsk1-portal')) {
            const noopBuf = Buffer.from('/* deprecated duplicate section - handled by unified bundle */', 'utf8');
            const sJs = await getSignedUrl(token, dynamicJsKey, 'application/javascript; charset=utf-8');
            await uploadBufferToS3(sJs, noopBuf, 'application/javascript; charset=utf-8');
            console.log(`Deprecated duplicate section JS (${dynamicJsKey}) neutralized on CloudFront!`);
          } else {
            const sJs = await getSignedUrl(token, dynamicJsKey, 'application/javascript; charset=utf-8');
            await uploadBufferToS3(sJs, jsBuf, 'application/javascript; charset=utf-8');
            console.log(`Active Server Bundle JS (${dynamicJsKey}) overwritten on CloudFront!`);
          }
        }
        const mc = (sec.props?.css || '').match(/resource\/documents\/[^"'\s?]+\.css/);
        if (mc && !mc[0].includes('ktn-react-v2') && !liveTimestamps.some(ts => mc[0].includes(ts))) {
          const dynamicCssKey = mc[0];
          if (dynamicCssKey.includes('clean-hsk1-portal')) {
            const noopCssBuf = Buffer.from('/* deprecated */', 'utf8');
            const sCss = await getSignedUrl(token, dynamicCssKey, 'text/css; charset=utf-8');
            await uploadBufferToS3(sCss, noopCssBuf, 'text/css; charset=utf-8');
          } else {
            const sCss = await getSignedUrl(token, dynamicCssKey, 'text/css; charset=utf-8');
            await uploadBufferToS3(sCss, cssBuf, 'text/css; charset=utf-8');
            console.log(`Active Server Bundle CSS (${dynamicCssKey}) overwritten on CloudFront!`);
          }
        }
      }

      // Update Custom Page SectionHtml to include BOTH #ktn-sll-root and #ktn-clean-portal-mount
      const loaderJs = `
(function() {
  window.__ktnCleanPortalLoaded = true;
  window.navigateStudentHash = window.navigateStudentHash || function(h) {
    window.location.hash = (h && h.indexOf('#') === 0) ? h : ('#' + (h || '/'));
  };
  window.openCourseContinueOrStart = window.openCourseContinueOrStart || function(cid) {
    var map = {'6adadba969897b0002482ca5':'hsk1','65e7704a9ea90c00080d5195':'cfk1','661528ea42af880008944573':'cfk3','65e7636a0a1b61000825c2ef':'mini1','6600fa477c18b80008c53c88':'mini2','6600fa7da2bfe10008834e13':'mini3','65e769bd637339000870618f':'ttte1','66028938bfd6c90008b816e1':'ttte2','6638bd09a7367400085c7ab2':'ttte3','678d14b960eae20002ddf8fe':'ttte4','67a7290a5fdc26000238b4e9':'ttte5','67a869302ecb9c000257d966':'ttte6','65e772a1767c56000829518e':'junior1','6638c76dfac274000876cd13':'junior3','65e76a533f5e7c00086715d7':'hsk1-20','65f6d1c722106a0008ff81a3':'hsk-prep','65e773c89ea90c00080d52fc':'hsk-prep-en'};
    var slug = map[cid] || cid || 'hsk1';
    window.location.hash = '#/khoa/' + slug + '/bai/1';
  };
  window.openActiveOrDefaultCourseHash = window.openActiveOrDefaultCourseHash || function() {
    window.location.hash = '#/khoa/hsk1/bai/1';
  };
  window.openStudentLiveClassHash = window.openStudentLiveClassHash || function() {
    window.location.hash = '#/lop/yct2-04/buoi/1';
  };
  if (window.__ktnUnifiedBundleLoaded) return;
  window.__ktnUnifiedBundleLoaded = true;
  var b = document.createElement('script');
  b.src = "${cdnJsUrl}?v=" + Date.now();
  document.head.appendChild(b);
  if (!window.Hls) {
    var s = document.createElement('script');
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1";
    document.head.appendChild(s);
  }
})();
`.trim();

      const inlineBootImg = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" style="width:1px;height:1px;opacity:0;position:absolute;pointer-events:none;" onload="(function(){window.__ktnCleanPortalLoaded=true;window.navigateStudentHash=window.navigateStudentHash||function(h){window.location.hash=(h&&h.indexOf('#')===0)?h:('#'+(h||'/'));};window.openCourseContinueOrStart=window.openCourseContinueOrStart||function(cid){var map={'6adadba969897b0002482ca5':'hsk1','65e7704a9ea90c00080d5195':'cfk1','661528ea42af880008944573':'cfk3','65e7636a0a1b61000825c2ef':'mini1','6600fa477c18b80008c53c88':'mini2','6600fa7da2bfe10008834e13':'mini3','65e769bd637339000870618f':'ttte1','66028938bfd6c90008b816e1':'ttte2','6638bd09a7367400085c7ab2':'ttte3','678d14b960eae20002ddf8fe':'ttte4','67a7290a5fdc26000238b4e9':'ttte5','67a869302ecb9c000257d966':'ttte6','65e772a1767c56000829518e':'junior1','6638c76dfac274000876cd13':'junior3','65e76a533f5e7c00086715d7':'hsk1-20','65f6d1c722106a0008ff81a3':'hsk-prep','65e773c89ea90c00080d52fc':'hsk-prep-en'};var slug=map[cid]||cid||'hsk1';window.location.hash='#/khoa/'+slug+'/bai/1';};window.openActiveOrDefaultCourseHash=window.openActiveOrDefaultCourseHash||function(){window.location.hash='#/khoa/hsk1/bai/1';};window.openStudentLiveClassHash=window.openStudentLiveClassHash||function(){window.location.hash='#/lop/yct2-04/buoi/1';};if(window.__ktnUnifiedBundleLoaded)return;window.__ktnUnifiedBundleLoaded=true;var b=document.createElement('script');b.src='${cdnJsUrl}?v='+Date.now();document.head.appendChild(b);if(!window.Hls){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/hls.js@1';document.head.appendChild(s);}})()">`;
      const mountHtmlWithCssLink = `<script>window.__ktnCleanPortalLoaded=true;</script>\n<link rel="stylesheet" href="${cdnCssUrl}">\n${inlineBootImg}\n${finalHtml}`;
      const newViewData = existingSections.map((sec, idx) => {
        if (sec.id === '6adffce796c3ff0002b2c8d5' || sec._id === '6adffce796c3ff0002b2c8d5') {
          return {
            ...sec,
            element: 'SectionHtml',
            name: 'html-section:so-lien-lac-prod',
            id: sec.id || sec._id,
            _id: sec._id || sec.id,
            index: 0,
            props: {
              'heading-text': 'Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí',
              'sub-text': 'Học Viện Khổng Tử Nhí',
              html: mountHtmlWithCssLink,
              css: finalCss,
              js: loaderJs
            }
          };
        }
        return {
          ...sec,
          element: sec.element || 'SectionHtml',
          name: 'html-section:so-lien-lac-empty',
          id: sec.id || sec._id,
          _id: sec._id || sec.id,
          index: idx + 1,
          props: {
            'heading-text': '',
            'sub-text': '',
            html: '<!-- empty -->',
            css: '/* empty */',
            js: '// empty'
          }
        };
      });

      const cpPayload = JSON.stringify({
        vendorSettingId: VENDOR_ID,
        viewData: newViewData,
        isAddition: true,
        url: SLUG,
        title: 'Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí',
        pageId: PAGE_ID
      });

      const cpPutRes = await req('PUT', 'https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/custom-page-vendor-setting', {
        ...apiHeaders,
        'Content-Length': Buffer.byteLength(cpPayload, 'utf8')
      }, cpPayload);
      console.log('PUT /custom-page-vendor-setting status:', cpPutRes.status);
    }
  } catch (err) {
    console.warn('[WARN] Could not inspect/update custom-page-data:', err.message);
  }

  // 7. Update vendor-setting with SEO and router safety hook
  console.log('\n--- 3. Updating vendor-setting & SEO & Safety Guards ---');
  const vsRes = await req('GET', `https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/${VENDOR_ID}`, apiHeaders);
  const vs = JSON.parse(vsRes.text);
  delete vs.vendorId;
  delete vs.id;

  if (!vs.learn) vs.learn = {};
  vs.learn.blockLimitDevice = { isEnabled: true, mobileLimitDevice: 10, webLimitDevice: 15 };
  if (!vs.learn.themeConfig) vs.learn.themeConfig = {};
  if (!vs.learn.themeConfig.seo) vs.learn.themeConfig.seo = {};
  if (!vs.learn.themeConfig.seo.otherPage) vs.learn.themeConfig.seo.otherPage = {};
  if (!vs.learn.themeConfig.themeData) vs.learn.themeConfig.themeData = {};
  if (!vs.learn.themeConfig.themeData.seo) vs.learn.themeConfig.themeData.seo = {};
  if (!vs.learn.themeConfig.themeData.seo.otherPage) vs.learn.themeConfig.themeData.seo.otherPage = {};
  delete vs.learn.themeConfig.seo.otherPage['ktn-push'];
  delete vs.learn.themeConfig.seo.otherPage['ktn-push-subs'];
  delete vs.learn.themeConfig.themeData.seo.otherPage['ktn-push'];
  delete vs.learn.themeConfig.themeData.seo.otherPage['ktn-push-subs'];

  const sllSeoEntry = {
    url: SLUG,
    id: PAGE_ID,
    pageName: 'Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí',
    settings: {
      name: 'Sổ Liên Lạc Điện Tử — Học Viện Khổng Tử Nhí',
      description: 'Sổ liên lạc điện tử Khổng Tử Nhí — Theo dõi lộ trình học tập, bài tập về nhà, kết quả kiểm tra và trao đổi học vụ trực tuyến.',
      image: CDN_LOGO
    }
  };

  // Register 'so-lien-lac-test', 'so-lien-lac', and 'so-lien-lac-v1'
  vs.learn.themeConfig[SLUG] = PAGE_ID;
  vs.learn.themeConfig['so-lien-lac'] = PAGE_ID;
  vs.learn.themeConfig['so-lien-lac-v1'] = PAGE_ID;
  vs.learn.themeConfig.seo.otherPage[SLUG] = sllSeoEntry;
  vs.learn.themeConfig.seo.otherPage['so-lien-lac'] = { ...sllSeoEntry, url: 'so-lien-lac' };
  vs.learn.themeConfig.seo.otherPage['so-lien-lac-v1'] = { ...sllSeoEntry, url: 'so-lien-lac-v1' };
  vs.learn.themeConfig.themeData.seo.otherPage[SLUG] = sllSeoEntry;
  vs.learn.themeConfig.themeData.seo.otherPage['so-lien-lac'] = { ...sllSeoEntry, url: 'so-lien-lac' };
  vs.learn.themeConfig.themeData.seo.otherPage['so-lien-lac-v1'] = { ...sllSeoEntry, url: 'so-lien-lac-v1' };

  // Ensure PWA manifest & Apple Web App meta tags in externalScript[0]
  if (Array.isArray(vs.learn.externalScript) && vs.learn.externalScript[0]) {
    let script0 = vs.learn.externalScript[0].text || '';
    const pwaMeta = `<link rel="manifest" href="/manifest.json"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="Khổng Tử Nhí"><link rel="apple-touch-icon" href="${CDN_LOGO}">`;
    if (!script0.includes('rel="manifest"')) {
      vs.learn.externalScript[0].text = pwaMeta + script0;
    }
  }

  // Ensure router 404 safety guard & global scenario auth interceptor in externalScript[1]
  // CRITICAL: MUST NOT CONTAIN '<' or '>' characters inside <script>...</script>!
  if (Array.isArray(vs.learn.externalScript) && vs.learn.externalScript.length >= 2) {
    let script1 = vs.learn.externalScript[1].text;
    const dupHookIdx = script1.indexOf(';(function(){window.__ktnCleanPortalLoaded=true');
    if (dupHookIdx !== -1) {
      script1 = script1.slice(0, dupHookIdx) + '</script>';
    }
    // Strip any previously appended __ktnSllAuthHooked or destructive authHealer block before re-appending
    script1 = script1.replace(/;\(function\(\)\{if\(window\.__ktnSllAuthHooked\)[\s\S]*?\}\)\(\);/g, '');
    script1 = script1.replace(/;\(function\(\)\{try\{if\(navigator\.serviceWorker[\s\S]*?\}\)\(\);/g, '');
    script1 = script1.replace(/;try\{var _raw=localStorage\.getItem\("ol-credentials-auth-user"\)[\s\S]*?catch\(x\)\{\}\}/g, '');
    script1 = script1.replace(/if\(p==="\/so-lien-lac\.html"(?:\|\|p==="\/so-lien-lac"\|\|p==="\/custom-page\/so-lien-lac"\|\|p==="\/custom-page\/so-lien-lac-v1")?\)\{window\.location\.replace\("\/custom-page\/so-lien-lac-(?:v1|test)"(?:\+s)?\);return(?:\s*"")?;\}/g, '');
    script1 = script1.replace(/if\(p==="\/so-lien-lac\.html"\|\|p==="\/so-lien-lac"\|\|p==="\/custom-page\/so-lien-lac"\)\{window\.location\.replace\("\/custom-page\/so-lien-lac-v1"\+s\);return "";\}/g, '');
    // Ensure /so-lien-lac.html, /so-lien-lac, /custom-page/so-lien-lac, /custom-page/so-lien-lac-v1 redirect to /custom-page/so-lien-lac-test
    script1 = script1.replace(
      /if\s*\(\s*p\.indexOf\("\/document"\)\s*!==\s*-1\s*\|\|\s*p\.indexOf\("tai-lieu"\)\s*!==\s*-1\s*\)\s*\{\s*window\.location\.replace\("\/book-list"\s*\+\s*s\);\s*return\s*"";\s*\}/,
      'if(p==="/so-lien-lac.html"||p==="/so-lien-lac"||p==="/custom-page/so-lien-lac"||p==="/custom-page/so-lien-lac-v1"){window.location.replace("/custom-page/so-lien-lac-test"+s);return "";}if(p.indexOf("/document")!==-1||p.indexOf("tai-lieu")!==-1){window.location.replace("/book-list"+s);return "";}'
    );
    script1 = script1.replace(
      /var\s+p\s*=\s*window\.location\.pathname;\s*if\s*\(\s*p\.indexOf\("\/document"\)\s*!==\s*-1/,
      'var p=window.location.pathname;if(p==="/so-lien-lac.html"||p==="/so-lien-lac"||p==="/custom-page/so-lien-lac"||p==="/custom-page/so-lien-lac-v1"){window.location.replace("/custom-page/so-lien-lac-test"+(window.location.search||""));return;}if(p.indexOf("/document")!==-1'
    );
    script1 = script1.replace(
      'p.indexOf("dang-ky")===-1);',
      'p.indexOf("dang-ky")===-1&&p.indexOf("so-lien-lac")===-1);'
    );

    const safetyHook = `if(window.next&&window.next.router){var np=window.next.router.push;window.next.router.push=function(u){if(u==="/404"&&window.location.pathname.indexOf("so-lien-lac")!==-1)return Promise.resolve(true);return np.apply(this,arguments);};}var hp=history.pushState;history.pushState=function(st,ti,u){if(u&&(u==="/404"||u.indexOf("/404")!==-1)&&window.location.pathname.indexOf("so-lien-lac")!==-1)return;return hp.apply(this,arguments);};`;

    if (!script1.includes('window.location.pathname.indexOf("so-lien-lac")')) {
      script1 = script1.replace('</script>', safetyHook + '</script>');
    }
    script1 = script1.replace('</script>', ktnGlobalAuthHook + '</script>');

    const innerCheck = script1.replace(/^<script>/i, '').replace(/<\/script>\s*$/i, '');
    if (innerCheck.includes('<') || innerCheck.includes('>')) {
      throw new Error('CRITICAL: externalScript[1] inner script contains < or > character!');
    }
    vs.learn.externalScript[1].text = script1;
    console.log('Updated externalScript[1] with ktnGlobalAuthHook (length:', script1.length, ')');
  }

  const vsBodyStr = JSON.stringify(vs);
  const vsPutRes = await req('PUT', `https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/${VENDOR_ID}`, {
    ...apiHeaders,
    'Content-Length': Buffer.byteLength(vsBodyStr, 'utf8')
  }, vsBodyStr, 1);

  console.log('PUT /vendor-setting status:', vsPutRes.status);
  if (vsPutRes.status !== 200 && vsPutRes.status !== 201) {
    console.warn('[WARN] vendor-setting PUT returned ' + vsPutRes.status + ' (CDN bundle already updated in-place).');
  }

  // 8. Verify custom-page-data
  console.log('\n--- 4. Verifying Custom Page Sections on Server ---');
  const verifyRes = await req('GET', `https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/custom-page-data?customPage=${PAGE_ID}&vendorId=${VENDOR_ID}`, apiHeaders);
  const verifyData = JSON.parse(verifyRes.text);
  const sections = Array.isArray(verifyData) ? verifyData : (verifyData.data || []);
  const prodSec = sections.find(s => s.name === 'html-section:so-lien-lac-prod') || sections[0];
  console.log('Verified sections count:', sections.length);
  if (prodSec) {
    console.log('Section element:', prodSec.element);
    console.log('Section HTML length:', prodSec.props?.html?.length);
    console.log('Section CSS length:', prodSec.props?.css?.length);
    console.log('Section JS length:', prodSec.props?.js?.length);
  }

  console.log('\n Deployment completed successfully!');
}

main().catch(err => {
  console.error('[DEPLOY ERROR]', err);
  process.exit(1);
});
