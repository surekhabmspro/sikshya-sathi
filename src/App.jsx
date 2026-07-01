import React, { useState, useMemo } from "react";
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, ChevronLeft, Sparkles, FileText, Users, MessageSquare, PenSquare, Layers, Clock, X, Home, NotebookPen, Search, Image as ImageIcon, Video, Music, FileSpreadsheet, Presentation, Tag, Eye, HelpCircle, CheckSquare, Square, Printer, Shuffle, Bot, Send, Lock, ListChecks, Plus, Smile, Meh, Frown, Heart, Gamepad2, FolderKanban, Map as MapIcon, Wand2, Brain, Copy, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Sample data — stands in for what would come from the cloud database.
// Class 5 Social Studies, Nepal curriculum-flavoured.
// ---------------------------------------------------------------------------

const CHAPTERS = [
  { id: "c1", title: "हाम्रो देश नेपाल", progress: 100 },
  { id: "c2", title: "नक्सा र दिशा", progress: 100 },
  { id: "c3", title: "हाम्रो स्थानीय सरकार", progress: 60 },
  { id: "c4", title: "प्राकृतिक स्रोतसाधन", progress: 0 },
  { id: "c5", title: "संस्कृति र चाडपर्व", progress: 0 },
];

const LESSONS = [
  {
    id: "L14",
    chapter: "हाम्रो स्थानीय सरकार",
    title: "वडा कार्यालयको भूमिका",
    date: "आज · पिरियड ३",
    status: "ready",
    objectives: [
      "वडा कार्यालयले दिने मुख्य सेवाहरू पहिचान गर्ने",
      "स्थानीय सरकार समुदायका लागि किन महत्त्वपूर्ण छ भन्ने व्याख्या गर्ने",
      "वडा अध्यक्षका दुई जिम्मेवारी सूचीकरण गर्ने",
    ],
    vocabulary: ["वडा", "अध्यक्ष", "नगरपालिका", "नागरिक कर्तव्य"],
    sequence: [
      "स्मरण: विद्यार्थीका अभिभावक वडा कार्यालय किन गएका थिए भनी सोध्ने",
      "संरचना बुझाउने: नगरपालिका → वडा → वडा कार्यालय",
      "शिक्षक निर्देशिकाबाट वडा सेवाहरूको चित्र देखाउने",
      "समूह कार्य: वडा कार्यालयले समाधान गर्न सक्ने ३ समस्या सूचीकरण",
      "समापन: छिटो मौखिक चक्र, एक-एक सेवा",
    ],
    keyQuestions: [
      "हाम्रो घरनजिक स्थानीय सरकारको कार्यालय किन आवश्यक छ?",
      "वडा कार्यालय र विद्यालय कार्यालयमा के फरक छ?",
      "वडा कार्यालयबाट पाइने एक कागजातको नाम भन्नुहोस्।",
    ],
    activities: [
      "भूमिका अभिनय: जन्मदर्ता प्रमाणपत्रका लागि वडा कार्यालय जाने परिवार",
      "नक्सा अभ्यास: नगरपालिकाको नक्सामा आफ्नो वडा पहिचान गर्ने",
    ],
    homework: "परिवारको कुनै सदस्यलाई वडा कार्यालयबाट लिएको एक सेवाबारे सोध्नुहोस् र ३ वाक्य लेख्नुहोस्।",
    rubric: [
      { level: "उत्कृष्ट", desc: "३ वा बढी सेवा नाम दिन्छ, उद्देश्य स्पष्ट व्याख्या गर्छ" },
      { level: "राम्रो", desc: "२ सेवा नाम दिन्छ, केही व्याख्या गर्छ" },
      { level: "सहयोग आवश्यक", desc: "१ सेवा मात्र, निर्देशित प्रश्न आवश्यक" },
    ],
    notes: "गत वर्ष विद्यार्थीहरूले 'वडा' लाई 'कक्षा' सँग भ्रमित गरेका थिए — चित्रबाट सुरुमै स्पष्ट पार्ने।",
    materials: ["शिक्षक निर्देशिका पृ.४२–४५", "वडा कार्यालय चित्र.pptx", "कार्यपत्र १४.pdf"],
  },
  {
    id: "L15",
    chapter: "हाम्रो स्थानीय सरकार",
    title: "नगरपालिकाका सेवाहरू",
    date: "भोलि · पिरियड २",
    status: "prep",
    objectives: ["नगरपालिका र वडाका जिम्मेवारी तुलना गर्ने"],
    vocabulary: ["नगरपालिका", "मेयर", "बजेट"],
    sequence: ["अघिल्लो पाठको पुनरावलोकन", "नगरपालिकाको संरचना परिचय", "छलफल"],
    keyQuestions: ["मेयरले के काम गर्छन्?"],
    activities: ["समूह तालिका: वडा बनाम नगरपालिका"],
    homework: "संरचना कोर्नुहोस्: नगरपालिका → वडा → घर",
    rubric: [],
    notes: "",
    materials: ["शिक्षक निर्देशिका पृ.४६"],
  },
  {
    id: "L16",
    chapter: "प्राकृतिक स्रोतसाधन",
    title: "प्राकृतिक स्रोतका प्रकार",
    date: "बिहीबार · पिरियड १",
    status: "missing",
    objectives: [],
    vocabulary: [],
    sequence: [],
    keyQuestions: [],
    activities: [],
    homework: "",
    rubric: [],
    notes: "",
    materials: [],
  },
];

const HOMEWORK_PENDING = [
  { id: "h1", title: "वडा कार्यालय वाक्य लेखन", chapter: "हाम्रो स्थानीय सरकार", count: 28 },
  { id: "h2", title: "दिशा नक्सा कार्यपत्र", chapter: "नक्सा र दिशा", count: 6 },
];

const ASSESSMENTS_PENDING = [
  { id: "a1", title: "मौखिक जाँच — स्थानीय सरकार शब्दावली", due: "यो हप्ता" },
];

const RECENT_MATERIALS = [
  { id: "m1", name: "वडा कार्यालय चित्र.pptx", type: "pptx" },
  { id: "m2", name: "कार्यपत्र १४.pdf", type: "pdf" },
  { id: "m3", name: "शिक्षक निर्देशिका — अध्याय ३.pdf", type: "pdf" },
];

const MATERIALS = [
  {
    id: "f1",
    name: "वडा कार्यालय चित्र.pptx",
    type: "pptx",
    chapter: "हाम्रो स्थानीय सरकार",
    tags: ["वडा", "संरचना"],
    size: "4.2 MB",
    date: "२ दिन अगाडि",
  },
  {
    id: "f2",
    name: "कार्यपत्र १४.pdf",
    type: "pdf",
    chapter: "हाम्रो स्थानीय सरकार",
    tags: ["कार्यपत्र", "अभ्यास"],
    size: "820 KB",
    date: "२ दिन अगाडि",
  },
  {
    id: "f3",
    name: "शिक्षक निर्देशिका — अध्याय ३.pdf",
    type: "pdf",
    chapter: "हाम्रो स्थानीय सरकार",
    tags: ["निर्देशिका"],
    size: "11 MB",
    date: "१ हप्ता अगाडि",
  },
  {
    id: "f4",
    name: "नेपालको नक्सा.jpg",
    type: "image",
    chapter: "नक्सा र दिशा",
    tags: ["नक्सा", "दिशा"],
    size: "1.1 MB",
    date: "३ हप्ता अगाडि",
  },
  {
    id: "f5",
    name: "दिशा पहिचान गीत.mp3",
    type: "audio",
    chapter: "नक्सा र दिशा",
    tags: ["गीत", "स्मरण"],
    size: "3.4 MB",
    date: "३ हप्ता अगाडि",
  },
  {
    id: "f6",
    name: "नगरपालिका भ्रमण.mp4",
    type: "video",
    chapter: "हाम्रो स्थानीय सरकार",
    tags: ["भ्रमण", "वास्तविक उदाहरण"],
    size: "48 MB",
    date: "१ महिना अगाडि",
  },
  {
    id: "f7",
    name: "पाठ योजना — वार्षिक.docx",
    type: "doc",
    chapter: "सबै अध्याय",
    tags: ["वार्षिक योजना"],
    size: "210 KB",
    date: "२ महिना अगाडि",
  },
  {
    id: "f8",
    name: "जलस्रोत सूची.xlsx",
    type: "sheet",
    chapter: "प्राकृतिक स्रोतसाधन",
    tags: ["स्रोतसाधन", "तथ्याङ्क"],
    size: "95 KB",
    date: "२ महिना अगाडि",
  },
];

