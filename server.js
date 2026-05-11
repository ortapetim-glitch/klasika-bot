/**
 * קלאסיקה עיצובים / אור טפטים
 * WhatsApp Business Chatbot – הצעת מחיר מלאה
 * npm install express axios dotenv
 */

const express = require("express");
const axios   = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, VERIFY_TOKEN, PORT = 3000 } = process.env;
const GRAPH_URL = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`;
const sessions  = {};

// ── שלבי שיחה ───────────────────────────────────────────
const S = {
  WELCOME:       "welcome",
  QUAL_TYPE:     "qual_type",
  QUAL_AREA:     "qual_area",
  QUAL_PHOTO:    "qual_photo",
  DOOR_COUNT:    "door_count",
  SIZE_TYPE:     "size_type",
  STD_SIZE:      "std_size",
  CUSTOM_W:      "custom_w",
  CUSTOM_H:      "custom_h",
  PACKAGE:       "package",
  HANDLE_ADDON:  "handle_addon",
  TEXTURE:       "texture",
  NICKEL:        "nickel",
  SMART_LOCK:    "smart_lock",
  CONTACT_NAME:  "contact_name",
  CONTACT_PHONE: "contact_phone",
  SUMMARY:       "summary",
  FAQ:           "faq",
};

// ── שאלות נפוצות ─────────────────────────────────────────
const FAQ_LIST = [
  {
    id: "faq_install_time",
    q:  "⏱️ כמה זמן לוקחת ההתקנה?",
    a:  `⏱️ *זמן התקנה:*\nהתקנה רגילה של דלת אחת לוקחת *כשעה עד שעתיים* בלבד.\nניתן להשתמש בדלת מיד לאחר ההתקנה! 🚪✅`,
  },
  {
    id: "faq_door_types",
    q:  "🚪 על אילו דלתות זה מתאים?",
    a:  `🚪 *סוגי דלתות מתאימים:*\nהציפוי מתאים לכמעט כל סוג דלת –\n✅ דלת מתכת\n✅ דלת עץ\n✅ דלת MDF\n✅ דלת PVC\n✅ דלת ישנה שרוצים לחדש\n\nהחומר גמיש ומתאים עצמו לכל משטח 💪`,
  },
  {
    id: "faq_warranty",
    q:  "🛡️ יש אחריות על העבודה?",
    a:  `🛡️ *אחריות:*\nכן! אנחנו נותנים *אחריות של שנה* על כל עבודה.\nהאחריות כוללת:\n✅ איכות הציפוי\n✅ ההתקנה\n✅ חומרי האיטום\n\nמייצר הציפוי (יונדאי קוריאה) גם מעניק אחריות על החומר עצמו 🇰🇷`,
  },
  {
    id: "faq_outdoor",
    q:  "🌧️ עמיד בחוץ ובשמש?",
    a:  `☀️ *עמידות תנאי חוץ:*\nהציפוי תוכנן במיוחד לדלתות כניסה –\n✅ עמיד בפני קרני UV\n✅ עמיד בגשם ולחות\n✅ עמיד בחום עד 65°\n✅ עמיד בקור עד 30° מתחת לאפס\n✅ לא מתקלף, לא מצהיב\n\nמושלם לתנאי מזג האוויר בישראל! 🇮🇱`,
  },
  {
    id: "faq_maintenance",
    q:  "🧹 איך מנקים ומתחזקים?",
    a:  `🧹 *תחזוקה:*\nהתחזוקה פשוטה מאוד!\n✅ ניקוי עם מטלית לחה רגילה\n✅ עמיד בפני רוב חומרי ניקוי\n✅ עמיד בכתמים – נבדק נגד מדיו, חומץ ויין 24 שעות\n✅ אין צורך בציפוי מחודש\n\nזהו! 😄`,
  },
  {
    id: "faq_colors",
    q:  "🎨 אילו צבעים ודגמים יש?",
    a:  `🎨 *מגוון הדגמים:*\nיש לנו מאות דגמים! כולל:\n🪵 סדרת עצים (אלון, אגוז, ונגה, אפר...)\n🪨 סדרת אבן וטרוורטין\n🧱 סדרת בטון\n🔲 סדרת שיש\n🎨 גוונים חלקים (לבן, אפור, שחור, תכלת, ירוק...)\n🧵 סדרת עור ואריגה\n\nשלח לנו תמונה של הדלת ונמליץ מה הכי יתאים! 📸`,
  },
  {
    id: "faq_price_range",
    q:  "💰 מה טווח המחירים?",
    a:  `💰 *מחירים:*\n🥈 סילבר – ₪999 (ציפוי + התקנה)\n🥇 גולד – ₪1,299 (+ ידיות + סוגר + עינית)\n💎 פלטינום – ₪1,499 (+ צילינדר + 5 מפתחות)\n\n*תוספות אופציונליות:*\n🖐️ ידית לאורך +₪499\n🔩 פס ניקל לרוחב +₪35 / לאורך +₪70\n🔐 מנעול חכם ₪1,750–3,500\n\n_כולל התקנה + אחריות שנה_ ✅`,
  },
  {
    id: "faq_smart_lock",
    q:  "🔐 מה זה מנעול חכם?",
    a:  `🔐 *מנעול חכם:*\nמנעול דיגיטלי מתקדם שמחליף את המנעול הרגיל.\n\n*יתרונות:*\n✅ פתיחה עם קוד / טביעת אצבע / אפליקציה\n✅ אין צורך במפתח\n✅ ניהול הרשאות מרחוק\n✅ התראות על פתיחה\n✅ מגוון דגמים ממותגים מובילים\n\n💰 מחיר: ₪1,750–3,500 כולל התקנה מקצועית\n\nרוצה לשמוע עוד? נציג שלנו ישמח לעזור! 📞`,
  },
  {
    id: "faq_area",
    q:  "📍 באיזה אזורים אתם עובדים?",
    a:  `📍 *אזורי שירות:*\nאנחנו עובדים בכל הארץ! 🇮🇱\n✅ מרכז וגוש דן\n✅ ירושלים והסביבה\n✅ צפון\n✅ דרום\n✅ שפלה ושרון\n\nלתיאום הגעה – השאר פרטים ונחזור אליך 😊`,
  },
  {
    id: "faq_samples",
    q:  "👀 אפשר לראות דוגמאות עבודה?",
    a:  `👀 *דוגמאות עבודה:*\nבהחלט! תראה את העבודות שלנו:\n\n📸 אינסטגרם: instagram.com/classicadesigns\n👍 פייסבוק: facebook.com/classicadesign\n🎵 טיקטוק: tiktok.com/@classica_design\n🌐 אתר: classicsadesign.com\n\nיש לנו המון עבודות מרשימות! 🔥`,
  },
];


// ── קטלוג ────────────────────────────────────────────────
const PACKAGES = [
  { id:"silver",   name:"🥈 סילבר",   price:999,
    includes:["ציפוי לשני צידי הדלת","התקנה מקצועית"] },
  { id:"gold",     name:"🥇 גולד",    price:1299,
    includes:["ציפוי לשני צידי הדלת","ידיות","סוגר עליון מעוצב ועינית"] },
  { id:"platinum", name:"💎 פלטינום", price:1499,
    includes:["ציפוי לשני צידי הדלת","ידיות","סוגר עליון מעוצב ועינית","צילינדר + 5 מפתחות"] },
];

const HANDLE_ADDON = { price:499, label:"ידית לאורך" };

const NICKEL_OPTS = [
  { id:"nickel_none", label:"ללא פס ניקל",          price:0  },
  { id:"nickel_h",    label:"פס ניקל לרוחב (+₪35)", price:35 },
  { id:"nickel_v",    label:"פס ניקל לאורך (+₪70)", price:70 },
];

const TEXTURE_OPTS = [
  { id:"tex_smooth", label:"🎨 גוון חלק"       },
  { id:"tex_bold",   label:"🪨 טקסטורה מודגשת" },
];

const SMART_LOCK = { priceMin:1750, priceMax:3500 };

// ── קישורים ─────────────────────────────────────────────
const LINKS = {
  phone: "0539312574",
  website: "https://classicsadesign.com",
};

const STD_SIZES = [
  { id:"s1", label:'200×90 ס"מ (סטנדרט נפוץ)', w:90,  h:200 },
  { id:"s2", label:'210×90 ס"מ',                w:90,  h:210 },
  { id:"s3", label:'220×100 ס"מ',               w:100, h:220 },
  { id:"s4", label:'240×110 ס"מ (כניסה ראשית)', w:110, h:240 },
];

// ── חישוב ────────────────────────────────────────────────
function calcPrice(s) {
  const { doors, pkg, handle_addon, nickel, smart_lock } = s.order;
  const pkgT    = pkg.price * doors;
  const hndT    = handle_addon ? HANDLE_ADDON.price * doors : 0;
  const nklT    = (nickel?.price || 0) * doors;
  const base    = pkgT + hndT + nklT;
  const slMin   = smart_lock ? SMART_LOCK.priceMin * doors : 0;
  const slMax   = smart_lock ? SMART_LOCK.priceMax * doors : 0;
  return { pkgT, hndT, nklT, base, slMin, slMax,
           grandMin: base + slMin, grandMax: base + slMax };
}

// ── שליחה ────────────────────────────────────────────────
const h = { Authorization: `Bearer ${WHATSAPP_TOKEN}` };
async function send(to, text) {
  await axios.post(GRAPH_URL,
    { messaging_product:"whatsapp", to, type:"text", text:{ body:text } },
    { headers: h });
}
async function sendButtons(to, body, buttons) {
  await axios.post(GRAPH_URL,
    { messaging_product:"whatsapp", to, type:"interactive",
      interactive:{ type:"button", body:{ text:body },
        action:{ buttons: buttons.map(b=>({ type:"reply", reply:{ id:b.id, title:b.title } })) } } },
    { headers: h });
}
async function sendList(to, body, btn, sections) {
  await axios.post(GRAPH_URL,
    { messaging_product:"whatsapp", to, type:"interactive",
      interactive:{ type:"list", body:{ text:body }, action:{ button:btn, sections } } },
    { headers: h });
}

// ── שיחה ─────────────────────────────────────────────────
async function handleMessage(from, text) {
  text = (text || "").trim();
  if (!sessions[from]) sessions[from] = { step:S.WELCOME, order:{} };
  const sess = sessions[from];

  if (["היי","שלום","הי","בוקר טוב","ערב טוב","0","menu"].includes(text.toLowerCase())) {
    sessions[from] = { step:S.WELCOME, order:{} };
    sess.step = S.WELCOME;
  }

  switch (sess.step) {

    case S.WELCOME:
      await send(from,
        `שלום! 👋 נעים להכיר, שמי *אור* ואני הבעלים של *קלאסיקה עיצובים* 🎨\n\n` +
        `אנחנו מתמחים בהפיכת דלתות, קירות ומטבחים ישנים ל*יצירות אומנות ייחודיות* –\n` +
        `שתרשים את הסביבה שלך ותחסוך לך לא מעט כסף 💰\n\n` +
        `עקוב אחרינו ברשתות:\n` +
        `📸 אינסטגרם: instagram.com/classicadesigns\n` +
        `👍 פייסבוק: facebook.com/classicadesign\n` +
        `🎵 טיקטוק: tiktok.com/@classica_design\n` +
        `🌐 אתר: classicsadesign.com`
      );
      await sendButtons(from, "במה תרצה שנעזור?", [
        { id:"get_quote",  title:"📋 הצעת מחיר"      },
        { id:"faq",        title:"❓ שאלות נפוצות"    },
        { id:"about_prod", title:"🎨 על המוצר"        },
      ]);
      sess.step = S.QUAL_TYPE;
      break;

    // ── שלב 1: סוג החידוש ────────────────────────────
    case S.QUAL_TYPE:
      if (text === "faq") {
        await sendList(from,
          `❓ *שאלות נפוצות – קלאסיקה עיצובים*\nבחר שאלה ואקבל תשובה מיידית:`,
          "❓ בחר שאלה",
          [{ title: "שאלות נפוצות", rows: FAQ_LIST.map(f => ({ id: f.id, title: f.q })) }]
        );
        sess.step = S.FAQ;
        break;
      }
      if (text === "about_prod") {
        await send(from,
          `✨ *ציפוי פולימרי דקורטיבי – קלאסיקה עיצובים*\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `ציפוי רב-שימושי לעיצוב פנים חכם וחסכוני.\n\n` +
          `🏠 *ניתן להתקנה על:*\n` +
          `דלתות • קירות • תקרות • מטבחים • ארונות • ריהוט • אריחים • קרמיקה\n\n` +
          `🇰🇷 *ייצור:* יונדאי, דרום קוריאה\n` +
          `📏 *רוחב גליל:* 123 ס"מ – חיבור מינימלי למראה נקי`
        );
        await send(from,
          `🎨 *סדרות עיצוב:*\n` +
          `🪨 אבן • 🪵 עץ • 🧱 בטון • 🔲 שיש • 🧵 עור • 🔩 מתכת • 🪡 בד\n\n` +
          `🧪 *תכונות:*\n` +
          `💪 עמיד לשחיקה (5,000 RPM+)\n` +
          `🌡️ עמיד חום/קור (-30° עד 65°)\n` +
          `💧 עמיד ללחות • 🛡️ עמיד לכתמים • 🔥 עמיד באש`
        );
        await sendButtons(from, "רוצה הצעת מחיר?", [
          { id:"get_quote", title:"📋 כן, בואנו!" },
        ]);
        break;
      }
      if (text === "more_info") {
        await send(from,
          `💰 *מחירים וחבילות*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🥈 *סילבר – ₪999* | ציפוי + התקנה\n` +
          `🥇 *גולד – ₪1,299* | + ידיות + סוגר + עינית\n` +
          `💎 *פלטינום – ₪1,499* | + צילינדר + 5 מפתחות\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🔩 פס ניקל לרוחב +₪35 | לאורך +₪70\n` +
          `🖐️ ידית לאורך +₪499\n` +
          `🔐 מנעול חכם ₪1,750–3,500\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `_כולל התקנה + אחריות שנה_`
        );
        await sendButtons(from, "רוצה הצעת מחיר?", [
          { id:"get_quote", title:"📋 כן, בואנו!" },
        ]);
        break;
      }
      // get_quote או כל טקסט אחר – מתחילים שאלות הכרות
      await send(from,
        `מעולה! 😊 לפני שאשלח מחירים, חשוב לי *להתאים לך את הפתרון המושלם*.\nכמה שאלות קצרות:`
      );
      await sendButtons(from, "1️⃣ מה סוג החידוש?", [
        { id:"type_door",    title:"🚪 דלת"    },
        { id:"type_kitchen", title:"🍳 מטבח"   },
        { id:"type_wall",    title:"🧱 קיר"    },
      ]);
      sess.step = S.QUAL_AREA;
      break;

    // ── שלב 2: אזור בארץ ─────────────────────────────
    case S.QUAL_AREA: {
      const typeMap = {
        type_door:    "🚪 דלת",
        type_kitchen: "🍳 מטבח",
        type_wall:    "🧱 קיר",
      };
      sess.order.renewal_type = typeMap[text] || text;
      await sendList(from, "2️⃣ באיזה אזור בארץ אתה נמצא?", "📍 בחר אזור", [{
        title: "אזורים",
        rows: [
          { id:"area_center",  title:"🏙️ מרכז (ת\"א, גוש דן)" },
          { id:"area_north",   title:"🌄 צפון"                  },
          { id:"area_south",   title:"🌅 דרום"                  },
          { id:"area_jerusalem", title:"🕍 ירושלים והסביבה"     },
          { id:"area_shfela",  title:"🌾 שפלה ושרון"            },
          { id:"area_other",   title:"📍 אחר"                   },
        ],
      }]);
      sess.step = S.QUAL_PHOTO;
      break;
    }

    // ── שלב 3: תמונת הפריט ───────────────────────────
    case S.QUAL_PHOTO: {
      const areaMap = {
        area_center: "מרכז", area_north: "צפון", area_south: "דרום",
        area_jerusalem: "ירושלים", area_shfela: "שפלה ושרון", area_other: "אחר",
      };
      sess.order.area = areaMap[text] || text;
      await send(from,
        `3️⃣ *אשמח לתצלום* של הפריט שתרצה לחדש 📸\n` +
        `זה עוזר לנו להתאים לך את הפתרון המדויק!\n\n` +
        `_אם אין תמונה עכשיו, לחץ "המשך" ונסדר בשיחה_`
      );
      await sendButtons(from, "", [
        { id:"photo_skip", title:"➡️ המשך ללא תמונה" },
      ]);
      sess.step = S.DOOR_COUNT;
      break;
    }

    case S.DOOR_COUNT:
      // טיפול בתמונה שנשלחה
      if (text === "photo_received") {
        await send(from, "תודה על התמונה! 📸 ממשיכים...");
        text = "photo_skip";
      }
      // מגיע אחרי תמונה (image message) או skip
      if (sess.order.renewal_type?.includes("מטבח") || sess.order.renewal_type?.includes("קיר")) {
        // מטבח/קיר – נעביר לנציג
        await send(from,
          `תודה! 🙏 קיבלנו את הפרטים שלך.\n\n` +
          `*${sess.order.renewal_type}* באזור *${sess.order.area}* –\n` +
          `נציג שלנו *אור* יחזור אליך בהקדם עם הצעת מחיר מותאמת אישית! 😊\n\n` +
          `📞 דחוף? התקשר ישירות: ${LINKS.phone}`
        );
        console.log("📋 LEAD (kitchen/wall):", { from, ...sess.order, ts: new Date().toISOString() });
        delete sessions[from];
        return;
      }
      if (text === "about_prod") {
        // הודעה 1 – מה זה הציפוי
        await send(from,
          `✨ *ציפוי פולימרי דקורטיבי – קלאסיקה עיצובים*\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `ציפוי רב-שימושי לעיצוב פנים חכם וחסכוני.\n\n` +
          `🏠 *ניתן להתקנה על:*\n` +
          `דלתות • קירות • תקרות • מטבחים • ארונות • ריהוט • אריחים • קרמיקה • וכל משטח אחר\n\n` +
          `🇰🇷 *ייצור:* יונדאי, דרום קוריאה\n` +
          `📏 *רוחב גליל:* 123 ס"מ – חיבור מינימלי למראה נקי ומושלם`
        );
        // הודעה 2 – חומר ועיצוב
        await send(from,
          `🎨 *סדרות עיצוב:*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🪨 אבן  •  🪵 עץ  •  🧱 בטון\n` +
          `🔲 שיש  •  🧵 עור  •  🪢 אריגה\n` +
          `🔩 מתכת  •  🪡 בד\n\n` +
          `_נראות ומגע – הכי קרוב לדבר האמיתי_ 🤌\n\n` +
          `💡 *גמישות ותרמו-פורמביליות:*\n` +
          `הציפוי מתאים עצמו לכל צורה ומשטח – כולל עיגולים, קצוות ופינות`
        );
        // הודעה 3 – תכונות פיזיקליות
        await send(from,
          `🧪 *תכונות פיזיקליות:*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `💪 עמידות לשחיקה – נבדק מעל 5,000 RPM\n` +
          `🌡️ עמידות לחום/קור – בין -30° ל-65° צלסיוס\n` +
          `💧 עמידות ללחות – חומר נושם\n` +
          `🛡️ עמידות לכתמים – נבדק נגד מדיו, חומץ ויין (24 שעות)\n` +
          `🔥 עמיד באש\n` +
          `🧴 עמיד בפני כימיקלים`
        );
        await sendButtons(from, "רוצה לקבל הצעת מחיר לדלת שלך?", [
          { id:"get_quote", title:"📋 כן, בואנו!" },
          { id:"more_info", title:"💰 מחירים וחבילות" },
        ]);
        break;
      }

      if (text === "more_info") {
        await send(from,
          `💰 *מחירים וחבילות – קלאסיקה עיצובים*\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `🥈 *סילבר – ₪999*\n` +
          `ציפוי שני צדדים + התקנה\n\n` +
          `🥇 *גולד – ₪1,299*\n` +
          `+ ידיות + סוגר עליון מעוצב + עינית\n\n` +
          `💎 *פלטינום – ₪1,499*\n` +
          `+ צילינדר + 5 מפתחות\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🔩 פס ניקל לרוחב: +₪35 | לאורך: +₪70\n` +
          `🖐️ ידית לאורך: +₪499\n` +
          `🔐 מנעול חכם: ₪1,750–3,500 כולל התקנה\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `_כולל התקנה מקצועית + אחריות שנה_`
        );
        await sendButtons(from, "רוצה הצעת מחיר?", [
          { id:"get_quote", title:"📋 כן, בואנו!" },
        ]);
        break;
      }
      await sendButtons(from, "כמה דלתות לציפוי?", [
        { id:"d1", title:"1️⃣ דלת אחת"    },
        { id:"d2", title:"2️⃣ שתי דלתות"  },
        { id:"d3", title:"3️⃣ שלוש ויותר" },
      ]);
      sess.step = S.SIZE_TYPE;
      break;

    case S.SIZE_TYPE: {
      const map = { d1:1, d2:2, d3:3 };
      const num = map[text] ?? parseInt(text);
      if (!num || num < 1 || num > 10) {
        await send(from, "אנא בחר מספר דלתות, או שלח מספר (לדוגמה: 4)"); break;
      }
      sess.order.doors = num;
      await sendButtons(from, "מה מידות הדלת?", [
        { id:"std",    title:"📐 מידה סטנדרטית" },
        { id:"custom", title:"✏️ מידה מותאמת"   },
      ]);
      sess.step = S.STD_SIZE;
      break;
    }

    case S.STD_SIZE:
      if (text === "custom") {
        await send(from, "מה *הרוחב* בס\"מ? (לדוגמה: 90)");
        sess.step = S.CUSTOM_W; break;
      }
      await sendList(from, "בחר מידה:", "📐 בחר מידה",
        [{ title:"מידות נפוצות", rows: STD_SIZES.map(s=>({ id:s.id, title:s.label })) }]);
      sess.step = S.PACKAGE;
      break;

    case S.CUSTOM_W: {
      const w = parseInt(text);
      if (!w || w < 50 || w > 200) { await send(from, "נא להזין רוחב תקין (50–200 ס\"מ)"); break; }
      sess.order.width_cm = w;
      await send(from, "מה *הגובה* בס\"מ? (לדוגמה: 210)");
      sess.step = S.CUSTOM_H; break;
    }

    case S.CUSTOM_H: {
      const hh = parseInt(text);
      if (!hh || hh < 150 || hh > 300) { await send(from, "נא להזין גובה תקין (150–300 ס\"מ)"); break; }
      sess.order.height_cm = hh;
      sess.step = S.PACKAGE;
      await handleMessage(from, "__pkg"); return;
    }

    case S.PACKAGE: {
      if (text !== "__pkg") {
        const size = STD_SIZES.find(s => s.id === text);
        if (!size) { await send(from, "אנא בחר מידה מהרשימה."); break; }
        sess.order.width_cm  = size.w;
        sess.order.height_cm = size.h;
      }
      await sendList(from,
        `✨ *בחר חבילת ציפוי:*\nכולל ציפוי שני צדדים + התקנה + אחריות שנה`,
        "💎 בחר חבילה",
        [{ title:"חבילות", rows: PACKAGES.map(p=>({
          id: p.id,
          title: `${p.name} – ₪${p.price.toLocaleString()}`,
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
        `🖐️ *תוספת ידית לאורך* – ₪${HANDLE_ADDON.price} לדלת\nתוספת מעוצבת שמשדרגת את המראה.\n\nלהוסיף?`,
        [{ id:"ha_yes", title:"✅ כן, הוסף" }, { id:"ha_no", title:"❌ לא תודה" }]);
      sess.step = S.TEXTURE;
      break;
    }

    case S.TEXTURE:
      sess.order.handle_addon = (text === "ha_yes");
      await sendButtons(from, `🎨 *סגנון הטפט* – איזה מראה תרצה?`,
        TEXTURE_OPTS.map(t => ({ id:t.id, title:t.label })));
      sess.step = S.NICKEL;
      break;

    case S.NICKEL: {
      const tex = TEXTURE_OPTS.find(t => t.id === text);
      if (!tex) { await send(from, "אנא בחר סגנון טפט."); break; }
      sess.order.texture = tex.label;
      await sendList(from,
        `🔩 *פסי ניקל מאלומיניום*\nניתן להוסיף פס להדגשה ועיצוב`,
        "🔩 בחר אפשרות",
        [{ title:"פסי ניקל", rows: NICKEL_OPTS.map(n=>({
          id: n.id, title: n.label,
          description: n.price > 0 ? `תוספת ₪${n.price} לדלת` : "ללא תוספת",
        }))}]);
      sess.step = S.SMART_LOCK;
      break;
    }

    case S.SMART_LOCK: {
      const nickel = NICKEL_OPTS.find(n => n.id === text);
      if (!nickel) { await send(from, "אנא בחר אפשרות מהרשימה."); break; }
      sess.order.nickel = nickel;
      await sendButtons(from,
        `🔐 *מנעול חכם* – שדרג את האבטחה!\n` +
        `מגוון דגמים ממותגים מובילים.\n*₪1,750–3,500 כולל התקנה*\n\nמעוניין?`,
        [{ id:"sl_yes", title:"🔐 כן, מעניין!" }, { id:"sl_no", title:"❌ לא כרגע" }]);
      sess.step = S.CONTACT_NAME;
      break;
    }

    case S.CONTACT_NAME:
      sess.order.smart_lock = (text === "sl_yes");
      await send(from, "מה *שמך* המלא? ✍️");
      sess.step = S.CONTACT_PHONE;
      break;

    case S.CONTACT_PHONE:
      if (!text || text.length < 2) { await send(from, "נא להזין שם."); break; }
      sess.order.name = text;
      await send(from, "מה *מספר הטלפון* לחזרה? 📞");
      sess.step = S.SUMMARY;
      break;

    case S.SUMMARY: {
      const phone = text.replace(/[^\d+]/g, "");
      if (phone.length < 9) { await send(from, "נא להזין מספר טלפון תקין."); break; }
      sess.order.phone = phone;

      const { pkgT, hndT, nklT, grandMin, grandMax, slMin, slMax } = calcPrice(sess);
      const o = sess.order;
      const priceStr = o.smart_lock
        ? `₪${grandMin.toLocaleString()}–₪${grandMax.toLocaleString()}`
        : `₪${grandMin.toLocaleString()}`;

      await send(from,
        `🎉 *הצעת המחיר שלך מוכנה!*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👤 ${o.name}  📞 ${o.phone}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🚪 דלתות: ${o.doors}  📐 ${o.width_cm}×${o.height_cm} ס"מ\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💎 חבילה: ${o.pkg.name} – ₪${pkgT.toLocaleString()}\n` +
        `   ${o.pkg.includes.join(" | ")}\n` +
        (o.handle_addon ? `🖐️ ידית לאורך – ₪${hndT.toLocaleString()}\n` : "") +
        `🎨 טקסטורה: ${o.texture}\n` +
        (nklT > 0 ? `🔩 ${o.nickel.label} – ₪${nklT.toLocaleString()}\n` : `🔩 ללא פס ניקל\n`) +
        (o.smart_lock ? `🔐 מנעול חכם – ₪${slMin.toLocaleString()}–₪${slMax.toLocaleString()}\n` : "") +
        `━━━━━━━━━━━━━━━━━━\n` +
        `✅ *סה"כ משוער: ${priceStr}*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ _המחיר הסופי לאחר בחירת דגם ואישור מידות._\n\n` +
        `נציג יחזור אליך בהקדם לתיאום! 😊`);

      console.log("📋 QUOTE:", { ts: new Date().toISOString(), from, ...o, pkgT, hndT, nklT, grandMin, grandMax });

      await sendButtons(from, "תרצה משהו נוסף?", [
        { id:"new_quote",  title:"📋 הצעה חדשה"  },
        { id:"talk_human", title:"💬 דבר עם נציג" },
      ]);
      delete sessions[from];
      break;
    }

    // ── FAQ ───────────────────────────────────────────
    case S.FAQ: {
      const faq = FAQ_LIST.find(f => f.id === text);
      if (!faq) { await send(from, "אנא בחר שאלה מהרשימה."); break; }
      await send(from, faq.a);
      await sendButtons(from, "יש לך שאלה נוספת?", [
        { id:"faq_more",  title:"❓ שאלה נוספת"  },
        { id:"get_quote", title:"📋 הצעת מחיר"    },
        { id:"talk_human",title:"💬 דבר עם אור"   },
      ]);
      break;
    }

    // ── המשך FAQ ─────────────────────────────────────
    // (אחרי תשובה לשאלה)
    default:
      if (text === "faq_more") {
        await sendList(from,
          `❓ *שאלות נפוצות – קלאסיקה עיצובים*`,
          "❓ בחר שאלה",
          [{ title: "שאלות נפוצות", rows: FAQ_LIST.map(f => ({ id: f.id, title: f.q })) }]
        );
        sess.step = S.FAQ;
        break;
      }
      sessions[from] = { step:S.WELCOME, order:{} };
      await handleMessage(from, text);
  }
}

// ── Webhook ──────────────────────────────────────────────
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
    if (msg.type === "text") text = msg.text.body;
    else if (msg.type === "interactive")
      text = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "";
    else if (msg.type === "image") {
      // לקוח שלח תמונה – שמור ותמשיך
      if (sessions[from]?.step === "qual_photo") {
        sessions[from].order.has_photo = true;
        text = "photo_received";
      }
    }
    console.log(`📩 ${from}: "${text}"`);
    await handleMessage(from, text);
  } catch (err) { console.error("❌", err.message); }
});

app.listen(PORT, () => console.log(`🚀 קלאסיקה עיצובים Bot – פורט ${PORT}`));