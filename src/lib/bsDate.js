// NEW — Bikram Sambat (बि.सं.) calendar support, used for entering and
// matching students' जन्म मिति (date of birth). Everything is still
// stored internally as the same plain AD (Gregorian) ISO string the rest
// of the app already uses (`dob`, "YYYY-MM-DD") — nothing about the data
// model changed. This module only adds: (1) a BS year/month/day picker
// that converts what the teacher picks into that same AD string, (2) a
// BS-formatted display string for the roster table, and (3) BS-based
// birthday matching, so a student's birthday is recognised on the
// correct बि.सं. anniversary each year rather than a fixed AD month/day
// (the two can differ by a day in either direction depending on how BS
// month lengths fall that year — this is the whole reason to convert via
// BS at all rather than just relabelling an AD date picker).
import NepaliDate, { dateConfigMap } from "nepali-date-converter";

export const BS_MONTHS_NP=["बैशाख","जेठ","असार","साउन","भदौ","असोज","कार्तिक","मंसिर","पुष","माघ","फागुन","चैत"];
// dateConfigMap's own month keys (English), same order as BS_MONTHS_NP —
// used only to look up how many days a given BS month has in a given
// year, not shown to the user.
const CONFIG_MONTH_KEYS=["Baisakh","Jestha","Asar","Shrawan","Bhadra","Aswin","Kartik","Mangsir","Poush","Magh","Falgun","Chaitra"];
const NP_DIGITS=["०","१","२","३","४","५","६","७","८","९"];
export const toNpDigits=(n)=>String(n).split("").map((c)=>NP_DIGITS[c]||c).join("");

// The library ships exact calendar data for BS 2000–2090 (roughly AD
// 1943–2034) — comfortably covers any currently-enrolled student and
// then some. Used both to build the वर्ष dropdown and to validate/cap the
// गते dropdown for whichever महिना is selected.
const BS_YEARS=Object.keys(dateConfigMap).map(Number).sort((a,b)=>a-b);
export const BS_YEAR_MIN=BS_YEARS[0];
export const BS_YEAR_MAX=BS_YEARS[BS_YEARS.length-1];

// How many days are in a given BS year+month (monthIdx: 0=बैशाख..11=चैत).
// Falls back to 30 for a year outside the known table rather than
// throwing, since a dropdown should never hard-fail on an edge value.
export function daysInBsMonth(year,monthIdx){
  const row=dateConfigMap[String(year)];
  if(!row)return 30;
  return row[CONFIG_MONTH_KEYS[monthIdx]]||30;
}

// AD ISO string ("YYYY-MM-DD") -> {year,month,date} in BS, or null if the
// input isn't a parseable/convertible date (e.g. empty, or outside the
// library's known BS range).
export function adToBs(adIso){
  if(!adIso)return null;
  try{
    const d=new Date(adIso+"T00:00:00");
    if(isNaN(d.getTime()))return null;
    const nd=new NepaliDate(d);
    const bs=nd.getBS();
    return {year:bs.year,month:bs.month,date:bs.date};
  }catch{return null;}
}

// BS {year,month(0-based),date} -> AD ISO string ("YYYY-MM-DD"), or null
// if out of the library's supported range.
export function bsToAdIso(year,monthIdx,date){
  try{
    const nd=new NepaliDate(year,monthIdx,date);
    const ad=nd.getAD();
    const mm=String(ad.month+1).padStart(2,"0"),dd=String(ad.date).padStart(2,"0");
    return `${ad.year}-${mm}-${dd}`;
  }catch{return null;}
}

// Human-readable BS display string for the roster table, e.g. "१२ भदौ २०७८".
export function formatBs(adIso){
  const bs=adToBs(adIso);
  if(!bs)return"";
  return `${toNpDigits(bs.date)} ${BS_MONTHS_NP[bs.month]} ${toNpDigits(bs.year)}`;
}

// Is today the BS anniversary of this AD-stored dob? Converts both today
// and the stored dob to BS and compares month+date only (year is
// irrelevant for a recurring birthday). This is the one place BS
// matching actually differs from the app's previous AD-month-day check.
export function isBsBirthdayToday(dobAdIso){
  const dobBs=adToBs(dobAdIso);
  if(!dobBs)return false;
  const todayBs=adToBs(new Date().toISOString().slice(0,10));
  if(!todayBs)return false;
  return dobBs.month===todayBs.month&&dobBs.date===todayBs.date;
}