const QUESTIONS = [
  {
    id: "q1",
    chapter: "हाम्रो स्थानीय सरकार",
    type: "छोटो उत्तर",
    difficulty: "सजिलो",
    bloom: "सम्झना",
    text: "वडा कार्यालयले दिने दुई सेवाहरू लेख्नुहोस्।",
  },
  {
    id: "q2",
    chapter: "हाम्रो स्थानीय सरकार",
    type: "बहुविकल्पीय",
    difficulty: "सजिलो",
    bloom: "बुझाई",
    text: "वडाको प्रमुखलाई के भनिन्छ?",
    options: ["मेयर", "वडा अध्यक्ष", "प्रधानमन्त्री", "शिक्षक"],
    answer: 1,
  },
  {
    id: "q3",
    chapter: "हाम्रो स्थानीय सरकार",
    type: "विश्लेषणात्मक सोच",
    difficulty: "कठिन",
    bloom: "विश्लेषण",
    text: "यदि तपाईंको वडामा खानेपानीको समस्या छ भने तपाईं के गर्नुहुन्छ र किन?",
  },
  {
    id: "q4",
    chapter: "नक्सा र दिशा",
    type: "नक्सा आधारित",
    difficulty: "मध्यम",
    bloom: "प्रयोग",
    text: "नक्सामा देखाइएको प्रतीक हेरी उत्तर दिनुहोस्: यो चिन्हले के जनाउँछ?",
  },
  {
    id: "q5",
    chapter: "नक्सा र दिशा",
    type: "मिलान",
    difficulty: "सजिलो",
    bloom: "सम्झना",
    text: "दिशाहरूलाई तिनका प्रतीकसँग मिलान गर्नुहोस्: पूर्व, पश्चिम, उत्तर, दक्षिण।",
  },
  {
    id: "q6",
    chapter: "प्राकृतिक स्रोतसाधन",
    type: "सत्य/असत्य",
    difficulty: "सजिलो",
    bloom: "सम्झना",
    text: "पानी एक नवीकरणीय स्रोत हो। (सत्य/असत्य)",
  },
  {
    id: "q7",
    chapter: "प्राकृतिक स्रोतसाधन",
    type: "परिदृश्य आधारित",
    difficulty: "मध्यम",
    bloom: "मूल्याङ्कन",
    text: "एक गाउँमा जंगल विनाश भइरहेको छ। यसले समुदायलाई कसरी असर गर्छ? दुई असर लेख्नुहोस्।",
  },
  {
    id: "q8",
    chapter: "हाम्रो देश नेपाल",
    type: "खाली ठाउँ भर्नुहोस्",
    difficulty: "सजिलो",
    bloom: "सम्झना",
    text: "नेपालको राष्ट्रिय फूल ______ हो।",
  },
];

const HOMEWORK_RECORDS = [
  {
    id: "hw1",
    title: "वडा कार्यालय वाक्य लेखन",
    chapter: "हाम्रो स्थानीय सरकार",
    lesson: "वडा कार्यालयको भूमिका",
    assignedDate: "२ दिन अगाडि",
    total: 32,
    checked: 4,
    remark: "धेरैले सेवा नाम मात्र लेखे, वाक्य पूरा नभएको — भोलि एक उदाहरण देखाउने।",
  },
  {
    id: "hw2",
    title: "दिशा नक्सा कार्यपत्र",
    chapter: "नक्सा र दिशा",
    lesson: "नक्सा र प्रतीकहरू",
    assignedDate: "१ हप्ता अगाडि",
    total: 32,
    checked: 26,
    remark: "उत्तर-दक्षिण दिशामा केही विद्यार्थी अझै अलमलमा छन्।",
  },
  {
    id: "hw3",
    title: "नेपालको चिनारी पोस्टर",
    chapter: "हाम्रो देश नेपाल",
    lesson: "हाम्रो देशको चिनारी",
    assignedDate: "३ हप्ता अगाडि",
    total: 32,
    checked: 32,
    remark: "सबैले राम्रोसँग पूरा गरे।",
  },
];

const JOURNAL_ENTRIES = [
  {
    id: "j1",
    date: "हिजो",
    lesson: "नगरपालिकाका सेवाहरू",
    chapter: "हाम्रो स्थानीय सरकार",
    mood: "good",
    taught: "नगरपालिका र वडाको संरचना तुलना गरियो, समूह तालिका बनाइयो।",
    difficulty: "केही विद्यार्थीले मेयर र वडा अध्यक्षको भूमिका बिर्सिए।",
    idea: "भोलि दुई भूमिकाको तुलना तालिका फेरि देखाउने।",
  },
  {
    id: "j2",
    date: "२ दिन अगाडि",
    lesson: "वडा कार्यालयको भूमिका",
    chapter: "हाम्रो स्थानीय सरकार",
    mood: "okay",
    taught: "वडा कार्यालयका सेवाहरू र भूमिका परिचय गरियो, भूमिका अभिनय गरियो।",
    difficulty: "समय कम भएर सबै समूहले प्रस्तुत गर्न पाएनन्।",
    idea: "अर्को वर्ष यो पाठलाई २ पिरियडमा विभाजन गर्ने।",
  },
];

const ACTIVITY_TYPE_META = {
  game: { label: "खेल", icon: Gamepad2, color: "#1B7A4A" },
  roleplay: { label: "भूमिका अभिनय", icon: Users, color: "#9A5B12" },
  project: { label: "प्रोजेक्ट", icon: FolderKanban, color: "#6B3FA0" },
  map: { label: "नक्सा क्रियाकलाप", icon: MapIcon, color: "#2C5F9E" },
  debate: { label: "बहस", icon: MessageSquare, color: "#A23C2A" },
  presentation: { label: "प्रस्तुतीकरण", icon: Presentation, color: "#1F4D3D" },
};

const ACTIVITIES = [
  {
    id: "act1",
    title: "वडा कार्यालय भूमिका अभिनय",
    type: "roleplay",
    chapter: "हाम्रो स्थानीय सरकार",
    competency: "नागरिक चेतना",
    duration: "१५ मिनेट",
    desc: "विद्यार्थीहरूले परिवार र वडा कर्मचारीको भूमिका निर्वाह गरी सेवा लिने प्रक्रिया अभिनय गर्छन्।",
  },
  {
    id: "act2",
    title: "दिशा पहिचान खेल",
    type: "game",
    chapter: "नक्सा र दिशा",
    competency: "स्थानिक सोच",
    duration: "१० मिनेट",
    desc: "कक्षाकोठामा चार कुनामा पूर्व-पश्चिम-उत्तर-दक्षिण राखी शिक्षकले भनेको दिशामा दौडने खेल।",
  },
  {
    id: "act3",
    title: "हाम्रो वडा नक्सा बनाउने",
    type: "map",
    chapter: "नक्सा र दिशा",
    competency: "नक्सा सीप",
    duration: "२५ मिनेट",
    desc: "समूहमा विद्यार्थीले आफ्नो वडाको सरल नक्सा कोर्छन् र महत्त्वपूर्ण स्थानहरू चिनाउँछन्।",
  },
  {
    id: "act4",
    title: "प्राकृतिक स्रोत संरक्षण प्रोजेक्ट",
    type: "project",
    chapter: "प्राकृतिक स्रोतसाधन",
    competency: "जिम्मेवार नागरिकता",
    duration: "१ हप्ता (घर कार्य)",
    desc: "समूहमा एक स्रोत छानेर त्यो कसरी जोगाउने भन्ने पोस्टर वा छोटो प्रस्तुति तयार पार्ने।",
  },
  {
    id: "act5",
    title: "नगरपालिका बनाम वडा बहस",
    type: "debate",
    chapter: "हाम्रो स्थानीय सरकार",
    competency: "तार्किक सोच",
    duration: "२० मिनेट",
    desc: "दुई समूहमा बाँडेर कुन तहको सरकार बढी महत्त्वपूर्ण भन्ने सानो बहस गराउने।",
  },
];

