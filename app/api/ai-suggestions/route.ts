import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text, context, type } = await request.json();

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ suggestions: [] });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ 
        suggestions: [
          "Hvis du vil have flere detaljer, kan du uddybe dette punkt.",
          "Overvej at tilføje et eksempel for at illustrere din pointe.",
          "Du kunne også inkludere en citat eller reference her."
        ]
      });
    }

    let prompt = '';
    
    switch (type) {
      case 'improve':
        prompt = `Baseret på denne tekst, giv 3 konkrete forslag til forbedring i Apropos Magazines stil (Martin Kongstad x Casper Christensen tone):

Tekst: "${text}"

Kontekst: ${context || 'Generel artikel'}

Giv kun forslagene, ikke forklaringer.`;
        break;
      
      case 'continue':
        prompt = `Fortsæt denne tekst i Apropos Magazines stil (Martin Kongstad x Casper Christensen tone). Giv 3 forskellige muligheder for hvordan teksten kan fortsætte:

Tekst: "${text}"

Kontekst: ${context || 'Generel artikel'}

Giv kun forslagene, ikke forklaringer.`;
        break;
      
      case 'expand':
        prompt = `Udvid denne tekst med flere detaljer og dybde i Apropos Magazines stil (Martin Kongstad x Casper Christensen tone). Giv 3 forslag til hvordan teksten kan udvides:

Tekst: "${text}"

Kontekst: ${context || 'Generel artikel'}

Giv kun forslagene, ikke forklaringer.`;
        break;
      
      default:
        prompt = `Giv 3 kreative forslag til hvordan denne tekst kan forbedres i Apropos Magazines stil (Martin Kongstad x Casper Christensen tone):

Tekst: "${text}"

Kontekst: ${context || 'Generel artikel'}

Giv kun forslagene, ikke forklaringer.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Du er en ekspert redaktør for Apropos Magazine. Din tone er inspireret af Martin Kongstad og Casper Christensen - personlig, skarp, ærlig og humoristisk uden at blive teknisk eller tør. Du giver korte, præcise forslag til forbedring af tekst."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || '';
    
    // Split response into individual suggestions
    const suggestions = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.match(/^\d+[\.\)]/)) // Remove numbered lists
      .filter(line => line.length > 10 && line.length < 200) // Filter reasonable length
      .slice(0, 3); // Take max 3 suggestions

    return NextResponse.json({ suggestions });

  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    
    // Fallback suggestions
    const fallbackSuggestions = [
      "Overvej at tilføje flere detaljer til dette punkt.",
      "Du kunne inkludere et personligt eksempel her.",
      "Hvad med at tilføje en overraskende vinkel?"
    ];
    
    return NextResponse.json({ suggestions: fallbackSuggestions });
  }
}
