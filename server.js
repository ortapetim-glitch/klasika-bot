/**
 * קלאסיקה עיצובים – WhatsApp Chatbot
 * ✅ רענון טוקן אוטומטי כל 20 שעות
 * ✅ שיחה מלאה ללא תקיעות
 * ✅ Claude AI לשאלות חופשיות
 * ✅ גלריית תמונות מ-Cloudinary
 */

const express = require("express");
const axios   = require("axios");
require("dotenv").config();

const REQUIRED_ENV = [
  "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "VERIFY_TOKEN",
  "ANTHROPIC_API_KEY",
  "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
  "META_APP_ID", "META_APP_SECRET",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) { console.error(`❌ חסר: ${key}`); process.exit(1); }
}

const {
  WHATSAPP_PHONE_ID, VERIFY_TOKEN, ANTHROPIC_API_KEY,
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
  META_APP_ID, META_APP_SECRET,
  PORT = 3000,
} = process.env;

const GRAPH_URL = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`;
function getAuth() { return { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }; }

const app = express();
app.use(express.json());

// ══════════════════════════════════════════════════════════
// רענון טוקן אוטומטי
// ══════════════════════════════════════════════════════════
async function refreshToken() {
  try {
    console.log("🔄 מחדש טוקן WhatsApp...");
    const res = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        grant_type:    "fb_exchange_token",
        client_id:     META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: process.env.WHATSAPP_TOKEN,
      },
    });
    if (res.data?.access_token) {
      process.env.WHATSAPP_TOKEN = res.data.access_token;
      console.log("✅ טוקן חודש בהצלחה!");
    } else {
      console.warn("⚠️ לא התקבל טוקן חדש:", res.data);
    }
  } catch (err) {
    console.error("❌ שגיאה בחידוש טוקן:", err.response?.data || err.message);
  }
}

// רענון כל 20 שעות
setInterval(refreshToken, 20 * 60 * 60 * 1000);
// רענון ראשוני אחרי 5 דקות מהפעלה
setTimeout(refreshToken, 5 * 60 * 1000);

// ══════════════════════════════════════════════════════════
// Cloudinary
// ══════════════════════════════════════════════════════════
let galleryCache = null, galleryCacheTime = 0;
const GALLERY_TTL = 30 * 60 * 1000;

async function fetchFolder(folder) {
  try {
    const res = await axios.get(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/image`,
      { params: { folder, max_results: 10, type: "upload" },
        auth: { username: CLOUDINARY_API_KEY, password: CLOUDINARY_API_SECRET } }
    );
    return (res.data.resources || []).map(r => ({
      url: r.secure_url,
      caption: r.context?.custom?.caption || r.public_id.split("/").pop().replace(/_/g, " "),
    }));
  } catch (e) { console.error(`❌ Cloudinary (${folder}):`, e.message); return []; }
}

async function getGallery() {
  if (galleryCache && Date.now() - galleryCacheTime < GALLERY_TTL) return galleryCache;
  const [doors, kitchen, walls] = await Promise.all([
    fetchFolder("classica/doors"),
    fetchFolder("classica/kitchen"),
    fetchFolder("classica/walls"),
  ]);
  galleryCache = [
    { category: "דלתות כניסה", items: doors },
    { category: "מטבח",        items: kitchen },
    { category: "קירות",       items: walls },
  ].filter(c => c.items.length > 0);
  galleryCacheTime = Date.now();
  console.log(`✅ גלריה: ${galleryCache.reduce((s,c) => s+c.items.length, 0)} תמונות`);
  return galleryCache;
}
getGallery().catch(console.error);

// ══════════════════════════════════════════════════════════
// Claude AI
// ══════════════════════════════════════════════════════════
const AI_SYSTEM = `אתה נציג שירות של "קלאסיקה עיצובים" – חברה ישראלית המתמחה בציפוי פולימרי דקורטיבי לדלתות, קירות ומטבחים.
ענה תמיד בעברית, בצורה ידידותית וקצרה (עד 5 שורות).
מידע:
- ציפוי פולימרי יונדאי קוריאה - מאות דגמים
- חבילות: סילבר 999 / גולד 1299 / פלטינום 1499 שח
- כולל התקנה + אחריות שנה
- עמיד UV, גשם, חום 65 מעלות, כתמים
- טלפון: 0539312574 | classicsadesign.com
אם שאלה מחוץ לתחום - הפנה לנציג.`;