const RESOURCE_TEMPLATES = [
  {
    id: "r1",
    title: "कार्यपत्र",
    desc: "अभ्यास प्रश्नसहितको कार्यपत्र तयार पार्नुहोस्",
    icon: FileText,
    sample: "१. वडा कार्यालयले दिने तीन सेवा लेख्नुहोस्।\n२. खाली ठाउँ भर्नुहोस्: नगरपालिकाको प्रमुखलाई ______ भनिन्छ।\n३. चित्र हेरी वडा कार्यालयको काम लेख्नुहोस्।",
  },
  {
    id: "r2",
    title: "पुनरावलोकन पाना",
    desc: "परीक्षा अघि छिटो दोहोऱ्याउनका लागि सारांश पाना",
    icon: ClipboardList,
    sample: "मुख्य बुँदाहरू:\n• नगरपालिका → वडा → घर\n• वडा अध्यक्ष = वडाको प्रमुख\n• मेयर = नगरपालिकाको प्रमुख",
  },
  {
    id: "r3",
    title: "फ्ल्यासकार्ड",
    desc: "शब्दावली सम्झनका लागि छोटो कार्डहरू",
    icon: Copy,
    sample: "[अगाडि] वडा   [पछाडि] सानो प्रशासनिक एकाइ\n[अगाडि] मेयर   [पछाडि] नगरपालिकाको प्रमुख",
  },
  {
    id: "r4",
    title: "अवधारणा नक्सा",
    desc: "विचारहरूबीचको सम्बन्ध देखाउने चित्र",
    icon: Brain,
    sample: "स्थानीय सरकार\n   ├── नगरपालिका → मेयर\n   └── वडा → वडा अध्यक्ष",
  },
  {
    id: "r5",
    title: "शब्दावली सूची",
    desc: "अध्यायका मुख्य शब्द र अर्थ",
    icon: Tag,
    sample: "वडा — सानो प्रशासनिक एकाइ\nनगरपालिका — स्थानीय सरकारको ठूलो एकाइ\nनागरिक कर्तव्य — नागरिकको जिम्मेवारी",
  },
  {
    id: "r6",
    title: "अभ्यास प्रश्नहरू",
    desc: "थप अभ्यासका लागि छोटो प्रश्न सेट",
    icon: PenSquare,
    sample: "१. वडा कार्यालय कहाँ अवस्थित छ?\n२. वडा अध्यक्षको एक जिम्मेवारी लेख्नुहोस्।",
  },
];

const CALENDAR_ITEMS = [
  { id: "cal1", date: "आज", type: "lesson", title: "वडा कार्यालयको भूमिका", chapter: "हाम्रो स्थानीय सरकार" },
  { id: "cal2", date: "आज", type: "homework", title: "वडा कार्यालय वाक्य लेखन जाँच गर्ने", chapter: "हाम्रो स्थानीय सरकार" },
  { id: "cal3", date: "भोलि", type: "lesson", title: "नगरपालिकाका सेवाहरू", chapter: "हाम्रो स्थानीय सरकार" },
  { id: "cal4", date: "बिहीबार", type: "lesson", title: "प्राकृतिक स्रोतका प्रकार", chapter: "प्राकृतिक स्रोतसाधन" },
  { id: "cal5", date: "यो हप्ता", type: "assessment", title: "मौखिक जाँच — स्थानीय सरकार शब्दावली", chapter: "हाम्रो स्थानीय सरकार" },
  { id: "cal6", date: "अर्को हप्ता", type: "chapter", title: "प्राकृतिक स्रोतसाधन सुरु हुने", chapter: "प्राकृतिक स्रोतसाधन" },
];

const CALENDAR_TYPE_META = {
  lesson: { label: "पाठ", color: "#1F4D3D", bg: "#E4EFE6" },
  homework: { label: "गृहकार्य", color: "#9A5B12", bg: "#FBEBD3" },
  assessment: { label: "मूल्याङ्कन", color: "#A23C2A", bg: "#F6E1DC" },
  chapter: { label: "अध्याय", color: "#6B3FA0", bg: "#EDE3F7" },
};

const ASSESSMENT_TEMPLATES = [
  { id: "t1", title: "अवलोकन चेकलिस्ट", desc: "कक्षा गतिविधिमा विद्यार्थीको सहभागिता हेर्न", icon: ClipboardList },
  { id: "t2", title: "मौखिक परीक्षा प्रश्नावली", desc: "छनोट गरिएका प्रश्नबाट मौखिक जाँच तयार पार्न", icon: MessageSquare },
  { id: "t3", title: "व्यावहारिक मूल्याङ्कन पाना", desc: "क्रियाकलाप वा प्रोजेक्ट जाँच गर्न", icon: NotebookPen },
  { id: "t4", title: "छोटो लिखित मूल्याङ्कन", desc: "छनोट प्रश्नबाट छोटो परीक्षा तयार पार्न", icon: FileText },
];

const FILE_TYPE_META = {
  pdf: { icon: FileText, color: "#A23C2A" },
  pptx: { icon: Presentation, color: "#D98E2B" },
  doc: { icon: FileText, color: "#2C5F9E" },
  image: { icon: ImageIcon, color: "#9A5B12" },
  video: { icon: Video, color: "#6B3FA0" },
  audio: { icon: Music, color: "#1F4D3D" },
  sheet: { icon: FileSpreadsheet, color: "#1B7A4A" },
};

// ---------------------------------------------------------------------------

const ACCENT = "#1F4D3D"; // chalkboard green
const MARIGOLD = "#D98E2B";
const PAPER = "#FBF7EE";
const INK = "#2A2723";

function StatusPill({ status }) {
  const map = {
    ready: { label: "तयार", bg: "#E4EFE6", color: ACCENT },
    prep: { label: "तयारी चाहिने", bg: "#FBEBD3", color: "#9A5B12" },
    missing: { label: "सुरु नभएको", bg: "#F6E1DC", color: "#A23C2A" },
  };
  const s = map[status] || map.prep;
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
        letterSpacing: 0.2,
      }}
    >
      {s.label}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "'Fraunces', serif",
        fontSize: 13,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#8A8275",
        marginBottom: 10,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, onClick, style }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: "1px solid #ECE6D8",
        borderRadius: 16,
        padding: 18,
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .15s, transform .15s",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.boxShadow = "0 6px 20px rgba(31,77,61,0.08)";
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One Click Lesson Mode — the signature screen.
// ---------------------------------------------------------------------------

