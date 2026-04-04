'use client';
import type { ArticleData } from '@/types/article';
import { stripIntroDuplicateFromBody } from '@/lib/article-intro-strip';
import { useState } from 'react';

interface PreviewPanelProps {
  articleData: ArticleData;
  onUpdateArticle: (updates: Partial<ArticleData>) => void;
}

export default function PreviewPanel({ articleData, onUpdateArticle }: PreviewPanelProps) {
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const introText = (articleData.intro || '').replace(/^intro\s*:\s*/i, '');
  const rawArticleContent = articleData.content || '';
  const bodyPreview =
    introText.trim().length > 0
      ? stripIntroDuplicateFromBody(introText, rawArticleContent)
      : rawArticleContent;

  const renderStars = (rating: number) => {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  return (
    <div className="h-full bg-white overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-black text-xl font-medium font-['Poppins']">
          Artikelpreview
        </h2>
        <p className="text-gray-600 text-sm mt-1">
          Live preview af din artikel
        </p>
      </div>

      {/* Article Preview */}
      <div className="p-6 max-w-4xl mx-auto">
        {/* Category Tag */}
        <div className="mb-4 flex justify-end">
          <span className="inline-block bg-black text-white text-xs px-3 py-1 rounded-full font-medium">
            {articleData.category || 'Serier & Film'}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-black mb-4 font-['Poppins'] leading-tight">
          {articleData.title || 'Alien: Earth'}
        </h1>

        {/* Subtitle */}
        <h2 className="text-xl text-gray-700 mb-6 font-['Poppins'] leading-relaxed">
          {articleData.subtitle || 'Alien er tilbage. Og du kommer til at holde vejret hele vejen.'}
        </h2>

         {/* Meta Info */}
         <div className="flex items-center gap-4 mb-8 text-sm text-gray-600">
           <span className="font-medium">{articleData.author || 'Casper Fiil'}</span>
           <span>|</span>
           <span>Anmeldelser</span>
           <span>|</span>
           <span>TV-serier</span>
           <span className="text-yellow-500">★★★★★</span>
           <span>|</span>
           <span className="bg-gray-100 px-2 py-1 rounded text-xs">Disney+</span>
           <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">Stream nu</span>
           <span className="bg-gray-100 px-2 py-1 rounded text-xs">Billetter</span>
         </div>

        {introText && (
          <div className="mb-8">
            <div className="uppercase text-xs tracking-[0.3em] text-gray-400 mb-2">Intro</div>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
              {introText}
            </p>
          </div>
        )}

        {/* Featured Image */}
        {articleData.featuredImage ? (
          <div className="space-y-4">
            <div className="w-full h-64 rounded-lg overflow-hidden border border-gray-200 relative group">
              <img 
                src={articleData.featuredImage} 
                alt={articleData.title || 'Artikel billede'}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <button
                  onClick={async () => {
                    if (isGeneratingImage) return;
                    setIsGeneratingImage(true);
                    setImageProgress(0);
                    
                    try {
                      console.log('🎨 Generating new image for article:', articleData.title);
                      
                      // Simulate progress steps
                      const progressSteps = [
                        { step: 'Forbereder prompt...', progress: 20 },
                        { step: 'Genererer billede...', progress: 60 },
                        { step: 'Behandler billede...', progress: 90 },
                        { step: 'Færdig!', progress: 100 }
                      ];
                      
                      let currentStep = 0;
                      const progressInterval = setInterval(() => {
                        if (currentStep < progressSteps.length) {
                          setImageProgress(progressSteps[currentStep].progress);
                          currentStep++;
                        }
                      }, 800);
                      
                      // Extract topic from tags or use category
                      const topic = (articleData.tags && articleData.tags.length > 0) 
                        ? articleData.tags[0] 
                        : articleData.category || 'Generel';
                      
                      const requestData = {
                        title: articleData.title || 'Artikel',
                        topic: topic,
                        author: articleData.author || 'Redaktionen',
                        category: articleData.category || 'Kultur',
                        section: articleData.section,
                        platform: articleData.platform || articleData.streaming_service,
                        streaming_service: articleData.streaming_service,
                        content: articleData.content || '',
                        rating: articleData.rating || 0
                      };
                      
                      console.log('🎨 Request data:', requestData);
                      
                      const response = await fetch('/api/generate-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestData)
                      });
                      
                      clearInterval(progressInterval);
                      setImageProgress(100);
                      
                      console.log('🎨 Response status:', response.status);
                      
                      if (response.ok) {
                        const data = await response.json();
                        console.log('🎨 Response data:', data);
                        
                        if (data.success && data.imageUrl) {
                          console.log('✅ New image generated successfully, updating article data');
                          onUpdateArticle({ featuredImage: data.imageUrl });
                        } else {
                          console.error('❌ Image generation failed:', data.error);
                          alert('Billedgenerering fejlede: ' + (data.error || 'Ukendt fejl'));
                        }
                      } else {
                        const errorData = await response.json().catch(() => ({}));
                        console.error('❌ API error:', response.status, errorData);
                        alert('Billedgenerering fejlede: ' + (errorData.error || 'Server fejl'));
                      }
                    } catch (error) {
                      console.error('❌ Error generating new image:', error);
                      alert('Billedgenerering fejlede: ' + error.message);
                    } finally {
                      setIsGeneratingImage(false);
                      setTimeout(() => setImageProgress(0), 1000);
                    }
                  }}
                  disabled={isGeneratingImage}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                    isGeneratingImage 
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/50 animate-pulse' 
                      : 'bg-white/90 text-black hover:bg-white'
                  }`}
                >
                  {isGeneratingImage && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 animate-pulse"></div>
                  )}
                  <span className="relative z-10">{isGeneratingImage ? '⏳' : '🎨'}</span>
                  <span className="relative z-10">
                    {isGeneratingImage ? `Genererer... ${imageProgress}%` : 'Generer nyt billede'}
                  </span>
                  {isGeneratingImage && (
                    <div className="absolute bottom-0 left-0 h-1 bg-white/30 w-full">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300 ease-out"
                        style={{ width: `${imageProgress}%` }}
                      ></div>
                    </div>
                  )}
                </button>
              </div>
            </div>
            
            {/* Visible Generate New Image Button */}
            <div className="text-center">
              <button
                onClick={async () => {
                  if (isGeneratingImage) return;
                  setIsGeneratingImage(true);
                  setImageProgress(0);
                  
                  try {
                    console.log('🎨 Generating new image for article:', articleData.title);
                    
                    // Simulate progress steps
                    const progressSteps = [
                      { step: 'Forbereder prompt...', progress: 20 },
                      { step: 'Genererer billede...', progress: 60 },
                      { step: 'Behandler billede...', progress: 90 },
                      { step: 'Færdig!', progress: 100 }
                    ];
                    
                    let currentStep = 0;
                    const progressInterval = setInterval(() => {
                      if (currentStep < progressSteps.length) {
                        setImageProgress(progressSteps[currentStep].progress);
                        currentStep++;
                      }
                    }, 800);
                    
                    // Extract topic from tags or use category
                    const topic = (articleData.tags && articleData.tags.length > 0) 
                      ? articleData.tags[0] 
                      : articleData.category || 'Generel';
                    
                    const requestData = {
                      title: articleData.title || 'Artikel',
                      topic: topic,
                      author: articleData.author || 'Redaktionen',
                      category: articleData.category || 'Kultur',
                      content: articleData.content || ''
                    };
                    
                    console.log('🎨 Request data:', requestData);
                    
                    const response = await fetch('/api/generate-image', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(requestData)
                    });
                    
                    clearInterval(progressInterval);
                    setImageProgress(100);
                    
                    console.log('🎨 Response status:', response.status);
                    
                    if (response.ok) {
                      const data = await response.json();
                      console.log('🎨 Response data:', data);
                      
                      if (data.success && data.imageUrl) {
                        console.log('✅ New image generated successfully, updating article data');
                        onUpdateArticle({ featuredImage: data.imageUrl });
                      } else {
                        console.error('❌ Image generation failed:', data.error);
                        alert('Billedgenerering fejlede: ' + (data.error || 'Ukendt fejl'));
                      }
                    } else {
                      const errorData = await response.json().catch(() => ({}));
                      console.error('❌ API error:', response.status, errorData);
                      alert('Billedgenerering fejlede: ' + (errorData.error || 'Server fejl'));
                    }
                  } catch (error) {
                    console.error('❌ Error generating new image:', error);
                    alert('Billedgenerering fejlede: ' + error.message);
                  } finally {
                    setIsGeneratingImage(false);
                    setTimeout(() => setImageProgress(0), 1000);
                  }
                }}
                disabled={isGeneratingImage}
                className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 mx-auto relative overflow-hidden ${
                  isGeneratingImage 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/50 animate-pulse' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isGeneratingImage && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 animate-pulse"></div>
                )}
                <span className="relative z-10">{isGeneratingImage ? '⏳' : '🎨'}</span>
                <span className="relative z-10">
                  {isGeneratingImage ? `Genererer... ${imageProgress}%` : 'Generer nyt billede'}
                </span>
                {isGeneratingImage && (
                  <div className="absolute bottom-0 left-0 h-1 bg-white/30 w-full">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300 ease-out"
                      style={{ width: `${imageProgress}%` }}
                    ></div>
                  </div>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-64 bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg mb-4 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">📷</div>
              <p className="text-sm">Featured image</p>
            </div>
          </div>
        )}

        {/* Generate Image Button */}
        {!articleData.featuredImage && (
          <div className="mb-8 text-center">
            <button
              onClick={async () => {
                if (isGeneratingImage) return;
                setIsGeneratingImage(true);
                setImageProgress(0);
                
                try {
                  console.log('🎨 Generating image for article:', articleData.title);
                  
                  // Simulate progress steps
                  const progressSteps = [
                    { step: 'Forbereder prompt...', progress: 20 },
                    { step: 'Genererer billede...', progress: 60 },
                    { step: 'Behandler billede...', progress: 90 },
                    { step: 'Færdig!', progress: 100 }
                  ];
                  
                  let currentStep = 0;
                  const progressInterval = setInterval(() => {
                    if (currentStep < progressSteps.length) {
                      setImageProgress(progressSteps[currentStep].progress);
                      currentStep++;
                    }
                  }, 800);
                  
                  // Extract topic from tags or use category
                  const topic = (articleData.tags && articleData.tags.length > 0) 
                    ? articleData.tags[0] 
                    : articleData.category || 'Generel';
                  
                  const requestData = {
                    title: articleData.title || 'Artikel',
                    topic: topic,
                    author: articleData.author || 'Redaktionen',
                    category: articleData.category || 'Kultur',
                    content: articleData.content || ''
                  };
                  
                  console.log('🎨 Request data:', requestData);
                  
                  const response = await fetch('/api/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                  });
                  
                  clearInterval(progressInterval);
                  setImageProgress(100);
                  
                  console.log('🎨 Response status:', response.status);
                  
                  if (response.ok) {
                    const data = await response.json();
                    console.log('🎨 Response data:', data);
                    
                    if (data.success && data.imageUrl) {
                      console.log('✅ Image generated successfully, updating article data');
                      onUpdateArticle({ featuredImage: data.imageUrl });
                    } else {
                      console.error('❌ Image generation failed:', data.error);
                      alert('Billedgenerering fejlede: ' + (data.error || 'Ukendt fejl'));
                    }
                  } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('❌ API error:', response.status, errorData);
                    alert('Billedgenerering fejlede: ' + (errorData.error || 'Server fejl'));
                  }
                } catch (error) {
                  console.error('❌ Error generating image:', error);
                  alert('Billedgenerering fejlede: ' + error.message);
                } finally {
                  setIsGeneratingImage(false);
                  setTimeout(() => setImageProgress(0), 1000);
                }
              }}
              disabled={isGeneratingImage}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 mx-auto relative overflow-hidden ${
                isGeneratingImage 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/50 animate-pulse' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isGeneratingImage && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-600/20 animate-pulse"></div>
              )}
              <span className="relative z-10">{isGeneratingImage ? '⏳' : '🎨'}</span>
              <span className="relative z-10">
                {isGeneratingImage ? `Genererer... ${imageProgress}%` : 'Generer artikel billede'}
              </span>
              {isGeneratingImage && (
                <div className="absolute bottom-0 left-0 h-1 bg-white/30 w-full">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300 ease-out"
                    style={{ width: `${imageProgress}%` }}
                  ></div>
                </div>
              )}
            </button>
          </div>
        )}

        {/* Article Content */}
        <div className="prose prose-lg max-w-none">
          <div className="text-gray-500 text-sm mb-4">
            Læser nu: {articleData.title || 'Alien: Earth'}
          </div>
          
           {bodyPreview.trim() ? (
             <div className="whitespace-pre-wrap text-gray-900 leading-relaxed">
               {bodyPreview}
             </div>
           ) : (
             <div className="text-gray-900 leading-relaxed">
               <p className="mb-4">
                 Jeg ville egentlig have afskrevet hele Alien-franchisen for længst. Det er svært ikke at miste troen, når noget, man elsker, bliver pillet ved igen og igen, som et gammelt sår, der aldrig får ro. Men Alien: Earth gør noget, jeg ikke troede muligt: Den får mig til at tro på det mørke igen.
               </p>
               
               {/* Star Rating */}
               <div className="mb-6 flex items-center gap-2">
                 <span className="text-sm text-gray-600">En stjerne</span>
                 <span className="text-sm text-gray-600">To stjerner</span>
                 <span className="text-sm text-gray-600">Tre stjerner</span>
                 <span className="text-sm text-gray-600">Fire stjerner</span>
                 <span className="text-sm text-gray-600">Fem stjerner</span>
                 <span className="text-sm text-gray-600">Seks stjerner</span>
               </div>
               
               <p className="mb-4">
                 Alien-universet er en af de få filmfranchises, hvor selv de dårlige kapitler har bid. Ridley Scotts original fra 1979 var isnende, banebrydende, uafrystelig. James Camerons opfølger i '86 var måske mindre subtil, men effektiv på sin egen, højoktane måde. Derefter begyndte det at smuldre. <em>Alien 3</em> var David Finchers vision, der blev kvalt i studieindblanding. <em>Resurrection</em> var… noget med kloner og franske kamerabevægelser. Og så kom <em>Alien vs. Predator</em>, og det var som at se nogen bruge ens barndomsminder som bordskånere.
               </p>
               
               <p className="mb-4">
                 Senere fik vi <em>Prometheus</em> og <em>Covenant</em>. Ambitiøse, men splittende. Personligt synes jeg, <em>Prometheus</em> var smuk sci-fi med identitetsproblemer. Den prøvede at være både filosofisk og gory – og blev lidt forvirret undervejs. Men den prøvede i det mindste noget. Det samme gælder <em>Covenant</em>. Og nu har vi <em>Alien: Earth</em> – et nyt forsøg i serieformat. Den største overraskelse er måske, at det faktisk fungerer.
               </p>
               
               <p className="mb-4">
                 Fra første afsnit mærker man det: Der er tænkt over det her. Stemningen er tæt, mørk og fuld af den gamle paranoia. Det føles som Alien, ikke bare som noget, der vil ligne Alien. Serien tør være langsom. Den tør lade stilheden tale. Og vigtigst af alt: Den tør tage sig selv alvorligt uden at blive selvhøjtidelig.
               </p>
               
               <p className="mb-4">
                 Man mærker hurtigt, at vi er tilbage i et univers, hvor der er konsekvenser. Hvor døden ikke er en billig plot-enhed, men en reel risiko. Serien balancerer mellem det snigende og det eksplosive. Den vælger det første oftest, og det klæder den. Det handler ikke om jump-scares eller blodsprøjt – det handler om at sidde med en knude i maven og vente på, at noget bevæger sig i mørket.
               </p>
               
               <p className="mb-4">
                 Men tempoet kan også give udfordringer. Enkelte episoder føles som om de opbygger uden at forløse. Som om man hele tiden står lige på kanten af afgrunden – uden at blive skubbet. Det kan være frustrerende, især når man som seer forventer payoff. Der mangler nogle gange det sidste tryk, den der fornemmelse af, at skruen drejes lige én omgang mere. Serien vælger i stedet at lade frygten ulme. Det fungerer oftest. Men ikke altid.
               </p>
               
               <p className="mb-4">
                 Der er dog et klart højdepunkt: Afsnittet "In space, no one…" – et afsnit, der i sig selv retfærdiggør hele serien. Det kondenserer alt, hvad der gør Alien-universet særligt: klaustrofobien, lydene, mørket, stilheden. Der er næsten noget poetisk over det. Her bliver serien mere end bare et genoplivningsforsøg – den bliver et statement. Det er det bedste, vi har fået fra franchisen siden <em>Aliens</em>. Ingen tvivl.
               </p>
               
               <p className="mb-4">
                 Skuespillet er en af seriens største styrker. Timothy Olyphant er som skabt til roller med autoritet, og han bruger sin tilstedeværelse klogt. Han overspiller aldrig. Han lader blikket og pauserne gøre arbejdet. Babou Ceesay er en af de mest undervurderede skuespillere i øjeblikket, og her får han endelig plads. Han balancerer rationel handlekraft med emotionel dybde på en måde, der giver hans karakter en sjælden troværdighed.
               </p>
               
               <p className="mb-4">
                 Og så er der Sydney Chandler. Jeg vidste ikke, hvem hun var, før jeg så denne serie, men hun er seriens puls. Der er en energi og en nerve i hendes spil, der gør hende umulig at ignorere. Hun er ikke bare "den unge", hun er katalysator for store følelser – frygt, vrede, omsorg – alt sammen med få midler. Serien ville være fattigere uden hende.
               </p>
               
               <p className="mb-4">
                 Noget andet, der virkelig fungerer, er brugen af effekter – eller rettere: den måde de <strong>ikke</strong> bruges på. Vi er vant til, at sci-fi i dag betyder CGI-overload og spektakel for spektaklets skyld. <em>Alien: Earth</em> går den modsatte vej. Her bruges CGI med omtanke. Det er praktisk, grimt og ægte. Lyset flimrer. Væggene er fugtige. Man mærker stedet. Og Xenomorphen? Den er tilbage som den skal være: skræmmende, uforudsigelig og bedst, når man næsten ikke ser den.
               </p>
               
               <p className="mb-4">
                 Det føles som om serien har forstået én vigtig ting: Det, vi ikke ser, er ofte det mest skræmmende. Og det er her, den vinder sin respekt. Den insisterer på, at gyset ikke handler om chok – men om atmosfære.
               </p>
               
               <p className="mb-4">
                 Hvis der er en reel kritik, udover tempoet, så er det, at <em>Alien: Earth</em> føles som begyndelsen på noget større. Det er ikke nødvendigvis en dårlig ting, men det efterlader os med en fornemmelse af, at vi kun har set første akt. Serien holder igen – og det gør den måske lidt for meget. Vi sidder tilbage og venter på sæson 2 for at få svar. Det er frustrerende. For når det er så godt, vil man have mere. Nu.
               </p>
               
               <p className="mb-4">
                 Men det ændrer ikke på helhedsindtrykket. <em>Alien: Earth</em> er årets største sci-fi-overraskelse. Den føles som et kærligt, men kompromisløst gensyn med et univers, mange havde opgivet. Den tør være tro mod originalmaterialet, samtidig med at den introducerer nye perspektiver. Den balancerer det gamle og det nye – uden at please nogen unødigt. Og det er måske det bedste, man kan sige om den.
               </p>
               
               <p className="mb-4 font-medium">
                 <strong>Lad os bare sige det sådan her:</strong>
               </p>
               
               <p className="mb-4">
                 Det her er ikke bare endnu en streaming-serie. Det er en seriøs genreproduktion, der ved, hvad den vil – og tør holde fast i det. Hvis resten af serien følger samme kurs, har vi måske endelig fået et nyt kapitel i Alien-historien, der kan måle sig med de gamle. En sjældenhed i en franchise, der ellers har været mere død end levende.
               </p>
               
               <div className="mt-8 pt-4 border-t border-gray-200">
                 <p className="font-medium">{articleData.author || 'Casper Fiil'}</p>
                 <p className="text-sm text-gray-600">Anmelder & skribent</p>
               </div>
               
               <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                 <p><strong>Disclaimer:</strong> Apropos Magazine deltog i arrangementet med presseakkreditering fra arrangøren.</p>
               </div>
             </div>
           )}

          {/* Rating */}
          {articleData.rating && articleData.rating > 0 && (
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <p className="text-lg font-medium mb-2">Bedømmelse</p>
              <p className="text-2xl text-yellow-500">
                {renderStars(articleData.rating)}
              </p>
            </div>
          )}
        </div>

         {/* Related Articles */}
         <div className="mt-12 pt-8 border-t border-gray-200">
           <h3 className="text-lg font-semibold mb-6">Relaterede artikler</h3>
           <div className="space-y-4">
             <div className="flex items-start gap-4">
               <div className="w-20 h-12 bg-gray-200 rounded flex-shrink-0"></div>
               <div>
                 <p className="font-medium text-sm">Untamed (Netflix)</p>
                 <p className="text-xs text-gray-600">TV-serier • Casper Fiil</p>
               </div>
             </div>
             <div className="flex items-start gap-4">
               <div className="w-20 h-12 bg-gray-200 rounded flex-shrink-0"></div>
               <div>
                 <p className="font-medium text-sm">The Bear - Season 4</p>
                 <p className="text-xs text-gray-600">Anmeldelser • Casper Fiil</p>
               </div>
             </div>
             <div className="flex items-start gap-4">
               <div className="w-20 h-12 bg-gray-200 rounded flex-shrink-0"></div>
               <div>
                 <p className="font-medium text-sm">28 Years Later: Zombie-trilogiens ambitiøse, filosofiske finale</p>
                 <p className="text-xs text-gray-600">Anmeldelser • Eva Linde</p>
               </div>
             </div>
             <div className="flex items-start gap-4">
               <div className="w-20 h-12 bg-gray-200 rounded flex-shrink-0"></div>
               <div>
                 <p className="font-medium text-sm">Du så How to Train Your Dragon i IMAX og mærkede vinden under vingerne</p>
                 <p className="text-xs text-gray-600">Film • Peter Milo</p>
               </div>
             </div>
           </div>
           <div className="mt-6">
             <button className="text-blue-600 text-sm hover:underline">
               Se flere
             </button>
           </div>
         </div>

         {/* Tags */}
         {articleData.tags.length > 0 && (
           <div className="mt-8 pt-6 border-t border-gray-200">
             <div className="flex flex-wrap gap-2">
               {articleData.tags.map((tag, index) => (
                 <span
                   key={index}
                   className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
                 >
                   #{tag}
                 </span>
               ))}
             </div>
           </div>
         )}
      </div>

      {/* Quick Edit Panel */}
      <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg p-4 shadow-lg max-w-sm">
        <h3 className="font-medium mb-3">Quick Edit</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Titel</label>
            <input
              type="text"
              value={articleData.title}
              onChange={(e) => onUpdateArticle({ title: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded text-sm"
              placeholder="Artikel titel..."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Undertitel</label>
            <input
              type="text"
              value={articleData.subtitle}
              onChange={(e) => onUpdateArticle({ subtitle: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded text-sm"
              placeholder="Artikel undertitel..."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Kategori</label>
            <select
              value={articleData.category}
              onChange={(e) => onUpdateArticle({ category: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded text-sm"
            >
              <option value="">Vælg kategori...</option>
              <option value="Gaming">Gaming</option>
              <option value="Film">Film</option>
              <option value="Serier">Serier</option>
              <option value="Musik">Musik</option>
              <option value="Kultur">Kultur</option>
              <option value="Nyheder">Nyheder</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Rating</label>
            <select
              value={articleData.rating || 0}
              onChange={(e) => onUpdateArticle({ rating: parseInt(e.target.value) })}
              className="w-full p-2 border border-gray-300 rounded text-sm"
            >
              <option value={0}>Ingen rating</option>
              <option value={1}>★☆☆☆☆</option>
              <option value={2}>★★☆☆☆</option>
              <option value={3}>★★★☆☆</option>
              <option value={4}>★★★★☆</option>
              <option value={5}>★★★★★</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
