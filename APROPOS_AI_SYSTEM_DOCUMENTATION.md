# APROPOS MAGAZINE - AI SYSTEM DOCUMENTATION (Updated)

## **📋 SYSTEM OVERBLIK**

Apropos Magazine bruger et sofistikeret AI-drevet system til at generere journalistiske artikler med unik tone of voice (TOV). Systemet kombinerer SetupWizard konfiguration, AI-generering, kvalitetskontrol og automatisk Webflow CMS publishing.

**Redaktionel Filosofi:** "Transformér, ikke kopier" - AI som redaktionel kollega, ikke erstatning.

---

## **🏗️ ARKITEKTUR & KOMPONENTER**

### **1. FRONTEND KOMPONENTER**

#### **SetupWizard (`components/SetupWizard.tsx`)**
- **Formål:** Konfigurerer artikel parametre før generering
- **Steps:** Template → Source → Trending → Inspiration → Analysis → Author → Section → Topic → Platform → Rating → Press
- **Data:** Henter authors, sections, topics, streaming services fra Webflow API
- **Output:** `ArticleData` objekt med alle konfigurationer

#### **AIWriterClient (`app/ai/AIWriterClient.tsx`)**
- **Formål:** Hovedkomponent der koordinerer artikel generering
- **Funktioner:** 
  - Chat interface med AI
  - Real-time artikel preview
  - Auto-save funktionalitet
  - Integration med SetupWizard

#### **MainChatPanel (`app/ai/MainChatPanel.tsx`)**
- **Formål:** Chat interface hvor brugeren interagerer med AI
- **Funktioner:**
  - Message editing og copying
  - Hover effects for timestamps
  - Real-time artikel updates

#### **WebflowPublishPanel (`components/WebflowPublishPanel.tsx`)**
- **Formål:** Publisering til Webflow CMS
- **Funktioner:**
  - Preflight checks
  - Field validation
  - Direct Webflow API integration

---

### **2. BACKEND API ENDPOINTS**

#### **AI Chat (`app/api/ai-chat/route.ts`)**
- **Formål:** Hoved-API for artikel generering
- **Workflow:** Research → Generate → Quality Check → Enhance
- **Features:**
  - Author TOV loading fra Webflow
  - Web search integration
  - Iterative revision loop
  - Word count validation (1000+ ord)
  - JSON response format
  - **Performance Monitoring:** Tracks alle pipeline stages

#### **Research Engine (`app/api/research-engine/route.ts`)**
- **Formål:** Multi-source research pipeline
- **Sources:** News data, cultural context, expert opinions, trends, factual data
- **Output:** Comprehensive research summary med key findings

#### **Content Enhancer (`app/api/content-enhancer/route.ts`)**
- **Formål:** Advanced enhancement pipeline
- **Stages:** Research → Structure → TOV → Cultural Context → Readability
- **Sequential processing** hvor hver stage bygger på den forrige

#### **Quality Check (`app/api/quality-check/route.ts`)**
- **Formål:** Multi-dimensional quality analysis
- **Checks:** Factual accuracy, bias detection, readability, structure, TOV consistency
- **Output:** Overall score og recommendations

#### **Webflow Integration**
- **Authors API (`app/api/webflow/authors/route.ts`)**
- **Publish API (`app/api/webflow/publish/route.ts`)**
- **Field Mapping (`lib/webflow-mapping.ts`)**

---

### **3. PROMPT SYSTEM**

#### **Central Prompt (`prompts/apropos_writer.prompt`)**
- **Formål:** Hovedsystem prompt for AI
- **Indhold:**
  - Magazine stance og TOV regler
  - **Redaktionelt Manifest (ChatGPT Enhanced):**
    - "At teknologien skal skrive som et menneske — ikke som en maskine"
    - "Vi tror ikke på AI som erstatning, men som forstærker"
    - "Transformér, ikke kopier — redaktionel oversættelse, ikke maskin-output"
  - JSON output contract
  - Author profiler (Frederik Kragh, Liv Brandt, Eva Linde, etc.)
  - Integration guidelines

#### **Structure Definition (`prompts/structure.apropos.md`)**
- **Formål:** Definerer artikel struktur og format regler
- **Indhold:**
  - SEO title format (60 chars)
  - Meta description (155 chars)
  - Intro format ("Intro:" label, 2-4 linjer)
  - Content word counts (1000-1400 ord)
  - Ending labels (Eftertanke, Refleksion, etc.)
  - CMS mapping rules

#### **Author TOV Files (`data/author-prompts/`)**
- **Formål:** Individuelle tone of voice definitions
- **Format:** `.txt` filer med specifikke instruktioner per forfatter

---

### **4. DATA MANAGEMENT**

#### **Webflow Service (`lib/webflow-service.ts`)**
- **Formål:** Integration med Webflow CMS
- **Functions:**
  - `getWebflowAuthors()` - Henter forfattere med TOV
  - `publishArticleToWebflow()` - Publiserer artikler
  - `resolveSectionIdFromName()` - Resolverer section/topic IDs

#### **Article Types (`types/article.ts`)**
- **Formål:** TypeScript definitions for artikel data
- **Interfaces:** `ArticleData`, `WebflowArticleFields`, etc.

#### **Cache System (`lib/cache.ts`)**
- **Formål:** API response caching
- **TTL:** Different cache periods for different data types

#### **Performance Monitor (`lib/performance-monitor.ts`)**
- **Formål:** Tracks performance across alle pipeline stages
- **Features:**
  - Stage timing og success rates
  - Bottleneck identification
  - Detailed logging og reporting
  - Metadata tracking

---

## **🔄 ARTIKEL GENERERINGS WORKFLOW**

