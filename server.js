/**
 * קלאסיקה עיצובים – WhatsApp Chatbot
 * ======================================
 * תכונות:
 *  📋 תהליך הצעת מחיר מלא
 *  🤖 Claude AI לשאלות חופשיות
 *  🖼️  גלריית תמונות מ-Cloudinary (אוטומטית!)
 *  ⏱️  TTL לסשנים (6 שעות) + ניקוי אוטומטי
 *  🔒 בדיקת משתני סביבה בהפעלה
 *  🛡️  try/catch על כל שליחה
 *
 * npm install express axios dotenv
 *
 * .env:
 *  WHATSAPP_TOKEN=
 *  WHATSAPP_PHONE_ID=
 *  VERIFY_TOKEN=
 *  ANTHROPIC_API_KEY=
 *  CLOUDINARY_CLOUD_NAME=
 *  CLOUDINARY_API_KEY=
 *  CLOUDINARY_API_SECRET=
 *  PORT=3000
 *
 * מבנה תיקיות ב-Cloudinary:
 *  classica/doors/     ← תמונות דלתות
 *  classica/kitchen/   ← מטבח
 *  classica/walls/     ← קירות/תקרות
 */

const express = require("express");
const axios   = require("axios");
const crypto  = require("crypto");
require("dotenv").config();

// ── בדיקת סביבה ──────────────────────────────────────────
const REQUIRED_ENV = [
  "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "VERIFY_TOKEN",
  "ANTHROPIC_API_KEY",
  "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ חסר משתנה סביבה: ${key}`);
    process.exit(1);
  }
}

const {
  WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN,
  ANTHROPIC_API_KEY,
  CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
  PORT = 3000,
} = process.env;