function LessonMode({ lesson, onClose }) {
  const [tab, setTab] = useState("sequence");

  const tabs = [
    { id: "sequence", label: "पढाउने", icon: ClipboardList },
    { id: "questions", label: "मुख्य प्रश्नहरू", icon: MessageSquare },
    { id: "activities", label: "क्रियाकलाप", icon: Users },
    { id: "homework", label: "गृहकार्य", icon: PenSquare },
    { id: "rubric", label: "मूल्याङ्कन मापदण्ड", icon: Layers },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: PAPER,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: ACCENT,
          color: "#fff",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none",
            color: "#fff",
            borderRadius: 10,
            padding: 10,
            display: "flex",
            cursor: "pointer",
          }}
          aria-label="पाठ मोड बन्द गर्नुहोस्"
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 500 }}>{lesson.chapter}</div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 19,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {lesson.title}
          </div>
        </div>
        <Sparkles size={20} style={{ opacity: 0.8, flexShrink: 0 }} />
      </div>

      {/* Objectives + vocab strip */}
      <div style={{ padding: "14px 20px", background: "#fff", borderBottom: "1px solid #ECE6D8" }}>
        <div style={{ fontSize: 13, color: "#6B6557", marginBottom: 6, fontWeight: 600 }}>
          आजको उद्देश्य
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14.5, color: INK, lineHeight: 1.6 }}>
          {lesson.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
        {lesson.vocabulary.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {lesson.vocabulary.map((v) => (
              <span
                key={v}
                style={{
                  background: "#F4EFE3",
                  color: "#7A6F3E",
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 8,
                }}
              >
                {v}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          overflowX: "auto",
          background: "#fff",
          borderBottom: "1px solid #ECE6D8",
          padding: "0 8px",
        }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "13px 14px",
                border: "none",
                background: "none",
                borderBottom: active ? `3px solid ${ACCENT}` : "3px solid transparent",
                color: active ? ACCENT : "#8A8275",
                fontWeight: 600,
                fontSize: 13.5,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {tab === "sequence" && (
          <div>
            <SectionLabel>पढाउने क्रम</SectionLabel>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {lesson.sequence.map((s, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 14,
                    padding: "14px 0",
                    borderBottom: i < lesson.sequence.length - 1 ? "1px solid #ECE6D8" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#E4EFE6",
                      color: ACCENT,
                      fontWeight: 700,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 15, color: INK, lineHeight: 1.5, paddingTop: 3 }}>{s}</div>
                </li>
              ))}
            </ol>
            {lesson.notes && (
              <div style={{ marginTop: 18, background: "#FBEBD3", borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#9A5B12", marginBottom: 4 }}>
                  आफ्नो लागि टिप्पणी (गत वर्षबाट)
                </div>
                <div style={{ fontSize: 14, color: "#5E4622" }}>{lesson.notes}</div>
              </div>
            )}
            {lesson.materials.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <SectionLabel>सँगै खोल्नुहोस्</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {lesson.materials.map((m) => (
                    <div
                      key={m}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "#fff",
                        border: "1px solid #ECE6D8",
                        borderRadius: 10,
                        padding: "10px 12px",
                        fontSize: 14,
                        color: INK,
                      }}
                    >
                      <FileText size={16} color={MARIGOLD} />
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "questions" && (
          <div>
            <SectionLabel>कक्षामा सोध्नुहोस्</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lesson.keyQuestions.map((q, i) => (
                <Card key={i}>
                  <div style={{ fontSize: 15.5, color: INK }}>{q}</div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === "activities" && (
          <div>
            <SectionLabel>क्रियाकलापहरू</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lesson.activities.map((a, i) => (
                <Card key={i}>
                  <div style={{ fontSize: 15.5, color: INK }}>{a}</div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === "homework" && (
          <div>
            <SectionLabel>दिने गृहकार्य</SectionLabel>
            <Card>
              <div style={{ fontSize: 15.5, color: INK, lineHeight: 1.6 }}>{lesson.homework}</div>
            </Card>
          </div>
        )}

        {tab === "rubric" && (
          <div>
            <SectionLabel>छिटो मूल्याङ्कन मापदण्ड</SectionLabel>
            {lesson.rubric.length === 0 ? (
              <div style={{ color: "#8A8275", fontSize: 14 }}>यो पाठमा अहिलेसम्म मूल्याङ्कन मापदण्ड थपिएको छैन।</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lesson.rubric.map((r) => (
                  <Card key={r.level}>
                    <div style={{ fontWeight: 700, color: ACCENT, fontSize: 14, marginBottom: 4 }}>
                      {r.level}
                    </div>
                    <div style={{ fontSize: 14.5, color: INK }}>{r.desc}</div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ onOpenLesson, onGoPlanner, onGoHomework }) {
  const todayLesson = LESSONS[0];

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      {/* Hero: One Click Lesson Mode */}
      <div
        style={{
          background: `linear-gradient(135deg, ${ACCENT}, #143329)`,
          borderRadius: 20,
          padding: 24,
          color: "#fff",
          marginBottom: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 600, letterSpacing: 0.3 }}>
          {todayLesson.date}
        </div>
        <div
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 26,
            fontWeight: 600,
            margin: "6px 0 4px",
          }}
        >
          {todayLesson.title}
        </div>
        <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 18 }}>{todayLesson.chapter}</div>
        <button
          onClick={() => onOpenLesson(todayLesson)}
          style={{
            background: MARIGOLD,
            color: "#2A1E07",
            border: "none",
            borderRadius: 14,
            padding: "14px 22px",
            fontSize: 16,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
          }}
        >
          <Sparkles size={19} />
          आजको पाठ सुरु गर्नुहोस्
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {/* Pending preparations */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <ClipboardList size={18} color={ACCENT} />
            <div style={{ fontWeight: 700, color: INK, fontSize: 15 }}>तयारी चाहिने</div>
          </div>
          {LESSONS.filter((l) => l.status !== "ready").map((l) => (
            <div
              key={l.id}
              onClick={() => onGoPlanner()}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "9px 0",
                borderTop: "1px solid #F3EFE3",
                cursor: "pointer",
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: INK, fontWeight: 600 }}>{l.title}</div>
                <div style={{ fontSize: 12.5, color: "#8A8275" }}>{l.date}</div>
              </div>
              <StatusPill status={l.status} />
            </div>
          ))}
        </Card>

        {/* Homework */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <CheckCircle2 size={18} color={ACCENT} />
            <div style={{ fontWeight: 700, color: INK, fontSize: 15 }}>जाँच्नुपर्ने गृहकार्य</div>
          </div>
          {HOMEWORK_PENDING.map((h) => (
            <div
              key={h.id}
              onClick={() => onGoHomework()}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "9px 0",
                borderTop: "1px solid #F3EFE3",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 14, color: INK }}>{h.title}</div>
              <div style={{ fontSize: 13, color: "#8A8275", fontWeight: 600 }}>{h.count} विद्यार्थी</div>
            </div>
          ))}
        </Card>

        {/* Assessments */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <NotebookPen size={18} color={ACCENT} />
            <div style={{ fontWeight: 700, color: INK, fontSize: 15 }}>मूल्याङ्कन बाँकी</div>
          </div>
          {ASSESSMENTS_PENDING.map((a) => (
            <div key={a.id} style={{ padding: "9px 0", borderTop: "1px solid #F3EFE3" }}>
              <div style={{ fontSize: 14, color: INK }}>{a.title}</div>
              <div style={{ fontSize: 12.5, color: "#8A8275" }}>{a.due}</div>
            </div>
          ))}
        </Card>

        {/* Recent materials */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <FileText size={18} color={ACCENT} />
            <div style={{ fontWeight: 700, color: INK, fontSize: 15 }}>भर्खरै खोलिएको</div>
          </div>
          {RECENT_MATERIALS.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 0",
                borderTop: "1px solid #F3EFE3",
                fontSize: 14,
                color: INK,
              }}
            >
              <FileText size={15} color={MARIGOLD} />
              {m.name}
            </div>
          ))}
        </Card>
      </div>

      {/* Upcoming chapters */}
      <SectionLabel>आगामी अध्यायहरू</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CHAPTERS.map((c) => (
          <Card key={c.id} style={{ padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: INK, fontSize: 15 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: "#8A8275", fontWeight: 600 }}>{c.progress}%</div>
            </div>
            <div style={{ height: 6, background: "#F0EBDD", borderRadius: 99 }}>
              <div
                style={{
                  height: 6,
                  width: `${c.progress}%`,
                  background: c.progress === 100 ? ACCENT : MARIGOLD,
                  borderRadius: 99,
                }}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Materials Library
// ---------------------------------------------------------------------------

function PreviewModal({ file, onClose }) {
  const meta = FILE_TYPE_META[file.type] || FILE_TYPE_META.doc;
  const Icon = meta.icon;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,18,14,0.55)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: 24,
          maxWidth: 420,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: meta.color + "1A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={24} color={meta.color} />
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }}
            aria-label="पूर्वावलोकन बन्द गर्नुहोस्"
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>
          {file.name}
        </div>
        <div style={{ fontSize: 13, color: "#8A8275", marginBottom: 16 }}>
          {file.chapter} · {file.size} · {file.date}
        </div>
        <div
          style={{
            background: "#FAF7EE",
            border: "1px dashed #E0D8C5",
            borderRadius: 12,
            padding: "36px 16px",
            textAlign: "center",
            color: "#A39B8B",
            fontSize: 13.5,
            marginBottom: 16,
          }}
        >
          फाइल पूर्वावलोकन यहाँ देखिनेछ — डाउनलोड बिना नै हेर्न मिल्छ।
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {file.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 12,
                background: "#F4EFE3",
                color: "#7A6F3E",
                padding: "4px 10px",
                borderRadius: 999,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Tag size={11} />
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Materials() {
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("सबै");
  const [preview, setPreview] = useState(null);

  const chapters = ["सबै", ...new Set(MATERIALS.map((m) => m.chapter))];

  const filtered = useMemo(() => {
    return MATERIALS.filter((m) => {
      const matchesChapter = chapterFilter === "सबै" || m.chapter === chapterFilter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        q === "" ||
        m.name.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        m.chapter.toLowerCase().includes(q);
      return matchesChapter && matchesQuery;
    });
  }, [query, chapterFilter]);

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 24,
          fontWeight: 600,
          color: INK,
          marginBottom: 4,
        }}
      >
        सामग्री पुस्तकालय
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 18 }}>
        सबै पाठ्यपुस्तक, निर्देशिका, कार्यपत्र र फाइलहरू अध्याय अनुसार मिलाइएको।
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#fff",
          border: "1px solid #ECE6D8",
          borderRadius: 14,
          padding: "12px 16px",
          marginBottom: 14,
        }}
      >
        <Search size={18} color="#A39B8B" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="फाइल, ट्याग वा अध्याय खोज्नुहोस्..."
          style={{
            border: "none",
            outline: "none",
            fontSize: 15,
            flex: 1,
            background: "transparent",
            color: INK,
            fontFamily: "'Inter', sans-serif",
          }}
        />
      </div>

      {/* Chapter filter chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18, paddingBottom: 4 }}>
        {chapters.map((c) => (
          <button
            key={c}
            onClick={() => setChapterFilter(c)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: chapterFilter === c ? ACCENT : "#fff",
              color: chapterFilter === c ? "#fff" : INK,
              fontWeight: 600,
              fontSize: 13,
              whiteSpace: "nowrap",
              cursor: "pointer",
              border: "1px solid " + (chapterFilter === c ? ACCENT : "#ECE6D8"),
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* File grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#8A8275", padding: "40px 0", fontSize: 14.5 }}>
          कुनै फाइल फेला परेन। अर्को शब्दले खोजी गर्नुहोस्।
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((f) => {
            const meta = FILE_TYPE_META[f.type] || FILE_TYPE_META.doc;
            const Icon = meta.icon;
            return (
              <Card key={f.id} onClick={() => setPreview(f)} style={{ padding: 16 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: meta.color + "1A",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 10,
                  }}
                >
                  <Icon size={20} color={meta.color} />
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: INK,
                    marginBottom: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </div>
                <div style={{ fontSize: 12, color: "#8A8275", marginBottom: 8 }}>
                  {f.chapter} · {f.size}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {f.tags.slice(0, 2).map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11,
                        background: "#F4EFE3",
                        color: "#7A6F3E",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: ACCENT,
                    fontWeight: 600,
                  }}
                >
                  <Eye size={13} />
                  पूर्वावलोकन
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}



// ---------------------------------------------------------------------------
// Question Bank + Assessment Builder
// ---------------------------------------------------------------------------

function QuestionBank() {
  const [query, setQuery] = useState("");
  const [chapterFilter, setChapterFilter] = useState("सबै");
  const [difficultyFilter, setDifficultyFilter] = useState("सबै");
  const [selected, setSelected] = useState([]);
  const [showSet, setShowSet] = useState(false);

  const chapters = ["सबै", ...new Set(QUESTIONS.map((q) => q.chapter))];
  const difficulties = ["सबै", "सजिलो", "मध्यम", "कठिन"];

  const filtered = useMemo(() => {
    return QUESTIONS.filter((q) => {
      const matchesChapter = chapterFilter === "सबै" || q.chapter === chapterFilter;
      const matchesDifficulty = difficultyFilter === "सबै" || q.difficulty === difficultyFilter;
      const q2 = query.trim().toLowerCase();
      const matchesQuery = q2 === "" || q.text.toLowerCase().includes(q2) || q.type.toLowerCase().includes(q2);
      return matchesChapter && matchesDifficulty && matchesQuery;
    });
  }, [query, chapterFilter, difficultyFilter]);

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedQuestions = QUESTIONS.filter((q) => selected.includes(q.id));

  return (
    <div style={{ padding: "20px 20px 120px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, marginBottom: 4 }}>
        प्रश्न बैंक
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 18 }}>
        अध्याय, प्रकार र कठिनाई अनुसार छानेर आफ्नो परीक्षा वा अभ्यास सेट बनाउनुहोस्।
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#fff",
          border: "1px solid #ECE6D8",
          borderRadius: 14,
          padding: "12px 16px",
          marginBottom: 14,
        }}
      >
        <Search size={18} color="#A39B8B" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="प्रश्न वा प्रकार खोज्नुहोस्..."
          style={{
            border: "none",
            outline: "none",
            fontSize: 15,
            flex: 1,
            background: "transparent",
            color: INK,
            fontFamily: "'Inter', sans-serif",
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 10, paddingBottom: 4 }}>
        {chapters.map((c) => (
          <button
            key={c}
            onClick={() => setChapterFilter(c)}
            style={{
              padding: "7px 13px",
              borderRadius: 999,
              background: chapterFilter === c ? ACCENT : "#fff",
              color: chapterFilter === c ? "#fff" : INK,
              fontWeight: 600,
              fontSize: 12.5,
              whiteSpace: "nowrap",
              cursor: "pointer",
              border: "1px solid " + (chapterFilter === c ? ACCENT : "#ECE6D8"),
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18, paddingBottom: 4 }}>
        {difficulties.map((d) => (
          <button
            key={d}
            onClick={() => setDifficultyFilter(d)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: difficultyFilter === d ? "#F4EFE3" : "#fff",
              color: difficultyFilter === d ? "#7A6F3E" : "#8A8275",
              fontWeight: 600,
              fontSize: 12,
              whiteSpace: "nowrap",
              cursor: "pointer",
              border: "1px solid #ECE6D8",
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Question list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((q) => {
          const isSelected = selected.includes(q.id);
          return (
            <Card key={q.id} onClick={() => toggle(q.id)} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ marginTop: 2, flexShrink: 0, color: isSelected ? ACCENT : "#C7BFAE" }}>
                {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, background: "#E4EFE6", color: ACCENT, padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                    {q.type}
                  </span>
                  <span style={{ fontSize: 11, background: "#F4EFE3", color: "#7A6F3E", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>
                    {q.difficulty}
                  </span>
                  <span style={{ fontSize: 11, color: "#A39B8B", padding: "3px 0", fontWeight: 600 }}>{q.chapter}</span>
                </div>
                <div style={{ fontSize: 15, color: INK, lineHeight: 1.5 }}>{q.text}</div>
                {q.options && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {q.options.map((o, i) => (
                      <div key={i} style={{ fontSize: 13.5, color: i === q.answer ? ACCENT : "#6B6557", fontWeight: i === q.answer ? 700 : 400 }}>
                        {String.fromCharCode(2453 + i)}) {o}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Floating build bar */}
      {selected.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 64,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            padding: "0 16px",
            zIndex: 20,
          }}
        >
          <button
            onClick={() => setShowSet(true)}
            style={{
              background: ACCENT,
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "13px 22px",
              fontWeight: 700,
              fontSize: 14.5,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(31,77,61,0.25)",
            }}
          >
            <Shuffle size={17} />
            {selected.length} प्रश्न सेट तयार गर्नुहोस्
          </button>
        </div>
      )}

      {showSet && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,18,14,0.55)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setShowSet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: 24,
              maxWidth: 600,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600 }}>तयार सेट</div>
              <button onClick={() => setShowSet(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }}>
                <X size={20} />
              </button>
            </div>
            <ol style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {selectedQuestions.map((q) => (
                <li key={q.id} style={{ fontSize: 14.5, color: INK, lineHeight: 1.5 }}>
                  {q.text}
                </li>
              ))}
            </ol>
            <button
              style={{
                marginTop: 20,
                width: "100%",
                background: MARIGOLD,
                color: "#2A1E07",
                border: "none",
                borderRadius: 12,
                padding: "13px",
                fontWeight: 700,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <Printer size={17} />
              प्रिन्ट गर्न तयार पार्नुहोस्
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssessmentBuilder() {
  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, marginBottom: 4 }}>
        मूल्याङ्कन निर्माता
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 20 }}>
        कक्षा ५ सम्म लिखित परीक्षा सीमित भएकाले, क्षमता आधारित मूल्याङ्कनमा ध्यान दिइएको छ।
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {ASSESSMENT_TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.id} onClick={() => {}}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "#E4EFE6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Icon size={20} color={ACCENT} />
              </div>
              <div style={{ fontWeight: 700, color: INK, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: "#8A8275" }}>{t.desc}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Teaching Assistant — answers only from uploaded materials.
