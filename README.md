# शिक्षा साथी (Sikshya Sathi)

कक्षा ५ सामाजिक अध्ययन शिक्षकका लागि व्यक्तिगत शिक्षण सहायक प्रणाली।

## स्थानीय रूपमा चलाउने तरिका

```bash
npm install
npm run dev
```

ब्राउजरमा `http://localhost:5173` खोल्नुहोस्।

## Production build

```bash
npm run build
npm run preview
```

## Vercel मा डिप्लोय गर्ने

1. यो फोल्डर GitHub repository मा push गर्नुहोस्
2. https://vercel.com मा "Import Project" गरी त्यो repository छान्नुहोस्
3. **Framework Preset**: Vite (auto-detect हुनुपर्छ)
4. **Root Directory**: `./` (default राख्नुहोस्)
5. Environment Variables मा (पछि Supabase जोड्दा):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. "Deploy" थिच्नुहोस्

विस्तृत निर्देशनका लागि `SETUP_GUIDE.md` हेर्नुहोस्।

## हालको अवस्था

यो प्रोटोटाइप संस्करण हो — सबै डाटा (पाठ, सामग्री, प्रश्न, गृहकार्य, डायरी) ब्राउजरको मेमोरीमा मात्र छ र पेज रिफ्रेश गर्दा हराउँछ। वास्तविक प्रयोगका लागि Supabase डाटाबेस जोड्नुपर्छ — `supabase-schema.sql` र `storage-policies.sql` फाइलहरू त्यसका लागि तयार छन्।

## फोल्डर संरचना

```
sikshya-sathi/
├── src/
│   ├── App.jsx        ← मुख्य एप (सबै स्क्रिन)
│   ├── main.jsx        ← React entry point
│   └── index.css       ← आधारभूत स्टाइल
├── public/
│   └── manifest.json   ← PWA सेटिङ
├── index.html
├── package.json
├── vite.config.js
└── .env.local.example  ← Supabase जोड्दा यसबाट .env.local बनाउनुहोस्
```