### **Phase 1: Setup & Configuration**
1. **SetupWizard** konfigurerer artikel parametre
2. **Author selection** loader TOV fra Webflow
3. **Section/Topic** valg definerer artikel type
4. **Platform/Rating** sætter tone og længde targets

### **Phase 2: Research & Context**
1. **Web search** hvis nødvendigt (reviews, specific subjects)
2. **Research engine** samler multi-source data
3. **Context building** fra articleData og notes

### **Phase 3: AI Generation**
1. **System prompt** konstrueres med:
   - Central prompt + structure + author TOV
   - **Redaktionelt Manifest** for filosofi-adhæsion
   - Word count targets (1000-1400 ord)
   - Chunked generation strategy
   - SetupWizard data integration

2. **OpenAI API call** med:
   - Model: `gpt-4o`
   - Max tokens: 6000 (drastisk øget)
   - Temperature: 0.7
   - JSON response format

### **Phase 4: Quality Control**
1. **Iterative revision loop** (max 3 attempts)
2. **Length validation** (minimum word count)
3. **Structure validation** (Intro:, ending labels)
4. **Similarity check** (avoid note copying)

### **Phase 5: Enhancement**
1. **Content enhancer** pipeline
2. **TOV strengthening**
3. **Cultural context addition**
4. **Readability optimization**

### **Phase 6: Publishing**
1. **Field mapping** til Webflow format
2. **Preflight checks** og validation
3. **Webflow API** publishing
4. **Success/error** feedback

---

## **🎯 KEY FEATURES**

### **Advanced Prompt Engineering**
- **Dynamic prompt construction** med author TOV
- **Chunked generation strategy** for længere artikler
- **Word count enforcement** med aggressive instruktioner
- **Structure validation** med specific format requirements
- **Redaktionelt Manifest** integration for filosofi-adhæsion

### **Multi-Model Architecture**
- **Research engine** for factual accuracy
- **Content enhancer** for quality improvement
- **Quality checker** for multi-dimensional analysis
- **TOV specialist** for author consistency

### **Webflow Integration**
- **Real-time author loading** med TOV data
- **Automatic field mapping** til CMS format
- **Reference resolution** for sections/topics
- **Publishing pipeline** med error handling

### **Quality Assurance**
- **Iterative revision** med length validation
- **Citation tracking** for factual claims
- **TOV consistency** checks
- **Structure compliance** validation

### **Performance Monitoring**
- **Pipeline stage tracking** med timing
- **Success rate monitoring** per stage
- **Bottleneck identification** for optimization
- **Detailed logging** med metadata

---

## **📊 CURRENT ISSUES & SOLUTIONS**

### **Problem: Short Articles (308 words instead of 1000+)**
**Solutions Implemented:**
- Increased `max_tokens` from 3000 to 6000
- Added chunked generation strategy
- Implemented aggressive length instructions
- Added iterative revision loop

### **Problem: Author TOV Not Being Used**
**Solutions Implemented:**
- Enhanced TOV loading from Webflow
- Added debug logging for TOV verification
- Improved author data caching
- Better TOV integration in system prompt

### **Problem: Streaming Service Mapping**
**Solutions Implemented:**
- Fixed mapping to use `streaming-service` field
- Cleared Next.js cache
- Updated field mapping configuration

---

## **🔧 TECHNICAL STACK**

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, OpenAI GPT-4o
- **Database:** Webflow CMS, Firebase (caching)
- **Deployment:** Vercel
- **AI Models:** GPT-4o for generation, multiple specialized models for enhancement
- **Monitoring:** Custom performance monitor med detailed metrics

---

## **🚀 FUTURE IMPROVEMENTS (ChatGPT Recommendations)**

### **Phase 1: Core Improvements (Implemented)**
- ✅ **Editorial Manifest Integration** - Filosofi-adhæsion i system prompt
- ✅ **Performance Monitoring** - Detailed pipeline tracking

### **Phase 2: Quality Enhancements (Planned)**
- **Redaktionel Oversættelse** - Transformér research data til redaktionel vinkel
- **Four Parameter Quality** - Form, Sprog, Fakta, TOV validation
- **Semantic Distance Measurement** - Plagiat-detection og parafrasering

### **Phase 3: Advanced Features (Planned)**
- **Enhanced Quality Control Loop** - Automatisk regenerering ved fejl
- **Research Transformation Engine** - Kontekstuel transformation af kilder
- **TOV Consistency Checker** - Validerer forfatterens stemme

### **Phase 4: Optimization (Planned)**
- **Dynamic Behavior Optimization** - Længdemål, rating injektion
- **Error Handling Improvement** - Bedre fejlbeskrivelser og recovery
- **Factual Accuracy Engine** - Krydstjekning på tværs af kilder

### **Phase 5: Future Readiness (Planned)**
- **White-label Preparation** - Abstraher Apropos-specifikke elementer
- **LLM Training Readiness** - Forbered til egen LLM træning

---

## **📈 PERFORMANCE METRICS**

### **Pipeline Stages Tracked:**
1. **ai-chat-request** - Initial request processing
2. **web-search** - Research data gathering
3. **ai-generation** - OpenAI API call
4. **quality-control** - Content validation
5. **response-formatting** - Final response preparation

### **Key Metrics:**
- **Total Duration** - End-to-end processing time
- **Success Rate** - Percentage of successful stages
- **Average Stage Duration** - Performance baseline
- **Bottlenecks** - Stages taking longer than 1.5x average
- **Quality Issues** - Number of validation problems
- **Word Count** - Final article length
- **Citations Count** - Number of sources used

---

Dette system repræsenterer en avanceret tilgang til AI-drevet journalistik med fokus på kvalitet, konsistens og integration med moderne CMS systemer. Den modulære arkitektur gør det nemt at vedligeholde og udvide systemet, mens performance monitoring sikrer optimal drift.
