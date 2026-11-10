/* Stock Room words in English and Hindi. Plain JS, no build step.
   Static text: data-i18n="key" (text) or data-i18n-ph="key" (placeholder). Code: I18N.t("key", {n: 3}). */
(function () {
  "use strict";
  const W = {
    en: {
      "nav.home": "Home", "nav.bill": "Bill", "nav.stock": "Stock", "nav.dash": "Hisaab", "nav.more": "More",
      "nav.scan": "Scan", "nav.add": "Add", "nav.labels": "Labels", "nav.admin": "Admin",
      "top.sub": "Stock Room", "top.out": "out", "net.live": "Live", "net.off": "Offline",
      "home.pairs": "Pairs in stock", "home.articles": "{n} articles", "home.value": "Stock value", "home.atCost": "at cost price",
      "home.in": "Maal aaya", "home.inSub": "Photo of the challan · stock in",
      "home.out": "Maal bika", "home.outSub": "Photo of sale bill, or Excel · stock out",
      "home.ask": "Suggested · you decide", "home.none": "Nothing to decide right now.", "home.today": "Today",
      "home.noBills": "No bills yet today.", "home.toOrder": "To order",
      "sug.reorder": "{name} is down to {qty}. {sold} sold in 30 days. Reorder {sq}?",
      "sug.sale": "{name}: {qty} pieces, nothing sold for {days} days. {value} stuck. Put it on sale?",
      "sug.count": "{name}: the book says {qty}. A quick count keeps it right.",
      "sug.approve": "Approve", "sug.notNow": "Not now", "sug.enterCount": "Enter count", "sug.done": "Noted",
      "bill.title": "Bill", "bill.in": "Stock in", "bill.out": "Sold",
      "bill.photo": "Take photo", "bill.gallery": "Pick photo", "bill.excel": "Excel or CSV of sales",
      "bill.hintIn": "Fit the whole challan in the photo. One photo per page.",
      "bill.hintOut": "Photo of the sale bill, or an Excel/CSV with item and qty columns.",
      "bill.reading": "Reading the bill…", "bill.offline": "Reading a bill needs the internet. Try again when online.",
      "bill.recent": "Recent bills", "bill.noRecent": "No bills yet.",
      "bill.check": "Check and approve", "bill.retake": "← Start again", "bill.supplier": "Supplier", "bill.date": "Date", "bill.no": "Bill no.",
      "bill.rows": "AI read {n} rows.", "bill.row1": "AI read 1 row.", "bill.allOk": "The sums match the bill.", "bill.written": "Written",
      "bill.qty": "Pairs", "bill.item": "Item", "bill.brand": "Brand", "bill.colour": "Colour", "bill.rate": "Rate ₹", "bill.mrp": "Selling price ₹", "bill.optional": "optional",
      "bill.match": "In stock as", "bill.new": "New item", "bill.pick": "Pick the item…", "bill.remove": "Remove row", "bill.addRow": "+ Add a row",
      "bill.total": "Total", "bill.pairs": "{n} pairs",
      "bill.approveIn": "Approve · add {n} pairs", "bill.approveOut": "Approve · {n} pairs sold",
      "bill.nothingYet": "Nothing changes in stock until you approve.",
      "bill.dupe": "This photo was already entered on {date}.", "bill.force": "It is a new delivery, enter it",
      "bill.needItem": "Pick an item for every row, or remove the row.", "bill.needName": "Give every new item a name.",
      "bill.savedIn": "{n} pairs added", "bill.savedOut": "{n} pairs sold", "bill.short": "{n} more than the book had",
      "bill.undo": "Undo", "bill.undone": "Undone. Stock is back as it was.", "bill.next": "Next bill", "bill.home": "Home",
      "bill.photoLink": "Photo", "bill.statusUndone": "undone", "bill.notSetUp": "AI is not set up yet. Admin → Insights · AI provider.",
      "stock.title": "Stock", "dash.title": "Hisaab", "ask.title": "Ask about the stock · AI",
      "sheet.out": "Sold −1", "sheet.in": "In +1", "sheet.count": "Count", "sheet.inStock": "In stock",
    },
    hi: {
      "nav.home": "होम", "nav.bill": "बिल", "nav.stock": "स्टॉक", "nav.dash": "हिसाब", "nav.more": "और",
      "nav.scan": "स्कैन", "nav.add": "जोड़ें", "nav.labels": "लेबल", "nav.admin": "एडमिन",
      "top.sub": "स्टॉक रूम", "top.out": "बाहर", "net.live": "चालू", "net.off": "ऑफ़लाइन",
      "home.pairs": "स्टॉक में जोड़े", "home.articles": "{n} आर्टिकल", "home.value": "माल की कीमत", "home.atCost": "खरीद के भाव पर",
      "home.in": "माल आया", "home.inSub": "चालान की फोटो · स्टॉक में",
      "home.out": "माल बिका", "home.outSub": "बिल की फोटो या एक्सेल · स्टॉक से बाहर",
      "home.ask": "सुझाव · फ़ैसला आपका", "home.none": "अभी कुछ तय करना नहीं है।", "home.today": "आज",
      "home.noBills": "आज अभी कोई बिल नहीं।", "home.toOrder": "मँगवाना है",
      "sug.reorder": "{name} सिर्फ़ {qty} बचे। 30 दिन में {sold} बिके। {sq} और मँगवाएँ?",
      "sug.sale": "{name}: {qty} पीस, {days} दिन से कुछ नहीं बिका। {value} फँसे हैं। सेल में डालें?",
      "sug.count": "{name}: खाते में {qty} हैं। एक बार गिन लें।",
      "sug.approve": "हाँ, मंज़ूर", "sug.notNow": "अभी नहीं", "sug.enterCount": "गिनती डालें", "sug.done": "नोट किया",
      "bill.title": "बिल", "bill.in": "माल आया", "bill.out": "माल बिका",
      "bill.photo": "फोटो लें", "bill.gallery": "फोटो चुनें", "bill.excel": "बिक्री की एक्सेल/CSV",
      "bill.hintIn": "पूरा चालान फोटो में आए। हर पेज की एक फोटो।",
      "bill.hintOut": "बिक्री बिल की फोटो, या item और qty वाली एक्सेल/CSV।",
      "bill.reading": "बिल पढ़ रहे हैं…", "bill.offline": "बिल पढ़ने के लिए इंटरनेट चाहिए। नेट आने पर फिर करें।",
      "bill.recent": "पिछले बिल", "bill.noRecent": "अभी कोई बिल नहीं।",
      "bill.check": "जाँचें और मंज़ूर करें", "bill.retake": "← फिर से", "bill.supplier": "पार्टी", "bill.date": "तारीख़", "bill.no": "बिल नं.",
      "bill.rows": "AI ने {n} लाइन पढ़ीं।", "bill.row1": "AI ने 1 लाइन पढ़ी।", "bill.allOk": "जोड़ बिल से मिलता है।", "bill.written": "लिखा है",
      "bill.qty": "जोड़े", "bill.item": "माल", "bill.brand": "ब्रांड", "bill.colour": "रंग", "bill.rate": "भाव ₹", "bill.mrp": "बेचने का भाव ₹", "bill.optional": "ज़रूरी नहीं",
      "bill.match": "स्टॉक में", "bill.new": "नया माल", "bill.pick": "माल चुनें…", "bill.remove": "लाइन हटाएँ", "bill.addRow": "+ लाइन जोड़ें",
      "bill.total": "कुल", "bill.pairs": "{n} जोड़े",
      "bill.approveIn": "मंज़ूर · {n} जोड़े जोड़ें", "bill.approveOut": "मंज़ूर · {n} जोड़े बिके",
      "bill.nothingYet": "मंज़ूर करने तक स्टॉक में कुछ नहीं बदलेगा।",
      "bill.dupe": "यह फोटो {date} को पहले ही डल चुकी है।", "bill.force": "यह नया माल है, फिर भी डालें",
      "bill.needItem": "हर लाइन का माल चुनें, या लाइन हटाएँ।", "bill.needName": "हर नए माल का नाम लिखें।",
      "bill.savedIn": "{n} जोड़े जुड़ गए", "bill.savedOut": "{n} जोड़े बिके", "bill.short": "खाते से {n} ज़्यादा",
      "bill.undo": "वापस लें", "bill.undone": "वापस ले लिया। स्टॉक पहले जैसा है।", "bill.next": "अगला बिल", "bill.home": "होम",
      "bill.photoLink": "फोटो", "bill.statusUndone": "वापस", "bill.notSetUp": "AI अभी चालू नहीं है। एडमिन → Insights · AI provider।",
      "stock.title": "स्टॉक", "dash.title": "हिसाब", "ask.title": "स्टॉक के बारे में पूछें · AI",
      "sheet.out": "बिका −1", "sheet.in": "आया +1", "sheet.count": "गिनती", "sheet.inStock": "स्टॉक में",
    },
  };
  let lang = "en";
  try { lang = localStorage.getItem("sr.lang") === "hi" ? "hi" : "en"; } catch {}
  function t(key, vars) {
    const s = (W[lang] && W[lang][key]) || W.en[key] || key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k]))) : s;
  }
  function apply(root) {
    const r = root || document;
    r.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    r.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.documentElement.lang = lang;
  }
  function set(l) {
    lang = l === "hi" ? "hi" : "en";
    try { localStorage.setItem("sr.lang", lang); } catch {}
    apply();
  }
  window.I18N = { t, apply, set, get lang() { return lang; } };
})();