async function askClaude(history, msg) {
  try {
    const res = await axios.post("https://api.anthropic.com/v1/messages",
      { model: "claude-opus-4-5", max_tokens: 350, system: AI_SYSTEM,
        messages: [...history, { role: "user", content: msg }] },
      { headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } });
    return res.data.content[0].text.trim();
  } catch (e) {
    console.error("❌ Claude:", e.message);
    return `שגיאה זמנית. פנה לאור: 0539312574`;
  }
}

// ══════════════════════════════════════════════════════════
// סשנים
// ══════════════════════════════════════════════════════════
const SESSION_TTL = 6 * 60 * 60 * 1000;
const sessions = {};

function getSession(from) {
  const now = Date.now();
  if (sessions[from] && now - sessions[from].updatedAt > SESSION_TTL) delete sessions[from];
  if (!sessions[from]) sessions[from] = { step: "welcome", order: {}, aiHistory: [], updatedAt: now };
  return sessions[from];
}
function resetSession(from) {
  sessions[from] = { step: "welcome", order: {}, aiHistory: [], updatedAt: Date.now() };
  return sessions[from];
}
setInterval(() => {
  const now = Date.now();
  for (const f of Object.keys(sessions))
    if (now - sessions[f].updatedAt > SESSION_TTL) delete sessions[f];
}, 60 * 60 * 1000);

// ══════════════════════════════════════════════════════════
// קטלוג
// ══════════════════════════════════════════════════════════
const PACKAGES = [
  { id: "silver",   name: "סילבר",   price: 999,  includes: ["ציפוי לשני צידי הדלת", "התקנה מקצועית"] },
  { id: "gold",     name: "גולד",    price: 1299, includes: ["ציפוי לשני צידי הדלת", "ידיות", "סוגר עליון מעוצב ועינית"] },
  { id: "platinum", name: "פלטינום", price: 1499, includes: ["ציפוי לשני צידי הדלת", "ידיות", "סוגר עליון מעוצב ועינית", "צילינדר + 5 מפתחות"] },
];

const HANDLE_ADDON = { price: 499 };

// פסי ניקל — לרוחב ולאורך, עד 4 פסים
const NICKEL_PRICE_H = 35; // לרוחב
const NICKEL_PRICE_V = 70; // לאורך

const SMART_LOCK = { priceMin: 1750, priceMax: 3500 };

const STD_SIZES = [
  { id: "s1", label: "200x90", w: 90,  h: 200 },
  { id: "s2", label: "210x90", w: 90,  h: 210 },
  { id: "s3", label: "220x100", w: 100, h: 220 },
];

const LINKS = { phone: "0539312574", website: "https://classicsadesign.com" };

const FAQ_LIST = [
  { id: "faq_install", q: "כמה זמן לוקחת ההתקנה",   a: "דלת אחת - שעה עד שעתיים. ניתן להשתמש מיד!" },
  { id: "faq_doors",   q: "על אילו דלתות מתאים",     a: "מתכת, עץ, MDF, PVC, ישנה לחידוש" },
  { id: "faq_warranty",q: "יש אחריות",               a: "אחריות שנה על ציפוי, התקנה וחומרי איטום" },
  { id: "faq_outdoor", q: "עמיד בחוץ ובשמש",         a: "UV, גשם, חום 65 מעלות, קור -30, לא מתקלף" },
  { id: "faq_clean",   q: "איך מנקים",               a: "מטלית לחה רגילה בלבד" },
  { id: "faq_colors",  q: "אילו דגמים יש",           a: "עץ, אבן, בטון, שיש, עור, גוונים חלקים - מאות דגמים" },
  { id: "faq_price",   q: "מה טווח המחירים",         a: "סילבר 999, גולד 1299, פלטינום 1499 שח כולל התקנה" },
  { id: "faq_lock",    q: "מה זה מנעול חכם",         a: "פתיחה עם קוד/טביעת אצבע/אפליקציה. 1750-3500 כולל התקנה" },
  { id: "faq_area",    q: "באיזה אזורים עובדים",     a: "מרכז, ירושלים, צפון, דרום, שפלה ושרון - כל הארץ" },
  { id: "faq_samples", q: "אפשר לראות דוגמאות",      a: "instagram.com/classicadesigns\nclassicsadesign.com" },
];