// In this prototype, "uploaded materials" = the sample LESSONS/MATERIALS data.
// ---------------------------------------------------------------------------

const QUICK_PROMPTS = [
  "आजको पाठ बुझाउनुहोस्",
  "यो अध्याय संक्षेपमा भन्नुहोस्",
  "एक क्रियाकलाप सुझाव दिनुहोस्",
  "छलफलका प्रश्न बनाउनुहोस्",
  "मौखिक प्रश्न तयार गर्नुहोस्",
  "गाह्रो अवधारणा पहिचान गर्नुहोस्",
];

function generateAIReply(promptText) {
  const lesson = LESSONS[0]; // "today's lesson" in this prototype
  const p = promptText.trim();

  if (p.includes("आजको पाठ")) {
    return (
      `**${lesson.title}** (${lesson.chapter}) मा यी कुरा समावेश छन्:\n\n` +
      lesson.objectives.map((o) => `• ${o}`).join("\n") +
      `\n\nमुख्य शब्दावली: ${lesson.vocabulary.join(", ")}।\n\n` +
      `यो "${lesson.materials[0]}" र "${lesson.materials[1]}" मा आधारित छ — अपलोड गरिएको सामग्रीबाहेक केही थपिएको छैन।`
    );
  }
  if (p.includes("संक्षेप")) {
    return (
      `${lesson.chapter} अध्यायको संक्षेप (अपलोड गरिएको शिक्षक निर्देशिकाबाट):\n\n` +
      `यो अध्यायले वडा कार्यालय, यसका सेवाहरू, र स्थानीय सरकारको संरचना (नगरपालिका → वडा → घर) बारे पढाउँछ। विद्यार्थीले वडा कार्यालयबाट पाइने सेवाहरू र तिनको महत्त्व बुझ्नुपर्छ।`
    );
  }
  if (p.includes("क्रियाकलाप")) {
    return (
      `सुझाव गरिएको क्रियाकलाप (पाठ योजनामा भएकैबाट):\n\n` +
      lesson.activities.map((a, i) => `${i + 1}. ${a}`).join("\n")
    );
  }
  if (p.includes("छलफल")) {
    return `कक्षा छलफलका लागि प्रश्नहरू:\n\n` + lesson.keyQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  }
  if (p.includes("मौखिक")) {
    return (
      `मौखिक प्रश्नहरू (शब्दावली र उद्देश्यमा आधारित):\n\n` +
      lesson.vocabulary.map((v, i) => `${i + 1}. "${v}" को अर्थ के हो र एक उदाहरण दिनुहोस्।`).join("\n")
    );
  }
  if (p.includes("गाह्रो")) {
    return (
      `गत वर्षको टिप्पणी अनुसार गाह्रो अवधारणा:\n\n"${lesson.notes}"\n\n` +
      `सुझाव: डायग्राम पहिले देखाएर "वडा" र "कक्षा" बीचको फरक स्पष्ट पार्नुहोस्।`
    );
  }
  return `यो जानकारी अपलोड गरिएको सामग्रीमा फेला परेन। कृपया सम्बन्धित पाठ्यपुस्तक वा निर्देशिका सामग्री पुस्तकालयमा अपलोड गर्नुहोस्, त्यसपछि म त्यहीबाट उत्तर दिन्छु।`;
}

