/* GoBag engine - 72-hour emergency kit building with expiry tracking. */
const GoBagEngine = (() => {
  'use strict';

  const DAY_MS = 86400000;

  // perPerson quantities aim at a 72-hour supply. expiryDays null = does not expire.
  const ITEMS = [
    { id: 'water',    name: 'Water',                    cat: 'Water & food', perPersonQty: 12, unit: 'liters',  expiryDays: 365 },
    { id: 'food',     name: 'Non-perishable food',      cat: 'Water & food', perPersonQty: 9,  unit: 'servings', expiryDays: 730 },
    { id: 'petfood',  name: 'Pet food',                 cat: 'Water & food', perPetQty: 9,     unit: 'servings', expiryDays: 365, needsPets: true },
    { id: 'batteries',name: 'Batteries (AA)',           cat: 'Power & light', perPersonQty: 4, unit: 'pcs',     expiryDays: 1825 },
    { id: 'flashlight', name: 'Flashlight',             cat: 'Power & light', perPersonQty: 1, unit: 'pcs',     expiryDays: null },
    { id: 'powerbank', name: 'Power bank (10k mAh)',    cat: 'Power & light', perPersonQty: 1, unit: 'pcs',     expiryDays: null },
    { id: 'medkit',   name: 'First-aid kit',            cat: 'Health',       perPersonQty: 0.5, unit: 'kits',   expiryDays: 1095 },
    { id: 'meds',     name: 'Prescription meds buffer', cat: 'Health',       perPersonQty: 7,  unit: 'days',    expiryDays: 180 },
    { id: 'hygiene',  name: 'Hygiene kit',              cat: 'Health',       perPersonQty: 1,  unit: 'kits',    expiryDays: null },
    { id: 'docs',     name: 'Document copies (sealed)', cat: 'Documents',    perPersonQty: 1,  unit: 'sets',    expiryDays: null },
    { id: 'cash',     name: 'Cash (small bills)',       cat: 'Documents',    perPersonQty: 50, unit: 'USD',     expiryDays: null },
    { id: 'radio',    name: 'Battery/crank radio',      cat: 'Comms',        perPersonQty: 0.5, unit: 'pcs',   expiryDays: null },
    { id: 'whistle',  name: 'Whistle',                  cat: 'Comms',        perPersonQty: 1,  unit: 'pcs',     expiryDays: null },
    { id: 'blanket',  name: 'Emergency blanket',        cat: 'Warmth',       perPersonQty: 1,  unit: 'pcs',     expiryDays: null },
    { id: 'charger',  name: 'Car charger cable',        cat: 'Comms',        perPersonQty: 1,  unit: 'pcs',     expiryDays: null }
  ];

  function parseDay(s) {
    if (typeof s !== 'string') throw new Error('date must be a string');
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new Error('bad date format, want YYYY-MM-DD');
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error('date out of range');
    const ms = Date.UTC(y, mo - 1, d);
    const dt = new Date(ms);
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new Error('impossible date');
    return Math.floor(ms / DAY_MS);
  }

  function fmtDay(dayNum) {
    const dt = new Date(dayNum * DAY_MS);
    return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
  }

  function normHousehold(h) {
    const num = (v, label, max) => {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(label + ' must be 0-' + max);
      return n;
    };
    const hh = { people: num(h.people, 'people', 20), pets: num(h.pets || 0, 'pets', 20) };
    if (hh.people < 1) throw new Error('at least one person');
    return hh;
  }

  // Needed quantity of a library item for a household (rounds up for discrete items).
  function needFor(item, hh) {
    if (item.needsPets) return (item.perPetQty || 0) * hh.pets;
    const raw = item.perPersonQty * hh.people;
    return item.perPersonQty < 1 ? Math.ceil(raw) : Math.ceil(raw * 100) / 100;
  }

  function expiryDay(purchaseDayNum, expiryDays) {
    if (expiryDays === null || expiryDays === undefined) return null;
    return purchaseDayNum + expiryDays;
  }

  /*
   * statusFor({need, haveQty, purchaseDayNum, expiryDays}, today)
   * states: missing (have 0) | low (have < need) | expired | expiring (<=30d) | ok
   * expired/expiring only apply when have > 0 and the item expires.
   */
  function statusFor(entry, today) {
    const have = Number(entry.haveQty) || 0;
    const need = Number(entry.need) || 0;
    if (have <= 0) return { state: need > 0 ? 'missing' : 'ok', haveQty: have, need: need, daysLeft: null };
    const base = { haveQty: have, need: need, daysLeft: null };
    if (entry.expiryDays !== null && entry.expiryDays !== undefined && entry.purchaseDayNum !== null && entry.purchaseDayNum !== undefined) {
      const left = entry.purchaseDayNum + entry.expiryDays - today;
      base.daysLeft = left;
      if (left < 0) { base.state = 'expired'; return base; }
      if (left <= 30) { base.state = 'expiring'; return base; }
    }
    base.state = have < need ? 'low' : 'ok';
    return base;
  }

  // readiness: fraction of need covered across all entries (capped per item), 0-1.
  function readiness(entries, today) {
    let got = 0, want = 0;
    entries.forEach(e => {
      const st = statusFor(e, today);
      want += st.need;
      got += Math.min(st.haveQty, st.need) * (st.state === 'expired' ? 0 : 1);
    });
    return want > 0 ? got / want : 0;
  }

  function report(entries, today) {
    const rows = entries.map(e => Object.assign({ name: e.name, unit: e.unit, cat: e.cat }, statusFor(e, today)));
    return {
      rows: rows,
      missing: rows.filter(r => r.state === 'missing'),
      low: rows.filter(r => r.state === 'low'),
      expiring: rows.filter(r => r.state === 'expiring' || r.state === 'expired'),
      okCount: rows.filter(r => r.state === 'ok').length,
      readiness: readiness(entries, today)
    };
  }

  return { ITEMS, parseDay, fmtDay, normHousehold, needFor, expiryDay, statusFor, readiness, report };
})();
if (typeof module !== 'undefined') module.exports = GoBagEngine;