// ══════════════════════════════════════════════════════════
// שליחה
// ══════════════════════════════════════════════════════════
async function send(to, text) {
  await axios.post(GRAPH_URL,
    { messaging_product:"whatsapp", to, type:"text", text:{body:text} },
    { headers: getAuth() });
}

async function sendImage(to, url, caption) {
  await axios.post(GRAPH_URL,
    { messaging_product:"whatsapp", to, type:"image", image:{link:url, caption} },
    { headers: getAuth() });
}

async function sendButtons(to, body, buttons) {
  const btns = buttons.slice(0, 3);
  await axios.post(GRAPH_URL,
    { messaging_product:"whatsapp", to, type:"interactive",
      interactive:{ type:"button", body:{text:body},
        action:{ buttons: btns.map(b=>({ type:"reply", reply:{id:b.id, title:b.title.slice(0,20)} })) } } },
    { headers: getAuth() });
}

async function sendList(to, body, btn, sections) {
  await axios.post(GRAPH_URL,
    { messaging_product:"whatsapp", to, type:"interactive",
      interactive:{ type:"list", body:{text:body}, action:{button:btn.slice(0,20), sections} } },
    { headers: getAuth() });
}

// ══════════════════════════════════════════════════════════
// עזר
// ══════════════════════════════════════════════════════════
function calcPrice(o) {
  const pkgT = o.pkg.price * o.doors;
  const hndT = o.handle_addon ? HANDLE_ADDON.price * o.doors : 0;
  const nickelCount = o.nickel_count || 0;
  const nickelTypeH = o.nickel_h || 0;
  const nickelTypeV = o.nickel_v || 0;
  const nklT = (nickelTypeH * NICKEL_PRICE_H + nickelTypeV * NICKEL_PRICE_V) * o.doors;
  const base = pkgT + hndT + nklT;
  const slMin = o.smart_lock ? SMART_LOCK.priceMin * o.doors : 0;
  const slMax = o.smart_lock ? SMART_LOCK.priceMax * o.doors : 0;
  return { pkgT, hndT, nklT, grandMin: base+slMin, grandMax: base+slMax, slMin, slMax };
}

async function sendGalleryMenu(to) {
  const g = await getGallery();
  if (!g.length) {
    await send(to, "הגלריה ריקה עדיין.\ninstagram.com/classicadesigns");
    return;
  }
  await sendList(to, "גלריית עבודות\nבחר קטגוריה:", "בחר קטגוריה",
    [{ title:"קטגוריות", rows: g.map((c,i)=>({
      id:`gal_${i}`, title:c.category.slice(0,24), description:`${c.items.length} תמונות`
    })) }]);
}

