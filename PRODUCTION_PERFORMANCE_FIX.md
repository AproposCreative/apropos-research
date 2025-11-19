# Production Performance Fix Guide

## Problem
Live version på ai.aproposmagazine.com er ekstremt langsom og fejler, mens localhost virker fint.

## Mulige Årsager

### 1. Vercel Plan Limitation (MEST SANDSYNLIG)
**Problem:** `maxDuration = 300` (5 minutter) kræver **Vercel Pro plan**.
- **Hobby plan** har max 10 sekunder timeout
- Dette ville forklare hvorfor API kald fejler i production

**Løsning:**
1. Tjek din Vercel plan i dashboard
2. Hvis du har Hobby plan, skal du enten:
   - Opgradere til Pro plan, ELLER
   - Ændre `maxDuration` til 10 i `app/api/ai-chat/route.ts`

```typescript
// For Hobby plan:
export const maxDuration = 10; // Max 10 seconds for Hobby plan

// For Pro plan:
export const maxDuration = 300; // 5 minutes for Pro plan
```

### 2. Environment Variables Mangler
**Tjek i Vercel Dashboard → Settings → Environment Variables:**

Kontroller at disse er sat:
- `OPENAI_API_KEY` - KRITISK for AI funktionalitet
- `WEBFLOW_API_TOKEN` - For Webflow integration
- `WEBFLOW_SITE_ID` - For Webflow integration
- `NEXT_PUBLIC_BASE_URL` - Sæt til `https://ai.aproposmagazine.com` (valgfrit, auto-detekteres)

### 3. Cold Start Problemer
Vercel serverless functions kan have cold starts på 1-3 sekunder.
- Dette er normalt, men kan føles langsomt
- Efter første request er funktionen "varm" og hurtigere

### 4. Research Pipeline for Langsom
Research pipeline kører altid i production, selv for simple beskeder.

**Løsning:** Brug "Fast mode" i UI'en - det springer research over.

## Quick Fix Checklist

1. ✅ **Tjek Vercel Plan**
   - Gå til Vercel Dashboard → Settings → Plan
   - Hvis Hobby: Opgrader til Pro ELLER ændre maxDuration til 10

2. ✅ **Tjek Environment Variables**
   - Vercel Dashboard → Settings → Environment Variables
   - Verificer at `OPENAI_API_KEY` er sat korrekt

3. ✅ **Tjek Vercel Logs**
   - Vercel Dashboard → Deployments → Vælg seneste deployment → Logs
   - Se efter timeout fejl eller API key fejl

4. ✅ **Test med Fast Mode**
   - I UI'en, skift til "Fast mode" i stedet for "Editorial"
   - Dette springer research over og er meget hurtigere

## Debugging Steps

### 1. Tjek Vercel Logs
```bash
# Gå til Vercel Dashboard → Deployments → Logs
# Se efter:
# - "Function execution exceeded timeout"
# - "OpenAI API key missing"
# - "Connection timeout"
```

### 2. Test API Direkte
```bash
curl -X POST https://ai.aproposmagazine.com/api/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hej"}'
```

### 3. Tjek Network Tab i Browser
- Åbn DevTools → Network
- Se hvor lang tid API kaldet tager
- Se om det timeout'er eller fejler

## Nuværende Optimeringer

Vi har allerede implementeret:
- ✅ Skip research for simple beskeder (hej, ok, tak)
- ✅ Caching af Webflow schema (5 min cache)
- ✅ Timeout handling (15s for simple, 90s for complex)
- ✅ Fast mode support (springer research over)

## Anbefalet Løsning

1. **Opgrader til Vercel Pro** (anbefalet)
   - Giver 300 sekunder timeout
   - Bedre performance
   - Ingen begrænsninger

2. **ELLER: Brug Fast Mode**
   - Skift til "Fast mode" i UI'en
   - Spring research over
   - Meget hurtigere response

3. **ELLER: Reducer maxDuration**
   - Hvis du skal blive på Hobby plan
   - Ændre til `maxDuration = 10`
   - Men dette vil begrænse komplekse requests