function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      role: "ai",
      text: "नमस्ते! म तपाईंको अपलोड गरिएको पाठ्यपुस्तक, निर्देशिका र पाठ योजनाबाट मात्र उत्तर दिन्छु। तलका छिटो प्रश्न प्रयोग गर्नुहोस् वा आफ्नै प्रश्न टाइप गर्नुहोस्।",
    },
  ]);
  const [input, setInput] = useState("");

  const send = (text) => {
    const t = text.trim();
    if (!t) return;
    setMessages((prev) => [...prev, { role: "user", text: t }, { role: "ai", text: generateAIReply(t) }]);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 73px)", maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <div style={{ padding: "16px 20px 8px" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, color: INK, display: "flex", alignItems: "center", gap: 8 }}>
          <Bot size={22} color={ACCENT} />
          एआई शिक्षण सहायक
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#8A8275", marginTop: 4 }}>
          <Lock size={12} />
          केवल अपलोड गरिएको सामग्रीबाट उत्तर दिइन्छ — बाहिरबाट केही थपिँदैन
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                background: m.role === "user" ? ACCENT : "#fff",
                color: m.role === "user" ? "#fff" : INK,
                border: m.role === "ai" ? "1px solid #ECE6D8" : "none",
                borderRadius: 16,
                padding: "12px 16px",
                fontSize: 14.5,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "10px 20px", display: "flex", gap: 8, overflowX: "auto" }}>
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            style={{
              flexShrink: 0,
              background: "#F4EFE3",
              color: "#7A6F3E",
              border: "none",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "10px 20px 20px",
          background: PAPER,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="आफ्नो प्रश्न लेख्नुहोस्..."
          style={{
            flex: 1,
            border: "1px solid #ECE6D8",
            borderRadius: 999,
            padding: "13px 18px",
            fontSize: 14.5,
            outline: "none",
            fontFamily: "'Inter', sans-serif",
            color: INK,
          }}
        />
        <button
          onClick={() => send(input)}
          style={{
            background: ACCENT,
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            width: 46,
            height: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="सोध्नुहोस्"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Homework Manager
// ---------------------------------------------------------------------------

function HomeworkManager() {
  const [records, setRecords] = useState(HOMEWORK_RECORDS);

  const bump = (id, delta) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, checked: Math.max(0, Math.min(r.total, r.checked + delta)) } : r))
    );
  };

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, marginBottom: 4 }}>
        गृहकार्य व्यवस्थापक
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 20 }}>
        प्रत्येक गृहकार्य पाठसँग जोडिएको — जाँच भएको संख्या ट्र्याक गर्नुहोस्।
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {records.map((r) => {
          const pct = Math.round((r.checked / r.total) * 100);
          const done = r.checked === r.total;
          return (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "#8A8275", fontWeight: 600, marginBottom: 3 }}>
                    {r.chapter} · {r.lesson} · {r.assignedDate}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: INK, fontFamily: "'Fraunces', serif" }}>
                    {r.title}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: done ? ACCENT : "#9A5B12",
                    background: done ? "#E4EFE6" : "#FBEBD3",
                    padding: "4px 10px",
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {r.checked}/{r.total} जाँच भयो
                </span>
              </div>

              <div style={{ height: 7, background: "#F0EBDD", borderRadius: 99, marginBottom: 12 }}>
                <div style={{ height: 7, width: `${pct}%`, background: done ? ACCENT : MARIGOLD, borderRadius: 99 }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <button
                  onClick={() => bump(r.id, -1)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid #ECE6D8",
                    background: "#fff",
                    fontSize: 18,
                    fontWeight: 700,
                    color: INK,
                    cursor: "pointer",
                  }}
                >
                  −
                </button>
                <div style={{ fontSize: 13.5, color: "#6B6557", fontWeight: 600 }}>थप विद्यार्थी जाँच गर्नुहोस्</div>
                <button
                  onClick={() => bump(r.id, 1)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "none",
                    background: ACCENT,
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>

              <div style={{ background: "#FAF7EE", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: "#6B6557" }}>
                {r.remark}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teaching Journal
// ---------------------------------------------------------------------------

const MOOD_META = {
  good: { icon: Smile, color: ACCENT, label: "राम्रो गयो" },
  okay: { icon: Meh, color: "#9A5B12", label: "ठीकै थियो" },
  hard: { icon: Frown, color: "#A23C2A", label: "गाह्रो थियो" },
};

function JournalForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ lesson: "", taught: "", difficulty: "", idea: "", mood: "good" });

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: INK, fontSize: 15, marginBottom: 12 }}>नयाँ टिप्पणी थप्नुहोस्</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          placeholder="आजको पाठ"
          value={form.lesson}
          onChange={(e) => setForm({ ...form, lesson: e.target.value })}
          style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "'Inter', sans-serif" }}
        />
        <textarea
          placeholder="के पढाइयो?"
          value={form.taught}
          onChange={(e) => setForm({ ...form, taught: e.target.value })}
          rows={2}
          style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "'Inter', sans-serif", resize: "vertical" }}
        />
        <textarea
          placeholder="विद्यार्थीलाई के गाह्रो भयो?"
          value={form.difficulty}
          onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
          rows={2}
          style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "'Inter', sans-serif", resize: "vertical" }}
        />
        <textarea
          placeholder="अर्को पटकका लागि सुधारको विचार"
          value={form.idea}
          onChange={(e) => setForm({ ...form, idea: e.target.value })}
          rows={2}
          style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "'Inter', sans-serif", resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(MOOD_META).map(([key, m]) => {
            const Icon = m.icon;
            const active = form.mood === key;
            return (
              <button
                key={key}
                onClick={() => setForm({ ...form, mood: key })}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 8px",
                  borderRadius: 10,
                  border: active ? `2px solid ${m.color}` : "1px solid #ECE6D8",
                  background: active ? m.color + "15" : "#fff",
                  color: m.color,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Icon size={15} />
                {m.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #ECE6D8", background: "#fff", color: "#6B6557", fontWeight: 600, cursor: "pointer" }}
          >
            रद्द गर्नुहोस्
          </button>
          <button
            onClick={() => form.lesson.trim() && onSave(form)}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            सुरक्षित गर्नुहोस्
          </button>
        </div>
      </div>
    </Card>
  );
}

function TeachingJournal() {
  const [entries, setEntries] = useState(JOURNAL_ENTRIES);
  const [showForm, setShowForm] = useState(false);

  const save = (form) => {
    setEntries((prev) => [
      { id: "j" + Date.now(), date: "आज", chapter: "", ...form },
      ...prev,
    ]);
    setShowForm(false);
  };

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, display: "flex", alignItems: "center", gap: 8 }}>
          <Heart size={22} color={ACCENT} />
          शिक्षण डायरी
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: ACCENT,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Plus size={15} />
            थप्नुहोस्
          </button>
        )}
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 20 }}>
        दैनिक प्रतिबिम्बन — के राम्रो भयो, के गाह्रो भयो, अर्को पटक के सुधार गर्ने।
      </div>

      {showForm && <JournalForm onSave={save} onCancel={() => setShowForm(false)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.map((e) => {
          const mood = MOOD_META[e.mood] || MOOD_META.okay;
          const MoodIcon = mood.icon;
          return (
            <Card key={e.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "#8A8275", fontWeight: 600 }}>{e.date}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: INK, fontFamily: "'Fraunces', serif" }}>{e.lesson}</div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: mood.color + "15",
                    color: mood.color,
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  <MoodIcon size={13} />
                  {mood.label}
                </div>
              </div>
              <div style={{ fontSize: 14, color: INK, marginBottom: 8, lineHeight: 1.55 }}>
                <strong>के पढाइयो:</strong> {e.taught}
              </div>
              {e.difficulty && (
                <div style={{ fontSize: 14, color: "#6B6557", marginBottom: 8, lineHeight: 1.55 }}>
                  <strong>गाह्रो भएको:</strong> {e.difficulty}
                </div>
              )}
              {e.idea && (
                <div style={{ background: "#F4EFE3", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, color: "#7A6F3E" }}>
                  💡 {e.idea}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teaching Activities Library
// ---------------------------------------------------------------------------

function ActivitiesLibrary() {
  const [typeFilter, setTypeFilter] = useState("सबै");
  const types = ["सबै", ...Object.keys(ACTIVITY_TYPE_META)];

  const filtered = ACTIVITIES.filter((a) => typeFilter === "सबै" || a.type === typeFilter);

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, marginBottom: 4 }}>
        क्रियाकलाप पुस्तकालय
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 18 }}>
        खेल, भूमिका अभिनय, प्रोजेक्ट र समूह कार्य — प्रत्येक पाठ र क्षमतासँग जोडिएको।
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18, paddingBottom: 4 }}>
        <button
          onClick={() => setTypeFilter("सबै")}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            background: typeFilter === "सबै" ? ACCENT : "#fff",
            color: typeFilter === "सबै" ? "#fff" : INK,
            fontWeight: 600,
            fontSize: 13,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: "1px solid " + (typeFilter === "सबै" ? ACCENT : "#ECE6D8"),
          }}
        >
          सबै
        </button>
        {Object.entries(ACTIVITY_TYPE_META).map(([key, m]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              background: typeFilter === key ? ACCENT : "#fff",
              color: typeFilter === key ? "#fff" : INK,
              fontWeight: 600,
              fontSize: 13,
              whiteSpace: "nowrap",
              cursor: "pointer",
              border: "1px solid " + (typeFilter === key ? ACCENT : "#ECE6D8"),
            }}
          >
            <m.icon size={14} />
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((a) => {
          const meta = ACTIVITY_TYPE_META[a.type];
          const Icon = meta.icon;
          return (
            <Card key={a.id}>
              <div style={{ display: "flex", gap: 14 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: meta.color + "1A",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} color={meta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 15.5, color: INK, fontFamily: "'Fraunces', serif" }}>
                      {a.title}
                    </div>
                    <span style={{ fontSize: 12, color: "#8A8275", fontWeight: 600, flexShrink: 0 }}>{a.duration}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: "#6B6557", lineHeight: 1.5, marginBottom: 8 }}>{a.desc}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, background: "#F4EFE3", color: "#7A6F3E", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>
                      {a.chapter}
                    </span>
                    <span style={{ fontSize: 11, background: "#E4EFE6", color: ACCENT, padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>
                      {a.competency}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resource Creator
// ---------------------------------------------------------------------------

function ResourceCreator() {
  const [active, setActive] = useState(null);

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Wand2 size={22} color={ACCENT} />
        स्रोत सामग्री निर्माता
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 20 }}>
        आजको पाठका आधारमा प्रिन्ट गर्न मिल्ने सामग्री बनाउनुहोस्।
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {RESOURCE_TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.id} onClick={() => setActive(t)}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "#E4EFE6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Icon size={20} color={ACCENT} />
              </div>
              <div style={{ fontWeight: 700, color: INK, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: "#8A8275", marginBottom: 10 }}>{t.desc}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: ACCENT, fontWeight: 700 }}>
                बनाउनुहोस्
                <ChevronRight size={14} />
              </div>
            </Card>
          );
        })}
      </div>

      {active && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,18,14,0.55)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setActive(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 18, padding: 24, maxWidth: 460, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600 }}>{active.title}</div>
              <button onClick={() => setActive(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: "#8A8275", marginBottom: 12 }}>
              "वडा कार्यालयको भूमिका" पाठका आधारमा तयार पारिएको
            </div>
            <div
              style={{
                background: "#FAF7EE",
                border: "1px solid #ECE6D8",
                borderRadius: 12,
                padding: 16,
                fontSize: 14,
                color: INK,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                marginBottom: 16,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {active.sample}
            </div>
            <button
              style={{
                width: "100%",
                background: MARIGOLD,
                color: "#2A1E07",
                border: "none",
                borderRadius: 12,
                padding: "13px",
                fontWeight: 700,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <Printer size={17} />
              प्रिन्ट गर्न तयार पार्नुहोस्
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document Search — searches across all materials, lessons, and questions.
// ---------------------------------------------------------------------------

function DocumentSearch() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [];
    const fromMaterials = MATERIALS.filter(
      (m) => m.name.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)) || m.chapter.toLowerCase().includes(q)
    ).map((m) => ({ kind: "सामग्री", title: m.name, sub: m.chapter, icon: (FILE_TYPE_META[m.type] || FILE_TYPE_META.doc).icon, color: (FILE_TYPE_META[m.type] || FILE_TYPE_META.doc).color }));

    const fromLessons = LESSONS.filter(
      (l) => l.title.toLowerCase().includes(q) || l.chapter.toLowerCase().includes(q) || l.vocabulary.some((v) => v.toLowerCase().includes(q))
    ).map((l) => ({ kind: "पाठ योजना", title: l.title, sub: l.chapter, icon: ClipboardList, color: ACCENT }));

    const fromQuestions = QUESTIONS.filter((qq) => qq.text.toLowerCase().includes(q) || qq.chapter.toLowerCase().includes(q)).map((qq) => ({
      kind: "प्रश्न बैंक",
      title: qq.text,
      sub: qq.chapter + " · " + qq.type,
      icon: HelpCircle,
      color: "#6B3FA0",
    }));

    const fromActivities = ACTIVITIES.filter((a) => a.title.toLowerCase().includes(q) || a.chapter.toLowerCase().includes(q)).map((a) => ({
      kind: "क्रियाकलाप",
      title: a.title,
      sub: a.chapter,
      icon: ACTIVITY_TYPE_META[a.type].icon,
      color: ACTIVITY_TYPE_META[a.type].color,
    }));

    return [...fromLessons, ...fromMaterials, ...fromQuestions, ...fromActivities];
  }, [query]);

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, marginBottom: 4 }}>
        सबैतिर खोज्नुहोस्
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 18 }}>
        पाठ योजना, सामग्री, प्रश्न र क्रियाकलाप — सबैभित्र एकैचोटि खोज्नुहोस्।
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "#fff",
          border: "1px solid #ECE6D8",
          borderRadius: 14,
          padding: "13px 16px",
          marginBottom: 18,
        }}
      >
        <Search size={18} color="#A39B8B" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="जे पनि खोज्नुहोस् — वडा, नक्सा, गृहकार्य..."
          style={{ border: "none", outline: "none", fontSize: 15.5, flex: 1, background: "transparent", color: INK, fontFamily: "'Inter', sans-serif" }}
        />
      </div>

      {query.trim() === "" ? (
        <div style={{ textAlign: "center", color: "#A39B8B", padding: "40px 0", fontSize: 14 }}>
          टाइप गर्न सुरु गर्नुहोस् — परिणाम तुरुन्तै देखिनेछ।
        </div>
      ) : results.length === 0 ? (
        <div style={{ textAlign: "center", color: "#8A8275", padding: "40px 0", fontSize: 14.5 }}>
          "{query}" सँग मिल्ने केही फेला परेन।
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <Card key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: r.color + "1A",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} color={r.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: r.color, fontWeight: 700, marginBottom: 2 }}>{r.kind}</div>
                  <div style={{ fontSize: 14.5, color: INK, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8A8275" }}>{r.sub}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function CalendarView() {
  const grouped = useMemo(() => {
    const map = {};
    CALENDAR_ITEMS.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return map;
  }, []);

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: INK, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <CalendarDays size={22} color={ACCENT} />
        पात्रो
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 20 }}>
        पाठ तालिका, गृहकार्य र मूल्याङ्कनका अनुस्मारक एकै ठाउँमा।
      </div>

      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} style={{ marginBottom: 20 }}>
          <SectionLabel>{date}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((item) => {
              const meta = CALENDAR_TYPE_META[item.type];
              return (
                <Card key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: meta.color,
                      background: meta.bg,
                      padding: "4px 9px",
                      borderRadius: 6,
                      flexShrink: 0,
                    }}
                  >
                    {meta.label}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, color: INK, fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 12.5, color: "#8A8275" }}>{item.chapter}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Planner({ onOpenLesson }) {
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(
    () => LESSONS.filter((l) => filter === "all" || l.chapter === filter),
    [filter]
  );
  const chapters = ["all", ...new Set(LESSONS.map((l) => l.chapter))];

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 24,
          fontWeight: 600,
          color: INK,
          marginBottom: 4,
        }}
      >
        पाठ योजना
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 20 }}>
        दैनिक पाठहरू, अध्याय, सामग्री र गृहकार्यसँग जोडिएको।
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18, paddingBottom: 4 }}>
        {chapters.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: filter === c ? ACCENT : "#fff",
              color: filter === c ? "#fff" : INK,
              fontWeight: 600,
              fontSize: 13,
              whiteSpace: "nowrap",
              cursor: "pointer",
              border: "1px solid " + (filter === c ? ACCENT : "#ECE6D8"),
            }}
          >
            {c === "all" ? "सबै अध्याय" : c}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((l) => (
          <Card key={l.id} onClick={() => onOpenLesson(l)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12.5, color: "#8A8275", fontWeight: 600, marginBottom: 3 }}>
                  {l.chapter} · {l.date}
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 600, color: INK, fontFamily: "'Fraunces', serif" }}>
                  {l.title}
                </div>
              </div>
              <StatusPill status={l.status} />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {l.materials.slice(0, 3).map((m) => (
                <span
                  key={m}
                  style={{
                    fontSize: 11.5,
                    background: "#F4EFE3",
                    color: "#7A6F3E",
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const [activeLesson, setActiveLesson] = useState(null);

  const nav = [
    { id: "dashboard", label: "आज", icon: Home },
    { id: "ai", label: "एआई", icon: Bot },
    { id: "planner", label: "योजना", icon: CalendarDays },
    { id: "materials", label: "सामग्री", icon: BookOpen },
  ];
  const navMore = [
    { id: "search", label: "खोज", icon: Search },
    { id: "calendar", label: "पात्रो", icon: CalendarDays },
    { id: "questions", label: "प्रश्न बैंक", icon: HelpCircle },
    { id: "assessment", label: "मूल्याङ्कन", icon: NotebookPen },
    { id: "homework", label: "गृहकार्य", icon: ListChecks },
    { id: "journal", label: "डायरी", icon: Heart },
    { id: "activities", label: "क्रियाकलाप", icon: Gamepad2 },
    { id: "resources", label: "स्रोत निर्माता", icon: Wand2 },
  ];
  const allNav = [...nav, ...navMore];
  const [showMore, setShowMore] = useState(false);

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        background: PAPER,
        minHeight: "100vh",
        color: INK,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>

      {/* Top bar */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #ECE6D8",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: ACCENT,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Fraunces', serif",
            fontWeight: 700,
          }}
        >
          सि
        </div>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>शिक्षा साथी</div>
          <div style={{ fontSize: 11.5, color: "#8A8275" }}>कक्षा ५ · सामाजिक अध्ययन</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: ACCENT, fontWeight: 600 }}>
          <Clock size={14} />
          सिंक भएको
        </div>
      </div>

      {/* Desktop side nav + content, mobile bottom nav */}
      <div style={{ display: "flex" }}>
        <div
          className="side-nav"
          style={{
            width: 200,
            padding: "20px 12px",
            display: "none",
          }}
        >
          {allNav.map((n) => {
            const Icon = n.icon;
            const active = screen === n.id;
            return (
              <div
                key={n.id}
                onClick={() => setScreen(n.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: active ? "#E4EFE6" : "transparent",
                  color: active ? ACCENT : "#6B6557",
                  fontWeight: 600,
                  fontSize: 14.5,
                  cursor: "pointer",
                  marginBottom: 4,
                }}
              >
                <Icon size={18} />
                {n.label}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {screen === "dashboard" && (
            <Dashboard
              onOpenLesson={setActiveLesson}
              onGoPlanner={() => setScreen("planner")}
              onGoHomework={() => setScreen("homework")}
            />
          )}
          {screen === "planner" && <Planner onOpenLesson={setActiveLesson} />}
          {screen === "materials" && <Materials />}
          {screen === "ai" && <AIAssistant />}
          {screen === "questions" && <QuestionBank />}
          {screen === "assessment" && <AssessmentBuilder />}
          {screen === "homework" && <HomeworkManager />}
          {screen === "journal" && <TeachingJournal />}
          {screen === "search" && <DocumentSearch />}
          {screen === "calendar" && <CalendarView />}
          {screen === "activities" && <ActivitiesLibrary />}
          {screen === "resources" && <ResourceCreator />}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderTop: "1px solid #ECE6D8",
          display: "flex",
          justifyContent: "flex-start",
          overflowX: "auto",
          padding: "8px 4px",
          zIndex: 10,
        }}
      >
        {nav.map((n) => {
          const Icon = n.icon;
          const active = screen === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setScreen(n.id)}
              style={{
                background: "none",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                color: active ? ACCENT : "#A39B8B",
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              <Icon size={20} />
              {n.label}
            </button>
          );
        })}
        <button
          onClick={() => setShowMore(true)}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            color: navMore.some((n) => n.id === screen) ? ACCENT : "#A39B8B",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
            padding: "4px 8px",
            flexShrink: 0,
          }}
        >
          <Layers size={20} />
          थप
        </button>
      </div>

      {showMore && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,18,14,0.55)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setShowMore(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: 20,
              maxWidth: 480,
              width: "100%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600 }}>थप विशेषताहरू</div>
              <button onClick={() => setShowMore(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {navMore.map((n) => {
                const Icon = n.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      setScreen(n.id);
                      setShowMore(false);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "14px 6px",
                      borderRadius: 14,
                      border: "1px solid #ECE6D8",
                      background: screen === n.id ? "#E4EFE6" : "#fff",
                      color: screen === n.id ? ACCENT : INK,
                      cursor: "pointer",
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  >
                    <Icon size={22} />
                    {n.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeLesson && <LessonMode lesson={activeLesson} onClose={() => setActiveLesson(null)} />}

      <style>{`
        @media (min-width: 860px) {
          .side-nav { display: block !important; }
        }
      `}</style>
    </div>
  );
}