// ══════════════════════════════════════════════════════════
// לוגיקת שיחה
// ══════════════════════════════════════════════════════════
async function handleMessage(from, text) {
  text = (text || "").trim();

  const RESET = ["היי","שלום","הי","בוקר טוב","ערב טוב","0","menu"];
  if (RESET.includes(text.toLowerCase())) resetSession(from);

  const sess = getSession(from);
  sess.updatedAt = Date.now();

  if (text === "talk_human") {
    await send(from, `שמחים לעזור!\nטלפון: ${LINKS.phone}\nאתר: ${LINKS.website}`);
    delete sessions[from]; return;
  }
  if (text === "new_quote" || text === "main_menu") {
    resetSession(from); await handleMessage(from, ""); return;
  }

  try {
    switch (sess.step) {

      // ── ברוכים הבאים ─────────────────────────────────
      case "welcome":
        await send(from,
          `שלום! שמי אור, בעלים של קלאסיקה עיצובים\n` +
          `מתמחים בציפוי דלתות, קירות ומטבחים\n` +
          `instagram.com/classicadesigns`
        );
        await sendButtons(from, "במה תרצה שנעזור?", [
          { id:"get_quote", title:"הצעת מחיר" },
          { id:"gallery",   title:"עבודות שלנו" },
          { id:"ai_chat",   title:"שאל את הבוט" },
        ]);
        sess.step = "qual_type";
        break;

      // ── תפריט ראשי ───────────────────────────────────
      case "qual_type":
        if (text === "gallery")  { await sendGalleryMenu(from); sess.step = "gallery_cat"; break; }
        if (text === "ai_chat")  { await send(from, "שאל כל שאלה!\nכתוב חזור לתפריט."); sess.step = "ai_chat"; break; }
        if (text === "faq") {
          await sendList(from, "שאלות נפוצות", "בחר שאלה",
            [{ title:"שאלות", rows:FAQ_LIST.map(f=>({id:f.id, title:f.q.slice(0,24)})) }]);
          sess.step = "faq"; break;
        }
        await send(from, "מעולה! כמה שאלות קצרות:");
        await sendButtons(from, "מה סוג החידוש?", [
          { id:"type_door",    title:"דלת"   },
          { id:"type_kitchen", title:"מטבח"  },
          { id:"type_wall",    title:"קיר"   },
        ]);
        sess.step = "qual_area";
        break;

      // ── גלריה ────────────────────────────────────────
      case "gallery_cat": {
        const m = text.match(/^gal_(\d+)$/);
        if (m) {
          const g = await getGallery();
          const cat = g[parseInt(m[1])];
          if (cat) {
            await send(from, `${cat.category}:`);
            for (const item of cat.items) {
              try { await sendImage(from, item.url, item.caption); } catch(_){}
            }
          }
          await sendButtons(from, "מה תרצה עכשיו?", [
            { id:"gallery",   title:"קטגוריה נוספת" },
            { id:"get_quote", title:"הצעת מחיר"      },
            { id:"main_menu", title:"תפריט ראשי"     },
          ]);
          break;
        }
        if (text === "gallery") { await sendGalleryMenu(from); break; }
        resetSession(from); await handleMessage(from, ""); break;
      }

      // ── AI ────────────────────────────────────────────
      case "ai_chat": {
        if (["חזור","menu","main_menu"].includes(text.toLowerCase())) {
          resetSession(from); await handleMessage(from, ""); return;
        }
        if (!text) break;
        sess.aiHistory.push({ role:"user", content:text });
        if (sess.aiHistory.length > 10) sess.aiHistory = sess.aiHistory.slice(-10);
        const reply = await askClaude(sess.aiHistory.slice(0,-1), text);
        sess.aiHistory.push({ role:"assistant", content:reply });
        await send(from, reply);
        await sendButtons(from, "רוצה להמשיך?", [
          { id:"ai_chat",   title:"שאלה נוספת" },
          { id:"get_quote", title:"הצעת מחיר"   },
          { id:"gallery",   title:"ראה עבודות"  },
        ]);
        break;
      }

      // ── אזור ─────────────────────────────────────────
      case "qual_area": {
        const typeMap = { type_door:"דלת", type_kitchen:"מטבח", type_wall:"קיר" };
        sess.order.renewal_type = typeMap[text] || text;
        await sendList(from, "באיזה אזור?", "בחר אזור", [{ title:"אזורים", rows:[
          { id:"area_center",    title:"מרכז" },
          { id:"area_north",     title:"צפון" },
          { id:"area_south",     title:"דרום" },
          { id:"area_jerusalem", title:"ירושלים" },
          { id:"area_shfela",    title:"שפלה ושרון" },
          { id:"area_other",     title:"אחר" },
        ]}]);
        sess.step = "qual_photo";
        break;
      }

      // ── תמונה ────────────────────────────────────────
      case "qual_photo": {
        const areaMap = {
          area_center:"מרכז", area_north:"צפון", area_south:"דרום",
          area_jerusalem:"ירושלים", area_shfela:"שפלה ושרון", area_other:"אחר"
        };
        sess.order.area = areaMap[text] || text;
        await send(from, "אשמח לתצלום של הפריט לחידוש\nאין תמונה? לחץ המשך");
        await sendButtons(from, "שלח תמונה או לחץ:", [
          { id:"photo_skip", title:"המשך ללא תמונה" },
        ]);
        sess.step = "waiting_photo";
        break;
      }

      // ── ממתין לתמונה ─────────────────────────────────
      case "waiting_photo": {
        if (text === "photo_received") await send(from, "תודה על התמונה! ממשיכים...");
        if (sess.order.renewal_type === "מטבח" || sess.order.renewal_type === "קיר") {
          await send(from, `תודה!\n${sess.order.renewal_type} באזור ${sess.order.area}\nנציג אור יחזור אליך בהקדם!\nטלפון: ${LINKS.phone}`);
          delete sessions[from]; return;
        }
        await sendButtons(from, "כמה דלתות לציפוי?", [
          { id:"d1", title:"דלת אחת"    },
          { id:"d2", title:"שתי דלתות"  },
          { id:"d3", title:"שלוש ויותר" },
        ]);
        sess.step = "size_type";
        break;
      }

      // ── מספר דלתות ───────────────────────────────────
      case "size_type": {
        if (text === "d3") { await send(from, "כמה דלתות בדיוק? (לדוגמה: 4)"); sess.step = "door_count_exact"; break; }
        const num = {d1:1,d2:2}[text] ?? parseInt(text);
        if (!num || num < 1) { await send(from, "אנא בחר מהכפתורים."); break; }
        sess.order.doors = num;
        await send(from, "בחר מידה או שלח בפורמט: 90x210");
        await sendButtons(from, "מידות נפוצות:", [
          { id:"s1", title:"200x90 סמ" },
          { id:"s2", title:"סטנדרט 210x90" },
          { id:"custom", title:"מידה אחרת" },
        ]);
        sess.step = "pick_size";
        break;
      }

      case "door_count_exact": {
        const num = parseInt(text);
        if (!num || num < 3 || num > 50) { await send(from, "נא להזין מספר תקין (3-50)."); break; }
        sess.order.doors = num;
        await send(from, "בחר מידה או שלח בפורמט: 90x210");
        await sendButtons(from, "מידות נפוצות:", [
          { id:"s1", title:"200x90 סמ" },
          { id:"s2", title:"סטנדרט 210x90" },
          { id:"custom", title:"מידה אחרת" },
        ]);
        sess.step = "pick_size";
        break;
      }

      // ── מידה ─────────────────────────────────────────
      case "pick_size": {
        const size = STD_SIZES.find(s => s.id === text);
        if (size) {
          sess.order.width_cm = size.w;
          sess.order.height_cm = size.h;
          sess.step = "package";
          await handleMessage(from, "__pkg"); return;
        }
        if (text === "custom") { await send(from, "מה הרוחב בסמ? (לדוגמה: 90)"); sess.step = "custom_w"; break; }
        const match = text.match(/^(\d+)[×xX](\d+)$/);
        if (match) {
          sess.order.width_cm = parseInt(match[1]);
          sess.order.height_cm = parseInt(match[2]);
          sess.step = "package";
          await handleMessage(from, "__pkg"); return;
        }
        await send(from, "אנא בחר מידה מהכפתורים או שלח: 90x200");
        break;
      }

      case "custom_w": {
        const w = parseInt(text);
        if (!w || w < 50 || w > 200) { await send(from, "נא להזין רוחב תקין (50-200)."); break; }
        sess.order.width_cm = w;
        await send(from, "מה הגובה בסמ? (לדוגמה: 210)");
        sess.step = "custom_h"; break;
      }

      case "custom_h": {
        const hh = parseInt(text);
        if (!hh || hh < 150 || hh > 300) { await send(from, "נא להזין גובה תקין (150-300)."); break; }
        sess.order.height_cm = hh;
        sess.step = "package";
        await handleMessage(from, "__pkg"); return;
      }

      // ── חבילה ────────────────────────────────────────
      case "package": {
        if (text !== "__pkg") { await handleMessage(from, "__pkg"); return; }
        await sendList(from,
          "בחר חבילת ציפוי:\nציפוי שני צדדים + התקנה + אחריות שנה",
          "בחר חבילה",
          [{ title:"חבילות", rows: PACKAGES.map(p=>({
            id: p.id,
            title: `${p.name} - ${p.price} שח`,
            description: p.includes.join(", ").slice(0, 72),
          }))}]
        );
        sess.step = "handle_addon";
        break;
      }

      // ── ידית ─────────────────────────────────────────
      case "handle_addon": {
        const pkg = PACKAGES.find(p => p.id === text);
        if (!pkg) { await send(from, "אנא בחר חבילה מהרשימה."); break; }
        sess.order.pkg = pkg;
        await sendButtons(from,
          `ידית לאורך - ${HANDLE_ADDON.price} שח לדלת\nלהוסיף?`,
          [{ id:"ha_yes", title:"כן הוסף" }, { id:"ha_no", title:"לא תודה" }]);
        sess.step = "texture";
        break;
      }

      // ── טקסטורה ──────────────────────────────────────
      case "texture":
        sess.order.handle_addon = (text === "ha_yes");
        await sendButtons(from, "סגנון הטפט:", [
          { id:"tex_smooth", title:"גוון חלק" },
          { id:"tex_bold",   title:"טקסטורה מודגשת" },
        ]);
        sess.step = "nickel_h";
        break;

      // ── פסי ניקל לרוחב ───────────────────────────────
      case "nickel_h": {
        const texMap = { tex_smooth:"גוון חלק", tex_bold:"טקסטורה מודגשת" };
        sess.order.texture = texMap[text] || text;
        await send(from,
          `פסי ניקל לרוחב - ${NICKEL_PRICE_H} שח לפס\n` +
          `כמה פסים לרוחב? (0-4)\nשלח מספר:`
        );
        sess.step = "nickel_v";
        break;
      }

      // ── פסי ניקל לאורך ───────────────────────────────
      case "nickel_v": {
        const h = parseInt(text);
        if (isNaN(h) || h < 0 || h > 4) { await send(from, "נא להזין מספר בין 0 ל-4."); break; }
        sess.order.nickel_h = h;
        await send(from,
          `פסי ניקל לאורך - ${NICKEL_PRICE_V} שח לפס\n` +
          `כמה פסים לאורך? (0-4)\nשלח מספר:`
        );
        sess.step = "smart_lock";
        break;
      }

      // ── מנעול חכם ────────────────────────────────────
      case "smart_lock": {
        const v = parseInt(text);
        if (isNaN(v) || v < 0 || v > 4) { await send(from, "נא להזין מספר בין 0 ל-4."); break; }
        sess.order.nickel_v = v;

        const totalNickel = (sess.order.nickel_h || 0) + (sess.order.nickel_v || 0);
        if (totalNickel > 0) {
          await send(from,
            `נבחרו:\n` +
            (sess.order.nickel_h > 0 ? `${sess.order.nickel_h} פסים לרוחב - ${sess.order.nickel_h * NICKEL_PRICE_H} שח\n` : "") +
            (sess.order.nickel_v > 0 ? `${sess.order.nickel_v} פסים לאורך - ${sess.order.nickel_v * NICKEL_PRICE_V} שח\n` : "")
          );
        }

        await sendButtons(from,
          `מנעול חכם - ${SMART_LOCK.priceMin}-${SMART_LOCK.priceMax} שח כולל התקנה\n` +
          `פתיחה עם קוד / טביעת אצבע / אפליקציה\nמעוניין?`,
          [{ id:"sl_yes", title:"כן מעניין" }, { id:"sl_no", title:"לא כרגע" }]);
        sess.step = "contact_name";
        break;
      }

      // ── שם ────────────────────────────────────────────
      case "contact_name":
        sess.order.smart_lock = (text === "sl_yes");
        await send(from, "מה שמך המלא?");
        sess.step = "contact_phone";
        break;

      // ── טלפון ────────────────────────────────────────
      case "contact_phone":
        if (!text || text.length < 2) { await send(from, "נא להזין שם תקין."); break; }
        sess.order.name = text;
        await send(from, "מה מספר הטלפון לחזרה?");
        sess.step = "summary";
        break;

      // ── סיכום ────────────────────────────────────────
      case "summary": {
        const phone = text.replace(/[^\d+]/g, "");
        if (phone.length < 9) { await send(from, "נא להזין מספר טלפון תקין."); break; }
        sess.order.phone = phone;

        const { pkgT, hndT, nklT, grandMin, grandMax, slMin, slMax } = calcPrice(sess.order);
        const o = sess.order;
        const priceStr = o.smart_lock
          ? `${grandMin.toLocaleString()}-${grandMax.toLocaleString()} שח`
          : `${grandMin.toLocaleString()} שח`;

        const nickelLine = () => {
          const lines = [];
          if (o.nickel_h > 0) lines.push(`${o.nickel_h} פסים לרוחב - ${o.nickel_h * NICKEL_PRICE_H * o.doors} שח`);
          if (o.nickel_v > 0) lines.push(`${o.nickel_v} פסים לאורך - ${o.nickel_v * NICKEL_PRICE_V * o.doors} שח`);
          return lines.join("\n");
        };

        await send(from,
          `הצעת המחיר שלך מוכנה!\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `שם: ${o.name}  טלפון: ${o.phone}\n` +
          `אזור: ${o.area}  |  ${o.renewal_type}\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `${o.doors} דלתות  ${o.width_cm}x${o.height_cm} סמ\n` +
          `חבילה: ${o.pkg.name} - ${pkgT.toLocaleString()} שח\n` +
          `   ${o.pkg.includes.join(", ")}\n` +
          (o.handle_addon ? `ידית לאורך - ${hndT.toLocaleString()} שח\n` : "") +
          `טקסטורה: ${o.texture}\n` +
          (nklT > 0 ? nickelLine() + "\n" : "") +
          (o.smart_lock ? `מנעול חכם - ${(slMin*o.doors).toLocaleString()}-${(slMax*o.doors).toLocaleString()} שח\n` : "") +
          `━━━━━━━━━━━━━━━━━━\n` +
          `סהכ משוער: ${priceStr}\n` +
          `המחיר הסופי לאחר בחירת דגם.\n\n` +
          `נציג יחזור אליך בהקדם!`
        );

        console.log("📋 QUOTE:", { ts:new Date().toISOString(), area:o.area, doors:o.doors, pkg:o.pkg.id, grandMin, grandMax });

        sessions[from] = { step:"post_summary", order:{}, aiHistory:[], updatedAt:Date.now() };
        await sendButtons(from, "תרצה משהו נוסף?", [
          { id:"new_quote",  title:"הצעה חדשה"  },
          { id:"gallery",    title:"ראה עבודות"  },
          { id:"talk_human", title:"דבר עם נציג" },
        ]);
        break;
      }

      // ── אחרי סיכום ───────────────────────────────────
      case "post_summary":
        if (text === "gallery") { await sendGalleryMenu(from); sess.step = "gallery_cat"; break; }
        if (text === "talk_human") {
          await send(from, `טלפון: ${LINKS.phone}\nאתר: ${LINKS.website}`);
          delete sessions[from]; break;
        }
        resetSession(from); await handleMessage(from, ""); break;

      // ── FAQ ───────────────────────────────────────────
      case "faq": {
        const faq = FAQ_LIST.find(f => f.id === text);
        if (!faq) { await send(from, "אנא בחר שאלה."); break; }
        await send(from, faq.a);
        await sendButtons(from, "יש לך שאלה נוספת?", [
          { id:"faq_more",  title:"שאלה נוספת" },
          { id:"ai_chat",   title:"שאל את ה-AI" },
          { id:"get_quote", title:"הצעת מחיר"   },
        ]);
        break;
      }

      // ── ברירת מחדל ───────────────────────────────────
      default:
        if (text === "faq_more") {
          await sendList(from, "שאלות נפוצות", "בחר שאלה",
            [{ title:"שאלות", rows:FAQ_LIST.map(f=>({id:f.id, title:f.q.slice(0,24)})) }]);
          sess.step = "faq"; break;
        }
        if (text === "gallery")  { await sendGalleryMenu(from); sess.step = "gallery_cat"; break; }
        if (text === "ai_chat")  { sess.step = "ai_chat"; await send(from, "שאל כל שאלה!\nכתוב חזור לתפריט."); break; }
        resetSession(from); await handleMessage(from, "");
    }
  } catch (err) {
    console.error(`❌ [${from}]:`, err.message);
    try { await send(from, `שגיאה זמנית\nנסה שוב או פנה: ${LINKS.phone}`); } catch(_){}
  }
}

// ══════════════════════════════════════════════════════════
// Webhook
// ══════════════════════════════════════════════════════════
app.get("/webhook", (req, res) => {
  const { "hub.mode":mode, "hub.verify_token":token, "hub.challenge":challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;
    const from = msg.from;
    let text = "";

    if (msg.type === "text") {
      text = msg.text.body;
    } else if (msg.type === "interactive") {
      text = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "";
    } else if (msg.type === "image") {
      const sess = sessions[from];
      if (sess && sess.step === "waiting_photo") {
        if (!sess.order) sess.order = {};
        sess.order.has_photo = true;
        text = "photo_received";
      }
    }

    if (!text) return;
    console.log(`📩 step=${sessions[from]?.step||"new"} text="${text}"`);
    await handleMessage(from, text);
  } catch (err) { console.error("❌ Webhook:", err.message); }
});

app.get("/health", (_, res) => res.json({
  status: "ok",
  sessions: Object.keys(sessions).length,
  token_last_chars: process.env.WHATSAPP_TOKEN?.slice(-6),
}));

app.listen(PORT, () => console.log(`🚀 Bot – פורט ${PORT} | רענון טוקן כל 20 שעות`));
