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
- Marked explicitly with “Intro:”  
- 2–4 lines (≈60–80 words)  
- Written in first person, must set tone and curiosity  
- Should read naturally as a standalone teaser  

### 5. CONTENT (BRØDTEKST)
- Word count:  
  - Koncertanmeldelser: 700–900  
  - Film/serie/gaming/tech-anmeldelser: 900–1100  
  - Øvrige anmeldelser: 1100–1300  
  - Kultur & features / portrætter / interviews: 1200–1500  
  - Essays & kommentarer: 1100–1300  
- Continuous narrative, no subheadings  
- Use a flow that moves from *forventning → oplevelse → indsigt → eftertanke*  
- Mix short punchlines and longer reflections  
- Integrate facts naturally; never list them  
- Allow imperfect sentences if they feel human  
- Maintain rhythm and variation  
- Always include one “human truth” — a line that feels deeply true  

### 6. ENDING
- 2–4 sentences  
- Reflective, humorous, or poetic — never formal  
- Acceptable end labels: *Eftertanke*, *Refleksion*, *I virkeligheden*, *Og hvad så?*, *Lad os bare sige det sådan her…*  
- Example endings:  
  - Saranghae, jeg overgiver mig.  
  - Jeg ved ikke, hvad jeg forventede – men jeg fik glitter i sjælen.  
  - Fem stjerner, men stadig plads til eftertanke.  

### 7. STARS (optional)
- Only for reviews  
- 1–6 whole stars, formatted as:  
  “X ud af 6 stjerner.”

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
- Format: “Skrevet af [navn], Apropos Magazine.”  
- Guest writers: “Gæstebidrag af [navn].”  

### 12. TRANSPARENCY (if received access or copy)
- Italicized note at bottom:  
  *Apropos Magazine har modtaget [billet/spil/plade] som anmeldereksemplar. Som altid deler vi vores helt egne indtryk – uden filter.*


---

## ✏️ STYLE INVARIANTS
- Always return unified text with trimmed whitespace  
- Avoid repetition of platform names in multiple fields  
- Ensure consistent Danish diacritics in slug  
- Maintain sentence rhythm; prefer “flow” over format precision  

---

## 🧠 EDITORIAL TARGET LENGTHS
- Culture features / portrætter: 1200–1500 ord  
- Serie / film / gaming / tech anmeldelser: 900–1100 ord  
- Koncert anmeldelser: 700–900 ord  
- Kommentar / essay: 1100–1300 ord  

---

## 📜 NOTE
This structure file defines form, not voice.  
Tone, rhythm and personality come from the selected Author TOV.  
All outputs must respect this structure regardless of writer style.

---

## 📦 CMS MAPPING RULES (derived from training data)

Required Webflow slugs (must be present):
- name, slug, content, meta-description, seo-title

Conditional fields:
- Reviews: stjerne (rating)
- Streaming content: watch-now-link, unique-watch-now-title
- Events: festival, location, start-dato, buy-tickets
- Video: video-trailer

Canonical mapping (internal → Webflow slug):
- name → name
- seoTitle → seo-title
- seoDescription → meta-description
- subtitle → subtitle
- intro → intro
- content → content
- rating → stjerne
- streaming_service → watch-now-link
- author → author (reference)
- illustration → thumb
- section → section
- topic → topic
- topic_two → topic-two
- minutes_to_read → minutes-to-read
- featured → featured
- presseakkreditering → presseakkreditering
- festival → festival
- start_dato → start-dato
- slut_dato → slut-dato
- location → location

Notes:
- Generate slug when setting title (kebab-case; Danish diacritics preserved then normalized).
- Keep seo-title ≤ 60 chars; meta-description ≤ 155 chars.
- Only include rating/stjerne for reviews. Only include streaming/event fields when relevant.
