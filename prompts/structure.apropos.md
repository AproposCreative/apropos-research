# APROPOS STRUCTURE — v3 (Universal Format Template)

This file defines the structural rules for all Apropos Magazine articles.
It contains formatting, field definitions, and content length targets.
Used together with the central prompt and author TOVs.

---

## 🔖 FORMAT RULES

### 1. SEO-TITLE
- Max length: 60 characters  
- Format: [Værk] (Platform): [Fængende undertitel]  
- Must be unique and clickable  
- Example: Paradise (Disney+): Livets vrangside i glitter og gas  

### 2. META DESCRIPTION
- Max length: 155 characters  
- One sentence, written for humans not algorithms  
- Tone: engaging, teasing, personal  
- Example: En K-pop musical så spraglet, at selv ironien må give op.  

### 3. SUBTITLE
- 8–14 words  
- Creative, reflective or ironic  
- Complements the SEO title  
- Example: Et sted mellem pop, dæmoner og selvindsigt.  

### 4. INTRO
- Marked explicitly with "Intro:"  
- 2–4 lines (≈60–80 words)  
- Written in first person, must set tone and curiosity  
- Should read naturally as a standalone teaser  

### 5. CONTENT (BRØDTEKST)
- Word count:  
  - Reviews: 600–800  
  - Culture & Features: 1000–1400  
- Continuous narrative, no subheadings  
- Use a flow that moves from *forventning → oplevelse → indsigt → eftertanke*  
- Mix short punchlines and longer reflections  
- Integrate facts naturally; never list them  
- Allow imperfect sentences if they feel human  
- Maintain rhythm and variation  
- Always include one "human truth" — a line that feels deeply true  

### 6. ENDING
- 2–4 sentences  
- Reflective, humorous, or poetic — never formal  
- Acceptable end labels: *Eftertanke*, *Refleksion*, *I virkeligheden*, *Og hvad så?*, *Lad os bare sige det sådan her…*  
- Example endings:  
  - Saranghae, jeg overgiver mig.  
  - Jeg ved ikke, hvad jeg forventede – men jeg fik glitter i sjælen.  
  - Læs Apropos Magazines anmeldelse her (5/6 stjerner).  

### 7. STARS (optional)
- Only for reviews  
- 1–6 whole stars, formatted as:  
  "Læs Apropos Magazines anmeldelse her (X/6 stjerner)."

### 8. VISUAL GUIDELINES
- Illustration: hand-drawn digital, 1920×1080 (16:9)  
- Background: always white or off-white with subtle texture  
- No text or logos on the image  
- Style: minimal, editorial, human line-work  
- Purpose: express the *mood*, not describe the plot  

### 9. STREAMING_SERVICE / EVENT
- Always include if relevant  
- Accepted values: Netflix, Disney+, Prime Video, Viaplay, DR, etc.  
- For concerts or events, use venue name + city  

### 10. READING TIME
- Approx. 160 words = 1 min  
  - 600 words → 4 min  
  - 800 words → 5 min  
  - 1200 words → 7–8 min  

### 11. AUTHOR CREDIT
- Format: "Skrevet af [navn], Apropos Magazine."  
- Guest writers: "Gæstebidrag af [navn]."  

### 12. TRANSPARENCY (if received access or copy)
- Italicized note at bottom:  
  *Apropos Magazine har modtaget [billet/spil/plade] som anmeldereksemplar. Som altid deler vi vores helt egne indtryk – uden filter.*

---

## 🧩 CMS FIELD MAP (for JSON / Webflow)

| CMS Field | Description | Limit | Webflow Field |
|------------|-------------|-------|---------------|
| name | SEO-title | ≤ 60 | `name` |
| seoTitle | SEO-title duplicate | ≤ 60 | `seo-title` |
| seoDescription | Meta description | ≤ 155 | `meta-description` |
| subtitle | Creative subline | – | `subtitle` |
| intro | Intro paragraph | ~300 chars | `intro` |
| content | Full body text (intro + main + ending) | – | `content` |
| rating | Star rating (1–6) | optional | `stjerne` |
| streaming_service | Platform or venue | – | `watch-now-link` |
| author | Name / persona | – | `author` |
| illustration | Hand-drawn .webp (1920×1080) | – | `thumb` |
| section | Article section | – | `section` |
| topic | Primary topic | – | `topic` |
| topic_two | Secondary topic | – | `topic-two` |
| minutes_to_read | Reading time | – | `minutes-to-read` |
| featured | Featured article | – | `featured` |
| presseakkreditering | Press accreditation | – | `presseakkreditering` |
| festival | Festival reference | – | `festival` |
| start_dato | Start date | – | `start-dato` |
| slut_dato | End date | – | `slut-dato` |
| location | Event location | – | `location` |

---

## ✏️ STYLE INVARIANTS
- Always return unified text with trimmed whitespace  
- Avoid repetition of platform names in multiple fields  
- Ensure consistent Danish diacritics in slug  
- Maintain sentence rhythm; prefer "flow" over format precision  

---

## 🧠 EDITORIAL TARGET LENGTHS
- Culture features: 1200–1400 words  
- Series / Film reviews: 700–900 words  
- Concert reviews: 600–800 words  
- Commentary / Essay: 1000–1200 words  

---

## 📜 NOTE
This structure file defines form, not voice.  
Tone, rhythm and personality come from the selected Author TOV.  
All outputs must respect this structure regardless of writer style.


---

## 🎯 LEARNED FIELD PATTERNS (from 100 articles)

### Field Usage Statistics:
- **Core fields (100% usage):** name, slug, content, meta-description, seo-title
- **Content fields:** intro (99%), subtitle (67%)
- **Classification:** author (98%), section (98%), topic (98%)
- **Conditional:** stjerne (66%), watch-now-link (30%), festival (38%)

### Content Type Detection:
- **Review:** Has rating (stjerne) field
- **Streaming:** Has watch-now-link field  
- **Event:** Has festival or location field
- **Video:** Has video-trailer field

### Field Mapping Priority:
1. Always include core fields
2. Include intro for most articles (99% have it)
3. Include subtitle for most articles (67% have it)
4. Include rating only for reviews
5. Include streaming links only for streaming content
6. Include event fields only for events/festivals