const GRAPH_URL    = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`;
const AUTH_HEADERS = { Authorization: `Bearer ${WHATSAPP_TOKEN}` };

const app = express();
app.use(express.json());

// ══════════════════════════════════════════════════════════
// CLOUDINARY – שליפת תמונות אוטומטית מתיקייה
// ══════════════════════════════════════════════════════════

// מטמון גלריה (מתרענן כל 30 דקות)
let galleryCache = null;
let galleryCacheTime = 0;
const GALLERY_CACHE_TTL = 30 * 60 * 1000;

/**
 * שולף תמונות מ-Cloudinary לפי תיקייה
 * מחזיר מערך של { url, caption }
 */
async function fetchCloudinaryFolder(folder) {
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = `folder=${folder}&max_results=10&resource_type=image&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha256")
    .update(paramsToSign + CLOUDINARY_API_SECRET)
    .digest("hex");

  try {
    const res = await axios.get(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/image`,
      {
        params: { folder, max_results: 10, timestamp, signature, api_key: CLOUDINARY_API_KEY },
        auth:   { username: CLOUDINARY_API_KEY, password: CLOUDINARY_API_SECRET },
      }
    );
    return (res.data.resources || []).map(r => ({
      url:     r.secure_url,
      caption: r.context?.custom?.caption || r.public_id.split("/").pop().replace(/_/g, " "),
    }));
  } catch (err) {
    console.error(`❌ Cloudinary error (${folder}):`, err.message);
    return [];
  }
}

/**
 * מחזיר את הגלריה המלאה (מ-cache או מ-Cloudinary)
 */
async function getGallery() {
  if (galleryCache && Date.now() - galleryCacheTime < GALLERY_CACHE_TTL) {
    return galleryCache;
  }
  console.log("🔄 מרענן גלריה מ-Cloudinary...");
  const [doors, kitchen, walls] = await Promise.all([
    fetchCloudinaryFolder("classica/doors"),
    fetchCloudinaryFolder("classica/kitchen"),
    fetchCloudinaryFolder("classica/walls"),
  ]);
  galleryCache = [
    { category: "🚪 דלתות כניסה",  emoji: "🚪", items: doors   },
    { category: "🍳 מטבח",         emoji: "🍳", items: kitchen },
    { category: "🧱 קירות ותקרות", emoji: "🧱", items: walls   },
  ].filter(c => c.items.length > 0);
  galleryCacheTime = Date.now();
  console.log(`✅ גלריה נטענה: ${galleryCache.reduce((s, c) => s + c.items.length, 0)} תמונות`);
  return galleryCache;
}

// טעינה ראשונית של הגלריה
getGallery().catch(console.error);

// ══════════════════════════════════════════════════════════
// CLAUDE AI
// ══════════════════════════════════════════════════════════

const AI_SYSTEM = `אתה נציג שירות של "קלאסיקה עיצובים" – חברה ישראלית המתמחה בציפוי פולימרי דקורטיבי לדלתות, קירות ומטבחים.
ענה תמיד בעברית, בצורה ידידותית וקצרה (עד 5 שורות).
מידע עיקרי:
• ציפוי פולימרי של יונדאי קוריאה 🇰🇷 – מאות דגמים (עץ, אבן, בטון, שיש, עור)
• חבילות: 🥈 סילבר ₪999 / 🥇 גולד ₪1,299 / 💎 פלטינום ₪1,499
• כולל התקנה + אחריות שנה
• עמיד UV, גשם, חום עד 65°, כתמים
• תוספות: ידית לאורך ₪499 | פס ניקל ₪35–70 | מנעול חכם ₪1,750–3,500
• טלפון: 0539312574 | classicsadesign.com
אם שאלה מחוץ לתחום – הפנה בנימוס לנציג אנושי.`;

async function askClaude(history, userMessage) {
  const messages = [...history, { role: "user", content: userMessage }];
  try {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      { model: "claude-opus-4-5", max_tokens: 350, system: AI_SYSTEM, messages },
      { headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } }
    );
    return res.data.content[0].text.trim();
  } catch (err) {
    console.error("❌ Claude error:", err.message);
    return `מצטערים, אירעה שגיאה זמנית 😔\nפנה ישירות לאור: 📞 0539312574`;
  }
}

// ══════════════════════════════════════════════════════════
// סשנים + TTL
// ══════════════════════════════════════════════════════════

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const sessions = {};

function getSession(from) {
  const now = Date.now();
  if (sessions[from] && now - sessions[from].updatedAt > SESSION_TTL_MS) {
    delete sessions[from];
  }
  if (!sessions[from]) {
    sessions[from] = { step: S.WELCOME, order: {}, aiHistory: [], updatedAt: now };
  }
  return sessions[from];
}

function resetSession(from) {
  sessions[from] = { step: S.WELCOME, order: {}, aiHistory: [], updatedAt: Date.now() };
  return sessions[from];
}

// ניקוי סשנים כל שעה
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const from of Object.keys(sessions)) {
    if (now - sessions[from].updatedAt > SESSION_TTL_MS) { delete sessions[from]; cleaned++; }
  }
  if (cleaned) console.log(`🧹 נוקו ${cleaned} סשנים`);
}, 60 * 60 * 1000);

// ══════════════════════════════════════════════════════════
// שלבי שיחה
// ══════════════════════════════════════════════════════════
const S = {
  WELCOME:          "welcome",
  QUAL_TYPE:        "qual_type",
  QUAL_AREA:        "qual_area",
  QUAL_PHOTO:       "qual_photo",
  DOOR_COUNT:       "door_count",
  DOOR_COUNT_EXACT: "door_count_exact",
  SIZE_TYPE:        "size_type",
  STD_SIZE:         "std_size",
  CUSTOM_W:         "custom_w",
  CUSTOM_H:         "custom_h",
  PACKAGE:          "package",
  HANDLE_ADDON:     "handle_addon",
  TEXTURE:          "texture",
  NICKEL:           "nickel",
  SMART_LOCK:       "smart_lock",
  CONTACT_NAME:     "contact_name",
  CONTACT_PHONE:    "contact_phone",
  SUMMARY:          "summary",
  POST_SUMMARY:     "post_summary",
  FAQ:              "faq",
  AI_CHAT:          "ai_chat",
  GALLERY_CAT:      "gallery_cat",
};

// ══════════════════════════════════════════════════════════
// קטלוג
// ══════════════════════════════════════════════════════════
const PACKAGES = [
  { id: "silver",   name: "🥈 סילבר",   price: 999,
    includes: ["ציפוי לשני צידי הדלת", "התקנה מקצועית"] },
  { id: "gold",     name: "🥇 גולד",    price: 1299,
    includes: ["ציפוי לשני צידי הדלת", "ידיות", "סוגר עליון מעוצב ועינית"] },
  { id: "platinum", name: "💎 פלטינום", price: 1499,
    includes: ["ציפוי לשני צידי הדלת", "ידיות", "סוגר עליון מעוצב ועינית", "צילינדר + 5 מפתחות"] },
];
const HANDLE_ADDON = { price: 499, label: "ידית לאורך" };
const NICKEL_OPTS = [
  { id: "nickel_none", label: "ללא פס ניקל",          price: 0  },
  { id: "nickel_h",    label: "פס ניקל לרוחב (+₪35)", price: 35 },
  { id: "nickel_v",    label: "פס ניקל לאורך (+₪70)", price: 70 },
];
const TEXTURE_OPTS = [
  { id: "tex_smooth", label: "🎨 גוון חלק"       },
  { id: "tex_bold",   label: "🪨 טקסטורה מודגשת" },
];
const SMART_LOCK = { priceMin: 1750, priceMax: 3500 };
const STD_SIZES = [
  { id: "s1", label: '200×90 ס"מ (סטנדרט נפוץ)', w: 90,  h: 200 },
  { id: "s2", label: '210×90 ס"מ',                w: 90,  h: 210 },
  { id: "s3", label: '220×100 ס"מ',               w: 100, h: 220 },
  { id: "s4", label: '240×110 ס"מ (כניסה ראשית)', w: 110, h: 240 },
];
const LINKS = { phone: "0539312574", website: "https://classicsadesign.com" };

// ══════════════════════════════════════════════════════════
// שאלות נפוצות
// ══════════════════════════════════════════════════════════
const FAQ_LIST = [
  { id: "faq_install_time", q: "⏱️ כמה זמן לוקחת ההתקנה?",
    a: `⏱️ *זמן התקנה:*\nדלת אחת – *שעה עד שעתיים* בלבד.\nניתן להשתמש בדלת מיד לאחר ההתקנה! 🚪✅` },
  { id: "faq_door_types", q: "🚪 על אילו דלתות זה מתאים?",
    a: `🚪 *סוגי דלתות:*\n✅ מתכת  ✅ עץ  ✅ MDF  ✅ PVC  ✅ ישנה לחידוש\nהחומר גמיש ומתאים לכל משטח 💪` },
  { id: "faq_warranty", q: "🛡️ יש אחריות על העבודה?",
    a: `🛡️ *אחריות שנה* על ציפוי, התקנה וחומרי איטום.\nיונדאי קוריאה 🇰🇷 מעניקה אחריות על החומר עצמו.` },
  { id: "faq_outdoor", q: "🌧️ עמיד בחוץ ובשמש?",
    a: `☀️ *עמידות תנאי חוץ:*\n✅ UV  ✅ גשם ולחות  ✅ חום עד 65°  ✅ קור עד -30°  ✅ לא מתקלף` },
  { id: "faq_maintenance", q: "🧹 איך מנקים?",
    a: `🧹 *תחזוקה פשוטה:*\nמטלית לחה רגילה בלבד.\nעמיד לכתמים, חומץ ויין 24 שעות 😄` },
  { id: "faq_colors", q: "🎨 אילו דגמים יש?",
    a: `🎨 *מאות דגמים:*\n🪵 עץ  🪨 אבן  🧱 בטון  🔲 שיש  🧵 עור  🎨 גוונים חלקים\nשלח תמונה ונמליץ! 📸` },
  { id: "faq_price_range", q: "💰 מה טווח המחירים?",
    a: `💰 *מחירים:*\n🥈 סילבר ₪999  🥇 גולד ₪1,299  💎 פלטינום ₪1,499\n+ ידית ₪499  + ניקל ₪35–70  + מנעול חכם ₪1,750–3,500\n_כולל התקנה + אחריות שנה_ ✅` },
  { id: "faq_smart_lock", q: "🔐 מה זה מנעול חכם?",
    a: `🔐 *מנעול חכם:*\nפתיחה עם קוד / טביעת אצבע / אפליקציה – ללא מפתח!\n💰 ₪1,750–3,500 כולל התקנה מקצועית.` },
  { id: "faq_area", q: "📍 באיזה אזורים עובדים?",
    a: `📍 *כל הארץ:* ✅ מרכז  ✅ ירושלים  ✅ צפון  ✅ דרום  ✅ שפלה ושרון` },
  { id: "faq_samples", q: "👀 אפשר לראות דוגמאות?",
    a: `👀 *עבודות שלנו:*\n📸 instagram.com/classicadesigns\n👍 facebook.com/classicadesign\n🎵 tiktok.com/@classica_design\n🌐 classicsadesign.com` },
];

// ══════════════════════════════════════════════════════════
// פונקציות שליחה
// ══════════════════════════════════════════════════════════
async function send(to, text) {
  await axios.post(GRAPH_URL,
    { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
    { headers: AUTH_HEADERS });
}

async function sendImage(to, imageUrl, caption) {
  await axios.post(GRAPH_URL,
    { messaging_product: "whatsapp", to, type: "image", image: { link: imageUrl, caption } },
    { headers: AUTH_HEADERS });
}

async function sendButtons(to, body, buttons) {
  await axios.post(GRAPH_URL,
    { messaging_product: "whatsapp", to, type: "interactive",
      interactive: { type: "button", body: { text: body },
        action: { buttons: buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title } })) } } },
    { headers: AUTH_HEADERS });
}

async function sendList(to, body, btn, sections) {
  await axios.post(GRAPH_URL,
    { messaging_product: "whatsapp", to, type: "interactive",
      interactive: { type: "list", body: { text: body }, action: { button: btn, sections } } },
    { headers: AUTH_HEADERS });
}

// ══════════════════════════════════════════════════════════
// גלריה
// ══════════════════════════════════════════════════════════
async function sendGalleryMenu(to) {
  const gallery = await getGallery();
  if (!gallery.length) {
    await send(to, `🖼️ הגלריה עדיין ריקה.\nראה עבודות שלנו:\n📸 instagram.com/classicadesigns`);
    return;
  }
  await sendList(to, "🖼️ *גלריית עבודות – קלאסיקה עיצובים*\nבחר קטגוריה לצפייה:", "🖼️ בחר קטגוריה",
    [{ title: "קטגוריות",
       rows: gallery.map((cat, i) => ({
         id: `gal_${i}`, title: cat.category,
         description: `${cat.items.length} תמונות`,
       })) }]);
}

async function sendGalleryCategory(to, idx) {
  const gallery = await getGallery();
  const cat = gallery[idx];
  if (!cat) { await send(to, "קטגוריה לא נמצאה."); return; }
  await send(to, `🖼️ *${cat.category}* – ${cat.items.length} תמונות:`);
  for (const item of cat.items) {
    try { await sendImage(to, item.url, item.caption); }
    catch (e) { console.error("❌ שגיאה בשליחת תמונה:", e.message); }
  }
}

// ══════════════════════════════════════════════════════════
// חישוב מחיר
// ══════════════════════════════════════════════════════════
function calcPrice(order) {
  const { doors, pkg, handle_addon, nickel, smart_lock } = order;
  const pkgT  = pkg.price * doors;
  const hndT  = handle_addon ? HANDLE_ADDON.price * doors : 0;
  const nklT  = (nickel?.price ?? 0) * doors;
  const base  = pkgT + hndT + nklT;
  const slMin = smart_lock ? SMART_LOCK.priceMin * doors : 0;
  const slMax = smart_lock ? SMART_LOCK.priceMax * doors : 0;
  return { pkgT, hndT, nklT, base, slMin, slMax,
           grandMin: base + slMin, grandMax: base + slMax };
}

// ══════════════════════════════════════════════════════════
// לוגיקת שיחה
// ══════════════════════════════════════════════════════════
async function handleMessage(from, text, msgType) {
  text = (text || "").trim();

  const RESET_WORDS = ["היי", "שלום", "הי", "בוקר טוב", "ערב טוב", "0", "menu"];
  if (RESET_WORDS.includes(text.toLowerCase())) resetSession(from);

  const sess = getSession(from);
  sess.updatedAt = Date.now();

  // ניווט גלובלי
  if (text === "talk_human") {
    await send(from, `💬 *שמחים לעזור!*\n📞 ${LINKS.phone}\n🌐 ${LINKS.website}`);
    delete sessions[from]; return;
  }
  if (text === "new_quote") { resetSession(from); await handleMessage(from, "", ""); return; }
  if (text === "main_menu") { resetSession(from); await handleMessage(from, "", ""); return; }

  try {
    switch (sess.step) {

      // ────────────────────────────────────────────────────
      case S.WELCOME:
        await send(from,
          `שלום! 👋 שמי *אור*, בעלים של *קלאסיקה עיצובים* 🎨\n\n` +
          `מתמחים בהפיכת דלתות, קירות ומטבחים ישנים ליצירות אומנות ייחודיות.\n\n` +
          `📸 instagram.com/classicadesigns\n🌐 classicsadesign.com`
        );
        await sendButtons(from, "במה תרצה שנעזור?", [
          { id: "get_quote", title: "📋 הצעת מחיר"  },
          { id: "gallery",   title: "🖼️ עבודות שלנו" },
          { id: "ai_chat",   title: "🤖 שאל את הבוט" },
        ]);
        sess.step = S.QUAL_TYPE;
        break;

      // ────────────────────────────────────────────────────
      case S.QUAL_TYPE:
        if (text === "gallery") {
          await sendGalleryMenu(from);
          sess.step = S.GALLERY_CAT; break;
        }
        if (text === "ai_chat") {
          await send(from,
            `🤖 *מצב שיחה חופשית עם Claude AI*\n` +
            `שאל אותי כל שאלה על ציפויים, מחירים, טיפול...\n\n` +
            `כתוב *"חזור"* לתפריט הראשי.`
          );
          sess.step = S.AI_CHAT; break;
        }
        if (text === "faq") {
          await sendList(from, `❓ *שאלות נפוצות*\nבחר שאלה:`, "❓ בחר שאלה",
            [{ title: "שאלות", rows: FAQ_LIST.map(f => ({ id: f.id, title: f.q })) }]);
          sess.step = S.FAQ; break;
        }
        // get_quote או כל דבר אחר
        await send(from, `מעולה! 😊 כמה שאלות קצרות כדי להתאים לך את הפתרון:`);
        await sendButtons(from, "1️⃣ מה סוג החידוש?", [
          { id: "type_door",    title: "🚪 דלת"  },
          { id: "type_kitchen", title: "🍳 מטבח" },
          { id: "type_wall",    title: "🧱 קיר"  },
        ]);
        sess.step = S.QUAL_AREA;
        break;

      // ────────────────────────────────────────────────────
      case S.GALLERY_CAT: {
        const match = text.match(/^gal_(\d+)$/);
        if (match) {
          await sendGalleryCategory(from, parseInt(match[1]));
          await sendButtons(from, "מה תרצה עכשיו?", [
            { id: "gallery",   title: "🖼️ קטגוריה נוספת" },
            { id: "get_quote", title: "📋 הצעת מחיר"      },
            { id: "main_menu", title: "🏠 תפריט ראשי"     },
          ]);
          break;
        }
        if (text === "gallery") { await sendGalleryMenu(from); break; }
        resetSession(from); await handleMessage(from, "", ""); break;
      }

      // ────────────────────────────────────────────────────
      case S.AI_CHAT: {
        if (["חזור", "menu", "main_menu"].includes(text.toLowerCase())) {
          resetSession(from); await handleMessage(from, "", ""); return;
        }
        if (!text) break;

        // שומרים עד 10 הודעות אחרונות בהיסטוריה
        sess.aiHistory.push({ role: "user", content: text });
        if (sess.aiHistory.length > 10) sess.aiHistory = sess.aiHistory.slice(-10);

        await send(from, "🤖 מחפש תשובה..."); // Typing indicator טקסטואלי
        const reply = await askClaude(sess.aiHistory.slice(0, -1), text);
        sess.aiHistory.push({ role: "assistant", content: reply });

        await send(from, reply);
        await sendButtons(from, "רוצה להמשיך?", [
          { id: "ai_chat",   title: "💬 שאלה נוספת" },
          { id: "get_quote", title: "📋 הצעת מחיר"   },
          { id: "gallery",   title: "🖼️ ראה עבודות"  },
        ]);
        break;
      }

      // ────────────────────────────────────────────────────
      case S.QUAL_AREA: {
        const typeMap = { type_door: "🚪 דלת", type_kitchen: "🍳 מטבח", type_wall: "🧱 קיר" };
        sess.order.renewal_type = typeMap[text] || text;
        await sendList(from, "2️⃣ באיזה אזור בארץ?", "📍 בחר אזור", [{
          title: "אזורים", rows: [
            { id: "area_center",    title: '🏙️ מרכז (ת"א, גוש דן)' },
            { id: "area_north",     title: "🌄 צפון"                 },
            { id: "area_south",     title: "🌅 דרום"                 },
            { id: "area_jerusalem", title: "🕍 ירושלים והסביבה"      },
            { id: "area_shfela",    title: "🌾 שפלה ושרון"           },
            { id: "area_other",     title: "📍 אחר"                  },
          ],
        }]);
        sess.step = S.QUAL_PHOTO;
        break;
      }

      // ────────────────────────────────────────────────────
      case S.QUAL_PHOTO: {
        const areaMap = {
          area_center: "מרכז", area_north: "צפון", area_south: "דרום",
          area_jerusalem: "ירושלים", area_shfela: "שפלה ושרון", area_other: "אחר",
        };
        sess.order.area = areaMap[text] || text;
        await send(from, `3️⃣ *אשמח לתצלום* של הפריט שתרצה לחדש 📸\nזה עוזר להתאים לך את הפתרון המדויק!\n_אין תמונה? לחץ "המשך"_`);
        await sendButtons(from, "", [{ id: "photo_skip", title: "➡️ המשך ללא תמונה" }]);
        sess.step = S.DOOR_COUNT;
        break;
      }

      // ────────────────────────────────────────────────────
      case S.DOOR_COUNT: {
        if (text === "photo_received") await send(from, "תודה על התמונה! 📸 ממשיכים...");

        if (sess.order.renewal_type?.includes("מטבח") || sess.order.renewal_type?.includes("קיר")) {
          await send(from,
            `תודה! 🙏\n*${sess.order.renewal_type}* באזור *${sess.order.area}* –\n` +
            `נציג שלנו *אור* יחזור אליך בהקדם עם הצעה מותאמת! 😊\n\n📞 דחוף? ${LINKS.phone}`
          );
          console.log("📋 LEAD:", { area: sess.order.area, type: sess.order.renewal_type, ts: new Date().toISOString() });
          delete sessions[from]; return;
        }
        await sendButtons(from, "כמה דלתות לציפוי?", [
          { id: "d1", title: "1️⃣ דלת אחת"    },
          { id: "d2", title: "2️⃣ שתי דלתות"  },
          { id: "d3", title: "3️⃣ שלוש ויותר" },
        ]);
        sess.step = S.SIZE_TYPE;
        break;
      }

      // ────────────────────────────────────────────────────
      case S.SIZE_TYPE: {
        if (text === "d3") {
          await send(from, "כמה דלתות בדיוק? (שלח מספר, לדוגמה: 4)");
          sess.step = S.DOOR_COUNT_EXACT; break;
        }
        const num = { d1: 1, d2: 2 }[text] ?? parseInt(text);
        if (!num || num < 1) { await send(from, "אנא בחר מהכפתורים."); break; }
        sess.order.doors = num;
        await sendButtons(from, "מה מידות הדלת?", [
          { id: "std",    title: "📐 מידה סטנדרטית" },
          { id: "custom", title: "✏️ מידה מותאמת"   },
        ]);
        sess.step = S.STD_SIZE;
        break;
      }

      case S.DOOR_COUNT_EXACT: {
        const num = parseInt(text);
        if (!num || num < 3 || num > 50) { await send(from, "נא להזין מספר תקין (3–50)."); break; }
        sess.order.doors = num;
        await sendButtons(from, "מה מידות הדלת?", [
          { id: "std",    title: "📐 מידה סטנדרטית" },
          { id: "custom", title: "✏️ מידה מותאמת"   },
        ]);
        sess.step = S.STD_SIZE;
        break;
      }

      // ────────────────────────────────────────────────────
      case S.STD_SIZE:
        if (text === "custom") {
          await send(from, 'מה *הרוחב* בס"מ? (לדוגמה: 90)');
          sess.step = S.CUSTOM_W; break;
        }
        await sendList(from, "בחר מידה:", "📐 בחר מידה",
          [{ title: "מידות נפוצות", rows: STD_SIZES.map(s => ({ id: s.id, title: s.label })) }]);
        sess.step = S.PACKAGE;
        break;

      case S.CUSTOM_W: {
        const w = parseInt(text);
        if (!w || w < 50 || w > 200) { await send(from, 'נא להזין רוחב תקין (50–200 ס"מ).'); break; }
        sess.order.width_cm = w;
        await send(from, 'מה *הגובה* בס"מ? (לדוגמה: 210)');
        sess.step = S.CUSTOM_H; break;
      }

      case S.CUSTOM_H: {
        const hh = parseInt(text);
        if (!hh || hh < 150 || hh > 300) { await send(from, 'נא להזין גובה תקין (150–300 ס"מ).'); break; }
        sess.order.height_cm = hh;
        sess.step = S.PACKAGE;
        await handleMessage(from, "__pkg", ""); return;
      }

      // ────────────────────────────────────────────────────
      case S.PACKAGE: {
        if (text !== "__pkg") {
          const size = STD_SIZES.find(s => s.id === text);
          if (!size) { await send(from, "אנא בחר מידה מהרשימה."); break; }
          sess.order.width_cm = size.w; sess.order.height_cm = size.h;
        }
        await sendList(from,
          `✨ *בחר חבילת ציפוי:*\nציפוי שני צדדים + התקנה + אחריות שנה`,
          "💎 בחר חבילה",
          [{ title: "חבילות", rows: PACKAGES.map(p => ({
            id: p.id, title: `${p.name} – ₪${p.price.toLocaleString()}`,
            description: p.includes.join(" | "),
          }))}]);
        sess.step = S.HANDLE_ADDON;
        break;
      }

      case S.HANDLE_ADDON: {
        const pkg = PACKAGES.find(p => p.id === text);
        if (!pkg) { await send(from, "אנא בחר חבילה מהרשימה."); break; }
        sess.order.pkg = pkg;
        await sendButtons(from,
          `🖐️ *ידית לאורך* – ₪${HANDLE_ADDON.price} לדלת\nתוספת מעוצבת שמשדרגת את המראה.\nלהוסיף?`,
          [{ id: "ha_yes", title: "✅ כן, הוסף" }, { id: "ha_no", title: "❌ לא תודה" }]);
        sess.step = S.TEXTURE;
        break;
      }

      case S.TEXTURE:
        sess.order.handle_addon = (text === "ha_yes");
        await sendButtons(from, "🎨 *סגנון הטפט:*",
          TEXTURE_OPTS.map(t => ({ id: t.id, title: t.label })));
        sess.step = S.NICKEL;
        break;

      case S.NICKEL: {
        const tex = TEXTURE_OPTS.find(t => t.id === text);
        if (!tex) { await send(from, "אנא בחר סגנון."); break; }
        sess.order.texture = tex.label;
        await sendList(from, `🔩 *פסי ניקל מאלומיניום:*`, "🔩 בחר",
          [{ title: "פסי ניקל", rows: NICKEL_OPTS.map(n => ({
            id: n.id, title: n.label,
            description: n.price > 0 ? `+₪${n.price} לדלת` : "ללא תוספת",
          }))}]);
        sess.step = S.SMART_LOCK;
        break;
      }

      case S.SMART_LOCK: {
        const nickel = NICKEL_OPTS.find(n => n.id === text);
        if (!nickel) { await send(from, "אנא בחר אפשרות."); break; }
        sess.order.nickel = nickel;
        await sendButtons(from,
          `🔐 *מנעול חכם* – שדרג את האבטחה!\n*₪1,750–3,500 כולל התקנה*\nמעוניין?`,
          [{ id: "sl_yes", title: "🔐 כן, מעניין!" }, { id: "sl_no", title: "❌ לא כרגע" }]);
        sess.step = S.CONTACT_NAME;
        break;
      }

      case S.CONTACT_NAME:
        sess.order.smart_lock = (text === "sl_yes");
        await send(from, "מה *שמך* המלא? ✍️");
        sess.step = S.CONTACT_PHONE;
        break;

      case S.CONTACT_PHONE:
        if (!text || text.length < 2) { await send(from, "נא להזין שם תקין."); break; }
        sess.order.name = text;
        await send(from, "מה *מספר הטלפון* לחזרה? 📞");
        sess.step = S.SUMMARY;
        break;

      // ────────────────────────────────────────────────────
      case S.SUMMARY: {
        const phone = text.replace(/[^\d+]/g, "");
        if (phone.length < 9) { await send(from, "נא להזין מספר טלפון תקין."); break; }
        sess.order.phone = phone;

        const { pkgT, hndT, nklT, grandMin, grandMax, slMin, slMax } = calcPrice(sess.order);
        const o = sess.order;
        const priceStr = o.smart_lock
          ? `₪${grandMin.toLocaleString()}–₪${grandMax.toLocaleString()}`
          : `₪${grandMin.toLocaleString()}`;

        await send(from,
          `🎉 *הצעת המחיר שלך מוכנה!*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `👤 ${o.name}  📞 ${o.phone}\n` +
          `📍 ${o.area}  |  ${o.renewal_type}\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🚪 ${o.doors} דלתות  📐 ${o.width_cm}×${o.height_cm} ס"מ\n` +
          `💎 ${o.pkg.name} – ₪${pkgT.toLocaleString()}\n` +
          `   ${o.pkg.includes.join(" | ")}\n` +
          (o.handle_addon ? `🖐️ ידית לאורך – ₪${hndT.toLocaleString()}\n` : "") +
          `🎨 ${o.texture}\n` +
          (nklT > 0 ? `🔩 ${o.nickel.label} – ₪${nklT.toLocaleString()}\n` : "") +
          (o.smart_lock ? `🔐 מנעול חכם – ₪${slMin.toLocaleString()}–₪${slMax.toLocaleString()}\n` : "") +
          `━━━━━━━━━━━━━━━━━━\n` +
          `✅ *סה"כ משוער: ${priceStr}*\n` +
          `⚠️ _המחיר הסופי לאחר בחירת דגם ואישור מידות._\n\n` +
          `נציג יחזור אליך בהקדם לתיאום! 😊`
        );

        // לוג ללא מידע אישי מזהה
        console.log("📋 QUOTE:", {
          ts: new Date().toISOString(), area: o.area,
          doors: o.doors, pkg: o.pkg.id, grandMin, grandMax,
        });

        sessions[from] = { step: S.POST_SUMMARY, order: {}, aiHistory: [], updatedAt: Date.now() };
        await sendButtons(from, "תרצה משהו נוסף?", [
          { id: "new_quote",  title: "📋 הצעה חדשה"  },
          { id: "gallery",    title: "🖼️ ראה עבודות"  },
          { id: "talk_human", title: "💬 דבר עם נציג" },
        ]);
        break;
      }

      // ────────────────────────────────────────────────────
      case S.POST_SUMMARY:
        if (text === "gallery") { await sendGalleryMenu(from); sess.step = S.GALLERY_CAT; break; }
        if (text === "talk_human") {
          await send(from, `💬 *שמחים לעזור!*\n📞 ${LINKS.phone}\n🌐 ${LINKS.website}`);
          delete sessions[from]; break;
        }
        resetSession(from); await handleMessage(from, "", ""); break;

      // ────────────────────────────────────────────────────
      case S.FAQ: {
        const faq = FAQ_LIST.find(f => f.id === text);
        if (!faq) { await send(from, "אנא בחר שאלה מהרשימה."); break; }
        await send(from, faq.a);
        await sendButtons(from, "יש לך שאלה נוספת?", [
          { id: "faq_more",  title: "❓ שאלה נוספת" },
          { id: "ai_chat",   title: "🤖 שאל את ה-AI" },
          { id: "get_quote", title: "📋 הצעת מחיר"   },
        ]);
        break;
      }

      // ────────────────────────────────────────────────────
      default:
        if (text === "faq_more") {
          await sendList(from, `❓ *שאלות נפוצות*`, "❓ בחר שאלה",
            [{ title: "שאלות", rows: FAQ_LIST.map(f => ({ id: f.id, title: f.q })) }]);
          sess.step = S.FAQ; break;
        }
        if (text === "gallery") { await sendGalleryMenu(from); sess.step = S.GALLERY_CAT; break; }
        if (text === "ai_chat") {
          sess.step = S.AI_CHAT;
          await send(from, `🤖 *מצב שיחה חופשית עם Claude AI*\nשאל כל שאלה!\nכתוב "חזור" לתפריט.`);
          break;
        }
        // הודעה לא מזוהה – חוזר לתפריט
        resetSession(from); await handleMessage(from, "", "");
    }
  } catch (err) {
    console.error(`❌ שגיאה [${from}]:`, err.message);
    try {
      await send(from, `אירעה שגיאה זמנית 😔\nנסה שוב או פנה ישירות: 📞 ${LINKS.phone}`);
    } catch (_) {}
  }
}

// ══════════════════════════════════════════════════════════
// Webhook
// ══════════════════════════════════════════════════════════
app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // תמיד עונים 200 ל-Meta מיד
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const from = msg.from;
    let text = "", msgType = msg.type;

    if (msg.type === "text") {
      text = msg.text.body;
    } else if (msg.type === "interactive") {
      text = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "";
    } else if (msg.type === "image" && sessions[from]?.step === S.DOOR_COUNT) {
      if (!sessions[from].order) sessions[from].order = {};
      sessions[from].order.has_photo = true;
      text = "photo_received";
    }

    if (!text) return;
    console.log(`📩 [${new Date().toISOString()}] from=*** step=${sessions[from]?.step || "new"} text="${text}"`);
    await handleMessage(from, text, msgType);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// Health check
app.get("/health", (_, res) => res.json({
  status: "ok",
  sessions: Object.keys(sessions).length,
  galleryCached: !!galleryCache,
  galleryItems: galleryCache?.reduce((s, c) => s + c.items.length, 0) ?? 0,
}));

app.listen(PORT, () => {
  console.log(`🚀 קלאסיקה עיצובים Bot – פורט ${PORT}`);
  console.log(`🤖 AI: Claude (Anthropic)`);
  console.log(`🖼️  Gallery: Cloudinary (${CLOUDINARY_CLOUD_NAME})`);
});
